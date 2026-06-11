// Goal 5 (B2C-002+) E2E: the guided design-brief wizard on the seeded Transit.
// Grows with the goal — each story's PR extends this spec; PR10 promotes the
// happy path into the production smoke run alongside mvp-flow.
//
// Covers: wizard loads from the editor entry point, zones default to full wrap
// and toggle off, style prompt + material persist via per-step autosave,
// resume restores both the data AND the step, Review saves a numbered brief
// version and routes back to the editor.

import * as path from 'path';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, signIn, uniqueEmail } from './support/flows';

const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';

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
  test('brief: zones → style → materials → review → save → resume', async ({ page, request }) => {
    // Dev-mode cold compiles + the full signup→wizard journey + TWO upload
    // round-trips (photo + logo, B2C-004) blow well past test.slow()'s 3×30s —
    // the 90s budget was expiring mid-journey at whichever step was active
    // (the failure point moved between runs). Production targets finish in a
    // fraction of this.
    test.setTimeout(300_000);
    const email = uniqueEmail('brief');
    await signUpAndVerify(page, request, email);
    await signIn(page, email, '/vehicles/select');
    const projectId = await createProject(page);

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
    await photoNote.waitFor({ state: 'visible', timeout: 60_000 }); // inline parse on dev
    await photoNote.fill('dent on rear left quarter panel');

    // Logo (B2C-004): the opaque low-res PNG must trip BOTH gate warnings,
    // then get assigned to a zone.
    await page.getByTestId('brief-step-tab-logo').click();
    await page.getByTestId('logo-input').setInputFiles(OPAQUE_PNG);
    await expect(page.getByTestId('logo-warning-opaque')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId('logo-rembg')).toBeVisible(); // one-click path offered
    await expect(page.getByTestId('logo-warning-dpi')).toBeVisible();
    await expect(page.getByTestId('logo-warning-dpi')).toContainText(/DPI/);
    const firstLogoZone = page.locator('[data-testid^="logo-zone-"]').first();
    await firstLogoZone.click();
    await expect(firstLogoZone).toHaveAttribute('aria-pressed', 'true');

    // Style: preset + prompt.
    await page.getByTestId('brief-step-tab-style').click();
    await page.getByRole('button', { name: 'Clean', exact: true }).click();
    await page.getByTestId('style-prompt').fill('navy + white contractor look');

    // Materials: pick premium cast.
    await page.getByTestId('brief-step-tab-materials').click();
    await page.getByRole('button', { name: /premium cast vinyl/i }).click();

    // Let the debounced autosave land, then reload → resume restores data+step.
    await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 15_000 });
    await page.reload();
    await expect(page.getByTestId('brief-step-materials')).toBeVisible(); // resumed step
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

    // Review → Save brief → numbered version toast → back to the editor.
    await page.getByTestId('brief-step-tab-review').click();
    await expect(page.getByText(/premium cast vinyl/i)).toBeVisible();
    await expect(page.getByText(/1 photo\(s\)/)).toBeVisible();
    await expect(page.getByText(/opaque-logo\.png/)).toBeVisible();
    await page.getByTestId('brief-save').click();
    await expect(page.getByText(/brief saved \(v1\)/i)).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/);
  });
});
