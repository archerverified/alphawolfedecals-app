// Shared E2E flows. Sign-up reads the OTP from the dev-only peek endpoint (the
// Resend sandbox sender only delivers to the account owner); admin promotion
// uses the dev-only make-admin endpoint. Both are 404 in production.

import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const PASSWORD = 'Aa1!aaaaaaaa';

export const uniqueEmail = (prefix: string): string =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@e2e.alphawolf.test`;

export async function fetchOtp(request: APIRequestContext, email: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await request.get(`/api/auth/dev-otp?email=${encodeURIComponent(email)}`);
    if (res.ok()) return ((await res.json()) as { code: string }).code;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`No OTP found for ${email}`);
}

// Sign up a customer and verify the OTP — leaves the user `active` (but not yet
// signed in; verification uses the bespoke flow, not Auth.js).
export async function signUpAndVerify(
  page: Page,
  request: APIRequestContext,
  email: string,
): Promise<void> {
  await page.goto('/signup');
  await page.locator('input[name="firstName"]').fill('E2E');
  await page.locator('input[name="lastName"]').fill('User');
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /create account/i }).click();
  await page.waitForURL(/\/verify\?email=/);

  const code = await fetchOtp(request, email);
  await page.locator('input[name="code"]').fill(code);
  await page.getByRole('button', { name: /^verify$/i }).click();
  await page.waitForURL('/welcome');
}

export async function makeAdmin(request: APIRequestContext, email: string): Promise<void> {
  const res = await request.post(`/api/dev/make-admin?email=${encodeURIComponent(email)}`);
  expect(res.ok()).toBeTruthy();
}

// password defaults to the shared E2E password (fresh dev signups); pass an
// explicit one for pre-seeded production test accounts (mvp-flow smoke).
export async function signIn(
  page: Page,
  email: string,
  next: string,
  password: string = PASSWORD,
): Promise<void> {
  await page.goto(`/signin?next=${encodeURIComponent(next)}`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(next);
}
