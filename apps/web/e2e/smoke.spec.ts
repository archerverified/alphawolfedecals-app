import { test, expect } from '@playwright/test';

test.skip('placeholder — real e2e lands with feature PRs', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Alpha Wolf/);
});
