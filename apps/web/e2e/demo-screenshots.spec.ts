// Demo screenshot capture — drives a deployed URL and saves one PNG per
// reachable demo surface into docs/deployment/screenshots/.
//
// Kept SEPARATE from deploy-smoke.spec.ts on purpose: the smoke test is a
// pass/fail gate, this is an artifact generator. Re-run it after a new deploy
// to refresh the demo screenshots without touching the smoke gate.
//
// Usage:
//   DEPLOY_URL=https://alphawolfedecals-app-web.vercel.app \
//     pnpm --filter @alphawolf/web exec playwright test e2e/demo-screenshots.spec.ts
//
// baseURL comes from playwright.config.ts (parsed from DEPLOY_URL.origin), so
// goto('/...') resolves against the deployed origin. Do not hard-code hosts.
//
// ── Phase 1 reachable vs Phase 2 dependent ──────────────────────────────────
// The post-launch-hardening.md PNG list assumes the full authenticated editor
// walkthrough is capturable. On the production deploy it is NOT:
//   - dev-otp is gated off (NODE_ENV=production) so a synthetic account can't
//     verify → /projects and the editor are unreachable. (Phase 2 dependency:
//     production OTP delivery.)
//   - /vehicles → 404 (real browse route is /vehicles/select)
//   - /editor   → 404 (real editor route is /projects/[id]/editor, auth-gated)
//   - /vehicles/[id] → 500 on prod (Phase 1 bug, see activities.md) — the
//     vehicle-detail screenshot is blocked until that is triaged.
// So this spec captures the Phase-1-reachable public surfaces against prod, and
// the authenticated flow self-skips with a recorded reason. When run against a
// dev/preview env that has dev-otp enabled, the authenticated block will also
// produce 05–09.

import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SHOT_DIR = path.resolve(__dirname, '../../../docs/deployment/screenshots');

// Reserved-for-fictional-use values; mirrors deploy-smoke.spec.ts.
const TEST_EMAIL = `demo+${Date.now()}@example.com`;
const TEST_PASSWORD = 'DemoT3st!Pass';
const TEST_SHOP = `Demo Shop ${Date.now()}`;
const TEST_PHONE = '5555550199';

function shot(name: string) {
  return path.join(SHOT_DIR, name);
}

test.beforeAll(() => {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
});

// ── Phase 1 reachable — public surfaces, captured against production ─────────
test.describe('Demo screenshots — Phase 1 reachable (public)', () => {
  test('01 landing', async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: shot('01-landing.png'), fullPage: true });
  });

  test('02 signin', async ({ page }) => {
    await page.goto('/signin', { waitUntil: 'networkidle' });
    await expect(page.getByRole('button', { name: /sign in/i }).first()).toBeVisible();
    await page.screenshot({ path: shot('02-signin.png'), fullPage: true });
  });

  test('03 signup-shop (golden-path form)', async ({ page }) => {
    await page.goto('/signup-shop', { waitUntil: 'networkidle' });
    // The 6-field shop variant the smoke golden path exercises.
    await expect(page.getByLabel('Company name', { exact: true })).toBeVisible();
    await page.screenshot({ path: shot('03-signup-shop.png'), fullPage: true });
  });

  test('04 vehicle-browse (/vehicles/select)', async ({ page }) => {
    // NB: the demo doc says /vehicles, but that is 404 on prod. /vehicles/select
    // is the real browse route.
    await page.goto('/vehicles/select', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).toBeVisible();
    await page.screenshot({ path: shot('04-vehicle-browse.png'), fullPage: true });
  });
});

// ── Phase 2 dependent — authenticated editor flow ───────────────────────────
// Skips on prod (dev-otp gated). Produces 05–09 only against a dev/preview env
// with dev routes enabled.
test.describe('Demo screenshots — Phase 2 dependent (authenticated)', () => {
  test('05–09 authenticated editor walkthrough', async ({ page }) => {
    await page.goto('/signup-shop', { waitUntil: 'networkidle' });
    await page.getByLabel('First name', { exact: true }).fill('Demo');
    await page.getByLabel('Last name', { exact: true }).fill('User');
    await page.getByLabel('Email', { exact: true }).fill(TEST_EMAIL);
    await page.getByLabel('Password', { exact: true }).fill(TEST_PASSWORD);
    await page.getByLabel('Company name', { exact: true }).fill(TEST_SHOP);
    await page.getByLabel('Phone', { exact: true }).fill(TEST_PHONE);
    await page.getByRole('button', { name: /create shop account/i }).click();

    await page.waitForURL(/verify/);
    const otpRes = await page.request.get(
      `/api/auth/dev-otp?email=${encodeURIComponent(TEST_EMAIL)}`,
    );
    test.skip(
      otpRes.status() === 404,
      'Phase 2 dependency: production gates dev-otp (NODE_ENV=production), so a ' +
        'synthetic account cannot verify. Editor screenshots 05–09 require prod OTP ' +
        'delivery + an authenticated project. Run against a dev/preview env to capture.',
    );

    // The block below only runs against an env with dev-otp enabled. Validate
    // the response before trusting it — a non-404 error (e.g. 500) here is a
    // real failure, not a Phase 2 gate, and should surface clearly.
    expect(otpRes.ok(), `dev-otp returned HTTP ${otpRes.status()}`).toBeTruthy();
    const otpBody = (await otpRes.json()) as { code?: string };
    expect(
      typeof otpBody.code === 'string' && otpBody.code.length > 0,
      'dev-otp response missing a non-empty "code"',
    ).toBeTruthy();
    const code = otpBody.code as string;
    await page.getByLabel(/code|otp|verification/i).fill(code);
    await page.getByRole('button', { name: /verify|confirm/i }).click();

    await page.goto('/projects', { waitUntil: 'networkidle' });
    await page.screenshot({ path: shot('05-projects-empty.png'), fullPage: true });
    // Further editor states (06–09) depend on Phase 2 editor UX; capture here
    // once /projects/[id]/editor is reachable with a seeded project.
  });
});
