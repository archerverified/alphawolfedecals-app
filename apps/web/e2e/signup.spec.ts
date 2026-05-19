// E2E: signup → OTP → next screen for both account types.
//
// Resend's onboarding@resend.dev sender only delivers to the Resend account
// owner, so the test reads the OTP from the dev-only peek endpoint at
// /api/auth/dev-otp (gated by NODE_ENV !== 'production' — see
// app/api/auth/dev-otp/route.ts).
//
// These tests require:
//   * DATABASE_URL pointing at the dev Supabase project
//   * PII_ENCRYPTION_KEY set
//   * auth_rls.sql applied (`pnpm --filter @alphawolf/db db:apply-sql`)
//
// If the dev server isn't backed by a reachable DB, the signup submit will
// 500 and the test will fail with a clear error.

import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.alphawolf.test`;

async function fetchOtp(request: APIRequestContext, email: string): Promise<string> {
  // The dev-otp route is in-process; the code is stashed synchronously when
  // sendOtpEmail runs in non-prod. One retry covers any race on the redirect.
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request.get(`/api/auth/dev-otp?email=${encodeURIComponent(email)}`);
    if (res.ok()) {
      const body = (await res.json()) as { code: string };
      return body.code;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No OTP found for ${email}`);
}

async function fillField(page: Page, name: string, value: string): Promise<void> {
  await page.locator(`input[name="${name}"]`).fill(value);
}

test.describe('GH-001 customer signup → OTP → welcome', () => {
  test('happy path', async ({ page, request }) => {
    const email = uniqueEmail('customer');
    await page.goto('/signup');
    await fillField(page, 'firstName', 'Casey');
    await fillField(page, 'lastName', 'Customer');
    await fillField(page, 'email', email);
    await fillField(page, 'password', 'Aa1!aaaaaaaa');
    await page.getByRole('button', { name: /create account/i }).click();

    await page.waitForURL(/\/verify\?email=/);
    await expect(page.getByRole('heading', { name: /check your email/i })).toBeVisible();

    const code = await fetchOtp(request, email);
    await page.locator('input[name="code"]').fill(code);
    await page.getByRole('button', { name: /^verify$/i }).click();

    await page.waitForURL('/welcome');
    await expect(page.getByTestId('customer-welcome')).toBeVisible();
  });

  test('wrong code shows retry counter', async ({ page, request }) => {
    const email = uniqueEmail('customer-retry');
    await page.goto('/signup');
    await fillField(page, 'firstName', 'Casey');
    await fillField(page, 'lastName', 'Retry');
    await fillField(page, 'email', email);
    await fillField(page, 'password', 'Aa1!aaaaaaaa');
    await page.getByRole('button', { name: /create account/i }).click();
    await page.waitForURL(/\/verify\?email=/);

    // Ensure the OTP exists before submitting a wrong code.
    await fetchOtp(request, email);

    await page.locator('input[name="code"]').fill('000000');
    await page.getByRole('button', { name: /^verify$/i }).click();

    await expect(page.getByRole('alert')).toContainText(/incorrect code/i);
  });
});

test.describe('GH-002 shop signup → OTP → welcome/shop', () => {
  test('happy path', async ({ page, request }) => {
    const email = uniqueEmail('shop');
    await page.goto('/signup-shop');
    await fillField(page, 'firstName', 'Rico');
    await fillField(page, 'lastName', 'Shop');
    await fillField(page, 'email', email);
    await fillField(page, 'password', 'Aa1!aaaaaaaa');
    await fillField(page, 'companyName', 'Rad Wraps Co');
    await fillField(page, 'phone', '+1 555 123 4567');
    await page.getByRole('button', { name: /create shop account/i }).click();

    await page.waitForURL(/\/verify\?email=/);

    const code = await fetchOtp(request, email);
    await page.locator('input[name="code"]').fill(code);
    await page.getByRole('button', { name: /^verify$/i }).click();

    await page.waitForURL('/welcome/shop');
    await expect(page.getByTestId('shop-welcome')).toBeVisible();
  });
});
