// Goal 5 (B2C-002+) E2E: the guided design-brief wizard on the seeded Transit.
// Grows with the goal — each story's PR extends this spec; PR10 promotes the
// happy path into the production smoke run alongside mvp-flow.
//
// Covers: wizard loads from the editor entry point, zones default to full wrap
// and toggle off, style prompt + material persist via per-step autosave,
// resume restores both the data AND the step, Review saves a numbered brief
// version and routes back to the editor.

import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, signIn, uniqueEmail } from './support/flows';

const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';

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
    const email = uniqueEmail('brief');
    await signUpAndVerify(page, request, email);
    await signIn(page, email, '/vehicles/select');
    const projectId = await createProject(page);

    // Enter the wizard from the editor header.
    await page.getByTestId('open-brief').click();
    await page.waitForURL(`**/projects/${projectId}/brief`);
    await expect(page.getByTestId('brief-wizard')).toBeVisible();

    // Zones: full wrap by default; exclude the first panel.
    await expect(page.getByTestId('brief-step-zones')).toBeVisible();
    await expect(page.getByText(/full wrap — every panel included/i)).toBeVisible();
    const firstZone = page.locator('[data-testid^="zone-toggle-"]').first();
    const zoneId = await firstZone.getAttribute('data-testid');
    await firstZone.click();
    await expect(page.getByText(/of \d+ panels included/i)).toBeVisible();

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
    await page.getByTestId('brief-step-tab-style').click();
    await expect(page.getByTestId('style-prompt')).toHaveValue('navy + white contractor look');

    // Review → Save brief → numbered version toast → back to the editor.
    await page.getByTestId('brief-step-tab-review').click();
    await expect(page.getByText(/premium cast vinyl/i)).toBeVisible();
    await page.getByTestId('brief-save').click();
    await expect(page.getByText(/brief saved \(v1\)/i)).toBeVisible({ timeout: 15_000 });
    await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/);
  });
});
