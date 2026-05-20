// GH-003 E2E: a customer browses to the seeded Tier-1 template and selects it,
// via both the cascade and typo-tolerant search. Requires the seed to have run
// (pnpm --filter @alphawolf/db db:seed) so the published 2024 Ford Transit 250
// exists.

import { expect, test } from '@playwright/test';

test.describe('GH-003 browse + select', () => {
  test('cascade Year → Make → Model surfaces a template and selects it', async ({ page }) => {
    await page.goto('/vehicles/select');

    await page.getByLabel('Year').selectOption('2024');
    await page.getByLabel('Make').selectOption('Ford');
    await page.getByLabel('Model').selectOption('Transit 250');

    const card = page.getByTestId('vehicle-card').first();
    await expect(card).toBeVisible();
    await expect(card).toContainText('Transit 250');

    await card.getByRole('link', { name: /use this template/i }).click();
    await expect(page.getByTestId('vehicle-detail')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Transit 250/ })).toBeVisible();
  });

  test('typo-tolerant search finds the template ("transt 250")', async ({ page }) => {
    await page.goto('/vehicles/select');
    await page.getByLabel('Search').fill('transt 250');
    const card = page.getByTestId('vehicle-card').first();
    await expect(card).toBeVisible({ timeout: 10_000 });
    await expect(card).toContainText('Transit 250');
  });
});
