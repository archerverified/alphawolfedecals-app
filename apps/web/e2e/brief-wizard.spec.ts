// Goal 5 (B2C-002+) E2E: the guided design-brief wizard on the seeded Transit.
// Runs in TWO modes (same contract as mvp-flow.spec.ts):
//  - local dev: fresh signup via the dev-otp peek;
//  - deployed targets (the production smoke): the pre-seeded SMOKE_CUSTOMER
//    account — green-skips when the creds are absent (no prod backdoor).
// The smoke customer's projects all live on the Transit, so repeated runs
// never consume a second free-plan vehicle slot (B2C-011).
//
// Covers: wizard loads from the editor entry point, zones default to full wrap
// and toggle off, style prompt + material persist via per-step autosave,
// resume restores both the data AND the step, Review saves a numbered brief
// version and routes back to the editor.

import * as path from 'path';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, signIn, uniqueEmail } from './support/flows';
import { cleanupCreatedProjects } from './support/cleanup';

const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';

const HAS_SEEDED_CUSTOMER = Boolean(
  process.env.SMOKE_CUSTOMER_EMAIL && process.env.SMOKE_CUSTOMER_PASSWORD,
);

function isRemoteTarget(): boolean {
  const url = process.env.DEPLOY_URL;
  if (!url) return false;
  const { hostname } = new URL(url);
  return !['localhost', '127.0.0.1', '::1'].includes(hostname);
}

// 64×64 solid-red PNG with NO alpha channel — trips the B2C-004 quality gate
// twice: opaque (solid background) AND low DPI (64px across a van panel).
const OPAQUE_PNG = path.resolve(__dirname, 'fixtures/opaque-logo.png');

async function createProject(page: Page): Promise<string> {
  await page.goto(`/vehicles/${SEEDED_VEHICLE_ID}`);
  await page.getByTestId('start-project-cta').click();
  await page.getByTestId('start-project-submit').click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/);
  const m = page.url().match(/\/projects\/([0-9a-f-]+)\/editor/);
  if (!m) throw new Error('did not land in editor');
  return m[1] as string;
}

test.describe('Goal 5 brief wizard', () => {
  test.skip(
    isRemoteTarget() && !HAS_SEEDED_CUSTOMER,
    'Against a deployed target set SMOKE_CUSTOMER_EMAIL/PASSWORD — dev-otp is 404 in production.',
  );

  // Self-clean (Goal 9.1 D1): soft-delete the project this spec creates so the
  // persistent smoke account doesn't leak it into the live DB every deploy.
  const createdProjectIds: string[] = [];
  test.afterEach(async ({ page }) => {
    await cleanupCreatedProjects(page, createdProjectIds);
  });

  test('brief: zones → style → materials → review → save → resume', async ({ page, request }) => {
    // Dev-mode cold compiles + the full signup→wizard journey + TWO upload
    // round-trips (photo + logo, B2C-004) blow well past test.slow()'s 3×30s —
    // the 90s budget was expiring mid-journey at whichever step was active
    // (the failure point moved between runs). Production targets finish in a
    // fraction of this. 360s (was 300s) leaves room for the two 180s upload
    // ceilings below when the Render worker is cold (Goal 11 D4).
    test.setTimeout(360_000);
    const seededEmail = process.env.SMOKE_CUSTOMER_EMAIL;
    const seededPassword = process.env.SMOKE_CUSTOMER_PASSWORD;
    if (seededEmail && seededPassword) {
      await signIn(page, seededEmail, '/vehicles/select', seededPassword);
    } else {
      const email = uniqueEmail('brief');
      await signUpAndVerify(page, request, email);
      await signIn(page, email, '/vehicles/select');
    }
    const projectId = await createProject(page);
    createdProjectIds.push(projectId);

    // Enter the wizard from the editor header.
    await page.getByTestId('open-brief').click();
    await page.waitForURL(`**/projects/${projectId}/brief`);
    await expect(page.getByTestId('brief-wizard')).toBeVisible();

    // Zones: full wrap by default; exclude the first panel VIA THE DIAGRAM
    // (B2C-003) and confirm the accessible checklist mirrors it.
    await expect(page.getByTestId('brief-step-zones')).toBeVisible();
    await expect(page.getByText(/full wrap — every panel included/i)).toBeVisible();
    await expect(page.getByTestId('zone-diagram')).toBeVisible();
    const firstPath = page.locator('[data-testid^="zone-path-"]').first();
    const pathTestId = await firstPath.getAttribute('data-testid');
    const panelId = pathTestId!.replace('zone-path-', '');
    const zoneId = `zone-toggle-${panelId}`;
    await firstPath.click();
    await expect(firstPath).toHaveAttribute('aria-pressed', 'false');
    await expect(page.locator(`[data-testid="${zoneId}"]`)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.getByTestId('zone-summary')).toHaveText(/of \d+ panels included/i);

    // Photos (B2C-004 / B2C-012 scope): add a vehicle photo + a note.
    await page.getByTestId('brief-step-tab-photos').click();
    await page.getByTestId('photo-input').setInputFiles(OPAQUE_PNG);
    const photoNote = page.locator('[data-testid^="photo-note-"]').first();
    // 180s (was 120s): the post-deploy smoke pays the free-tier Render worker's
    // COLD-START hit (~up to 2.5 min observed) — 120s aborted mid-cold-start
    // (Goal 11 D4). Still asserts the upload completes, just allows a cold worker.
    await photoNote.waitFor({ state: 'visible', timeout: 180_000 });
    await photoNote.fill('dent on rear left quarter panel');

    // Logo (B2C-004): the opaque low-res PNG must trip BOTH gate warnings,
    // then get assigned to a zone.
    await page.getByTestId('brief-step-tab-logo').click();
    await page.getByTestId('logo-input').setInputFiles(OPAQUE_PNG);
    // 180s for parity with the photo upload — the worker is usually warm by now,
    // but a re-cold-start mustn't abort the second parse (Goal 11 D4).
    await expect(page.getByTestId('logo-warning-opaque')).toBeVisible({ timeout: 180_000 });
    await expect(page.getByTestId('logo-rembg')).toBeVisible(); // one-click path offered
    await expect(page.getByTestId('logo-warning-dpi')).toBeVisible();
    await expect(page.getByTestId('logo-warning-dpi')).toContainText(/DPI/);
    const firstLogoZone = page.locator('[data-testid^="logo-zone-"]').first();
    await firstLogoZone.click();
    await expect(firstLogoZone).toHaveAttribute('aria-pressed', 'true');

    // Colors (B2C-005): film-library pick + one-tap extract from the logo.
    await page.getByTestId('brief-step-tab-colors').click();
    await page.getByTestId('film-search').fill('hot rod');
    await page.getByTestId('film-2080-G13').click();
    await expect(page.getByTestId('color-picks')).toContainText('2080-G13');
    await page.getByTestId('color-extract').click();
    const extractedChip = page.locator('[data-testid^="color-extracted-"]').first();
    await extractedChip.waitFor({ state: 'visible', timeout: 30_000 });
    await extractedChip.click(); // red fixture → a red swatch lands in picks
    await expect(page.getByTestId('color-picks').locator('li')).toHaveCount(2);

    // Style: preset + prompt.
    await page.getByTestId('brief-step-tab-style').click();
    await page.getByRole('button', { name: 'Clean', exact: true }).click();
    await page.getByTestId('style-prompt').fill('navy + white contractor look');

    // Materials: pick premium cast.
    await page.getByTestId('brief-step-tab-materials').click();
    await page.getByRole('button', { name: /premium cast vinyl/i }).click();

    // Tint (B2C-006): pick a state, choose a too-dark front VLT → illegal
    // verdict; bump to a legal one → verdict flips.
    await page.getByTestId('brief-step-tab-tint').click();
    await page.getByTestId('tint-state').selectOption('GA'); // GA front min = 32% VLT
    await page.getByTestId('tint-front-20').click();
    await expect(page.getByTestId('tint-verdict-front')).toHaveAttribute('data-status', 'illegal');
    await page.getByTestId('tint-front-50').click();
    await expect(page.getByTestId('tint-verdict-front')).toHaveAttribute('data-status', 'legal');
    await page.getByTestId('tint-rear-20').click();
    await expect(page.getByTestId('tint-verdict-rear')).toHaveAttribute('data-status', 'illegal');

    // Let the debounced autosave land, then reload → resume restores data+step.
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId('brief-step-tint')).toBeVisible(); // resumed step
    // Tint data survived: state + selections + recomputed verdicts.
    await expect(page.getByTestId('tint-state')).toHaveValue('GA');
    await expect(page.getByTestId('tint-front-50')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.getByTestId('tint-verdict-rear')).toHaveAttribute('data-status', 'illegal');
    await page.getByTestId('brief-step-tab-materials').click();
    await expect(page.getByRole('button', { name: /premium cast vinyl/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByTestId('brief-step-tab-zones').click();
    await expect(page.locator(`[data-testid="${zoneId}"]`)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await expect(page.locator(`[data-testid="zone-path-${panelId}"]`)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    await page.getByTestId('brief-step-tab-style').click();
    await expect(page.getByTestId('style-prompt')).toHaveValue('navy + white contractor look');

    // Photos + logo survived the reload too (asset ids + note + zone assign).
    await page.getByTestId('brief-step-tab-photos').click();
    await expect(page.locator('[data-testid^="photo-note-"]').first()).toHaveValue(
      'dent on rear left quarter panel',
    );
    await page.getByTestId('brief-step-tab-logo').click();
    // Zone assignment is brief data (instant); the warning needs the asset
    // re-read (getAssetAction round-trip) — generous budget for dev-mode.
    await expect(page.locator('[data-testid^="logo-zone-"]').first()).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('logo-warning-opaque')).toBeVisible({ timeout: 30_000 });

    // Colors survived the reload (film SKU + extracted pick).
    await page.getByTestId('brief-step-tab-colors').click();
    await expect(page.getByTestId('color-picks')).toContainText('2080-G13');
    await expect(page.getByTestId('color-picks').locator('li')).toHaveCount(2);

    // Review → Save brief → numbered version toast → back to the editor.
    await page.getByTestId('brief-step-tab-review').click();
    await expect(page.getByText(/premium cast vinyl/i)).toBeVisible();
    await expect(page.getByText(/1 photo\(s\)/)).toBeVisible();
    await expect(page.getByText(/opaque-logo\.png/)).toBeVisible();
    await expect(page.getByText(/2080-G13/)).toBeVisible();
    // Export the Wrap Spec Pack (B2C-009): the Review screen's other half.
    // page.request shares the session cookies — assert a real PDF comes back.
    await expect(page.getByTestId('brief-export')).toBeVisible();
    const exportRes = await page.request.get(`/projects/${projectId}/export`);
    expect(exportRes.status()).toBe(200);
    expect(exportRes.headers()['content-type']).toContain('application/pdf');
    const pdf = await exportRes.body();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5_000); // a real 4-page pack, not an error body

    // Delivery (B2C-010): email-to-self and send-to-shop run the real action.
    // LOCAL ONLY (console transport — same path, no real mail): on a deployed
    // target these would attempt live Resend sends from the smoke account and
    // burn its rate budget every run (PR #130 review) — the panel's presence
    // is still asserted everywhere.
    await expect(page.getByTestId('delivery-panel')).toBeVisible();
    if (!isRemoteTarget()) {
      await page.getByTestId('delivery-email-self').click();
      await expect(page.getByText(/sent to your inbox/i).first()).toBeVisible({
        timeout: 30_000,
      });
      await page.getByTestId('delivery-shop-email').fill('quotes@example-shop.test');
      await page.getByTestId('delivery-send-shop').click();
      await expect(page.getByText(/sent to quotes@example-shop\.test/i)).toBeVisible({
        timeout: 30_000,
      });
    }
    // The platform-order seam points at the editor (Goal 3a submit reuse).
    await expect(page.getByTestId('delivery-submit-order')).toHaveAttribute(
      'href',
      `/projects/${projectId}/editor`,
    );

    await page.getByTestId('brief-save').click();
    await expect(page.getByText(/brief saved \(v\d+\)/i)).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/);
  });
});
