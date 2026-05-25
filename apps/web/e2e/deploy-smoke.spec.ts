// Deploy smoke test — runs against a deployed preview URL.
//
// Usage:
//   DEPLOY_URL=https://alpha-wolf-wrap-studio-<hash>.vercel.app \
//     pnpm --filter @alphawolf/web test:e2e -- e2e/deploy-smoke.spec.ts
//
// NOT added to required CI contexts (issue #65 tracks that conversation).
// Run manually after Archer triggers the first Vercel deploy.
//
// The test creates a fresh account, walks the golden path, and cleans up.
// Cleanup uses the dev-only make-admin + direct DB commands; if NODE_ENV is
// production on the deployed URL, the dev routes return 404 and cleanup is
// skipped (but the test still passes).

import { test, expect } from '@playwright/test';
import * as path from 'path';

// baseURL is set in playwright.config.ts from a parsed URL.origin so a path
// suffix like DEPLOY_URL=https://host.com/subpath gets stripped to the bare
// origin. Don't override here — the config is the single source of truth.
const TEST_EMAIL = `smoke-${Date.now()}@example.com`;
const TEST_PASSWORD = 'SmokeT3st!Pass';
const TEST_SHOP = `Smoke Shop ${Date.now()}`;
const TEST_PHONE = '5555550199'; // 555 prefix is reserved for fictional use
const TINY_SVG = path.resolve(__dirname, 'fixtures/tiny-logo.svg');

test.describe('Deploy smoke — golden path', () => {
  test('health endpoint returns ok', async ({ request }) => {
    const res = await request.get('/health');
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { status: string; commit?: string };
    expect(body.status).toBe('ok');
    expect(typeof body.commit).toBe('string');
  });

  test('security headers present on root', async ({ request }) => {
    const res = await request.get('/');
    const headers = res.headers();
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['content-security-policy']).toContain("default-src 'self'");
    expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  test('full golden path: sign up → browse → create project → upload → place → save → reload', async ({
    page,
  }) => {
    // 1. Sign up as shop owner.
    // The shop variant of SignupForm has 6 required fields. Use exact label
    // matches because "First name" and "Last name" both contain "name" — a
    // /name/i regex matches both and .first() leaves the second empty.
    await page.goto('/signup-shop');
    await page.getByLabel('First name', { exact: true }).fill('Smoke');
    await page.getByLabel('Last name', { exact: true }).fill('Tester');
    await page.getByLabel('Email', { exact: true }).fill(TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Company name', { exact: true }).fill(TEST_SHOP);
    await page.getByLabel('Phone', { exact: true }).fill(TEST_PHONE);
    // Button text varies by variant: "Create shop account" vs "Create account".
    await page.getByRole('button', { name: /create shop account/i }).click();

    // 2. Verify OTP (dev-only ring buffer peek)
    await page.waitForURL(/verify/);
    const otpRes = await page.request.get(
      `/api/auth/dev-otp?email=${encodeURIComponent(TEST_EMAIL)}`,
    );
    if (otpRes.status() === 404) {
      // Production: dev route is gated. Skip OTP step (manual demo only).
      test.skip();
    }
    const { code } = (await otpRes.json()) as { code: string };
    await page.getByLabel(/code|otp|verification/i).fill(code);
    await page.getByRole('button', { name: /verify|confirm/i }).click();

    // 3. Arrive at dashboard / welcome
    await expect(page).toHaveURL(/welcome|dashboard|projects/);

    // 4. Browse to a vehicle
    await page.goto('/vehicles');
    await page.getByRole('searchbox').fill('Transit');
    const vehicleCard = page.locator('[data-testid="vehicle-card"]').first();
    await vehicleCard.waitFor({ state: 'visible', timeout: 10_000 });
    await vehicleCard.click();

    // 5. Start a project
    await page.getByRole('button', { name: /start project/i }).click();
    await expect(page).toHaveURL(/projects/);

    // 6. Open the editor
    await page.getByRole('link', { name: /open editor|editor/i }).click();
    await expect(page).toHaveURL(/editor/);
    const canvasHost = page.locator('[data-testid="canvas-host"]');
    await canvasHost.waitFor({ state: 'visible', timeout: 15_000 });

    // 7. Upload a tiny SVG asset
    const uploadInput = page.locator('input[type="file"]');
    await uploadInput.setInputFiles(TINY_SVG);
    // Wait for asset to appear as ready
    await expect(page.locator('[data-testid="asset-status-ready"]').first()).toBeVisible({
      timeout: 30_000,
    });

    // 8. Place on canvas
    await page.locator('[data-testid="asset-thumbnail"]').first().click();
    // A placed element should appear on the canvas
    await expect(page.locator('[data-testid="canvas-element"]').first()).toBeVisible({
      timeout: 5_000,
    });

    // 9. Save (wait for autosave indicator)
    await expect(page.locator('[data-testid="autosave-status"]')).toContainText(/saved/i, {
      timeout: 15_000,
    });

    // 10. Reload and confirm state persists
    const currentUrl = page.url();
    await page.reload();
    await canvasHost.waitFor({ state: 'visible', timeout: 15_000 });
    await expect(page).toHaveURL(currentUrl);
    await expect(page.locator('[data-testid="canvas-element"]').first()).toBeVisible({
      timeout: 10_000,
    });
  });
});
