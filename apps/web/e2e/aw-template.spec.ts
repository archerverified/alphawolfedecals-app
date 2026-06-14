// Goal 6 D3 E2E: the AW catalogue templates are FUNCTIONAL — the editor and
// the brief-wizard zone selector consume the Studio-authored panel sets on
// AW-TPL-0001 (BMW X3). This is the proof that Goal 4's launch blocker #1
// ("AW templates have no panels → editor non-functional") is closed.
//
// Two-mode auth, same contract as brief-wizard.spec.ts / mvp-flow.spec.ts:
// local dev = fresh signup; deployed targets = the seeded SMOKE_CUSTOMER.
// Slot math (B2C-011): the smoke customer's projects live on the Transit
// (slot 1) and, from this spec onward, the X3 (slot 2 — the last free slot,
// reused forever; repeat runs never burn another).

import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, signIn, uniqueEmail } from './support/flows';
import { cleanupCreatedProjects } from './support/cleanup';

const AW_X3_VEHICLE_ID = 'aa000001-0000-4000-8000-000000000001';

const HAS_SEEDED_CUSTOMER = Boolean(
  process.env.SMOKE_CUSTOMER_EMAIL && process.env.SMOKE_CUSTOMER_PASSWORD,
);

function isRemoteTarget(): boolean {
  const url = process.env.DEPLOY_URL;
  if (!url) return false;
  const { hostname } = new URL(url);
  return !['localhost', '127.0.0.1', '::1'].includes(hostname);
}

async function createProjectOnX3(page: Page): Promise<string> {
  await page.goto(`/vehicles/${AW_X3_VEHICLE_ID}`);
  await page.getByTestId('start-project-cta').click();
  await page.getByTestId('start-project-submit').click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/, { timeout: 60_000 });
  const m = page.url().match(/\/projects\/([0-9a-f-]+)\/editor/);
  if (!m) throw new Error('did not land in editor');
  return m[1] as string;
}

test.describe('Goal 6 — editor + zone selector on AW-TPL-0001', () => {
  test.skip(
    isRemoteTarget() && !HAS_SEEDED_CUSTOMER,
    'Against a deployed target set SMOKE_CUSTOMER_EMAIL/PASSWORD — dev-otp is 404 in production.',
  );

  // Self-clean (Goal 9.1 D1): soft-delete the X3 project this spec creates so the
  // persistent smoke account doesn't leak it into the live DB every deploy.
  const createdProjectIds: string[] = [];
  test.afterEach(async ({ page }) => {
    await cleanupCreatedProjects(page, createdProjectIds);
  });

  test('editor places text + shape on X3 panels; wizard zones render and toggle', async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000);
    const seededEmail = process.env.SMOKE_CUSTOMER_EMAIL;
    const seededPassword = process.env.SMOKE_CUSTOMER_PASSWORD;
    if (seededEmail && seededPassword) {
      await signIn(page, seededEmail, '/vehicles/select', seededPassword);
    } else {
      const email = uniqueEmail('awx3');
      await signUpAndVerify(page, request, email);
      await signIn(page, email, '/vehicles/select');
    }

    // The X3 catalogue card resolves and a project opens IN THE EDITOR —
    // this alone was impossible before the panel data shipped.
    const projectId = await createProjectOnX3(page);
    createdProjectIds.push(projectId);
    await page.getByTestId('canvas-ready').waitFor({ state: 'attached', timeout: 60_000 });
    await expect(page.getByTestId('editor-root')).toBeVisible();

    // Place a shape and text (insert-on-click tool model) — placement targets
    // a panel (placementFor needs panel geometry; with zero panels these tools
    // no-op, which is exactly what Goal 4 reported).
    await page.getByTestId('tool-shape').click();
    await page.getByTestId('tool-text').click();
    // The inspector proves the element attached to a REAL X3 panel ("Panel"
    // label + an authored panel name render as separate nodes).
    const inspector = page.getByRole('complementary');
    await expect(inspector).toContainText('Panel', { timeout: 15_000 });
    await expect(inspector).toContainText(/Rear Quarter|Rear Door|Front Door|Front Fender|Nose/);

    // Save through the manual save path (flushes the autosave queue), then
    // reload — proves the X3 project persists and re-renders (mvp-flow pattern).
    await page.getByTestId('save-now').click();
    await expect(page.getByRole('banner')).toContainText('Saved', { timeout: 30_000 });
    const editorUrl = page.url();
    await page.reload();
    await page.getByTestId('canvas-ready').waitFor({ state: 'attached', timeout: 60_000 });
    await expect(page).toHaveURL(editorUrl);

    // Brief wizard: the zone selector renders the X3's panels as clickable
    // paths (15 panels across 4 views) and toggling one updates its state.
    await page.getByTestId('open-brief').click();
    await page.waitForURL(`**/projects/${projectId}/brief`, { timeout: 60_000 });
    await expect(page.getByTestId('brief-step-zones')).toBeVisible();
    await expect(page.getByTestId('zone-diagram')).toBeVisible();

    const zonePaths = page.locator('[data-testid^="zone-path-"]');
    await expect(zonePaths).toHaveCount(15, { timeout: 15_000 });

    const firstPath = zonePaths.first();
    await expect(firstPath).toHaveAttribute('aria-pressed', 'true'); // full wrap default
    await firstPath.click();
    await expect(firstPath).toHaveAttribute('aria-pressed', 'false');
    // The accessible checklist mirrors the diagram toggle.
    const pathTestId = await firstPath.getAttribute('data-testid');
    const panelId = pathTestId!.replace('zone-path-', '');
    await expect(page.getByTestId(`zone-toggle-${panelId}`)).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    // Restore full wrap so repeat smoke runs start from the default state.
    await firstPath.click();
    await expect(firstPath).toHaveAttribute('aria-pressed', 'true');
  });
});
