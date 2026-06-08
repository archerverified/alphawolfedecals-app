// Canonical MVP smoke (Goal 3c PR2). Drives the full customer → order loop, and
// a gated shop → fulfil loop, against DEPLOY_URL (local dev, a Vercel preview, or
// production). Pattern reference: deploy-smoke.spec.ts + e2e/support/flows.ts.
//
// ── Auth gate (the spec's OPEN QUESTION — resolved as Option (a)) ────────────
// The dev-otp peek endpoint is hard-404 in production (NODE_ENV==='production'),
// and we must NOT add a permanent OTP backdoor on prod. So:
//   • Local / CI dev mode (NODE_ENV=development): the peek works, so the customer
//     is created fresh via signup + verify (no secrets needed).
//   • Production / preview: sign in PRE-SEEDED, already-verified test accounts via
//     PASSWORD (SMOKE_CUSTOMER_EMAIL / SMOKE_CUSTOMER_PASSWORD from CI secrets).
//     Password login needs no OTP, opens zero new attack surface, and the creds
//     are rotatable secrets for dedicated throwaway accounts.
// Selection is by env: if SMOKE_CUSTOMER_EMAIL is set we use the pre-seeded path,
// otherwise we sign up fresh. See the PR body for the full rationale.
//
// ── Email verification ───────────────────────────────────────────────────────
// A successful submit triggers the order_submitted (customer) + order_received
// (shop) dispatch from Goal 3c PR1. Inbox-level confirmation is operational
// (Resend dashboard / webhook — the goal condition allows either); this spec
// asserts the observable proxy: the order-confirmed page renders with the order.
//
// ── Shop loop ────────────────────────────────────────────────────────────────
// The shop dashboard + status transitions are Goal 3b (open PRs #94–#96, not yet
// on main). That half of the loop is gated behind SMOKE_INCLUDE_SHOP so the
// customer loop stays green until 3b lands; when enabled it asserts the
// accepted/completed transitions that fire the order_in_production/fulfilled mail.

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as path from 'path';
import { signIn, signUpAndVerify, uniqueEmail } from './support/flows';

const TINY_SVG = path.resolve(__dirname, 'fixtures/tiny-logo.svg');

const HAS_SEEDED_CUSTOMER = Boolean(
  process.env.SMOKE_CUSTOMER_EMAIL && process.env.SMOKE_CUSTOMER_PASSWORD,
);

// Are we pointed at a deployed (non-local) target? Against prod/preview the
// dev-otp peek is 404, so the fresh-signup path can't run — pre-seeded creds are
// required there. Mirrors playwright.config.ts's hostname-equality check.
function isRemoteTarget(): boolean {
  const url = process.env.DEPLOY_URL;
  if (!url) return false;
  const { hostname } = new URL(url);
  return !['localhost', '127.0.0.1', '::1'].includes(hostname);
}

// Authenticate a customer and land on /vehicles/select. Returns the email used.
async function authenticateCustomer(page: Page, request: APIRequestContext): Promise<string> {
  const seededEmail = process.env.SMOKE_CUSTOMER_EMAIL;
  const seededPassword = process.env.SMOKE_CUSTOMER_PASSWORD;
  if (seededEmail && seededPassword) {
    // Production-safe path: pre-seeded verified account, password login.
    await signIn(page, seededEmail, '/vehicles/select', seededPassword);
    return seededEmail;
  }
  // Dev path: fresh signup + OTP verify (dev-otp peek), then password sign-in.
  const email = uniqueEmail('mvp-customer');
  await signUpAndVerify(page, request, email);
  await signIn(page, email, '/vehicles/select');
  return email;
}

test.describe('MVP smoke — customer design → submit loop', () => {
  test.skip(
    isRemoteTarget() && !HAS_SEEDED_CUSTOMER,
    'Against a deployed target set SMOKE_CUSTOMER_EMAIL/PASSWORD (pre-seeded verified account) — dev-otp is 404 in production.',
  );

  test('design a wrap and submit it for production', async ({ page, request }) => {
    await authenticateCustomer(page, request);

    // Browse + pick a vehicle.
    await page.goto('/vehicles');
    await page.getByRole('searchbox').fill('Transit');
    const vehicleCard = page.locator('[data-testid="vehicle-card"]').first();
    await vehicleCard.waitFor({ state: 'visible', timeout: 15_000 });
    await vehicleCard.click();

    // Start a project + open the editor.
    await page.getByRole('button', { name: /start project/i }).click();
    await expect(page).toHaveURL(/projects/);
    await page.getByRole('link', { name: /open editor|editor/i }).click();
    await expect(page).toHaveURL(/editor/);
    const canvasHost = page.locator('[data-testid="canvas-host"]');
    await canvasHost.waitFor({ state: 'visible', timeout: 20_000 });

    // Upload a tiny SVG + place it on the canvas.
    await page.locator('input[type="file"]').setInputFiles(TINY_SVG);
    await expect(page.locator('[data-testid="asset-status-ready"]').first()).toBeVisible({
      timeout: 30_000,
    });
    await page.locator('[data-testid="asset-thumbnail"]').first().click();
    await expect(page.locator('[data-testid="canvas-element"]').first()).toBeVisible({
      timeout: 10_000,
    });

    // Set a color: add a shape and apply a preset fill swatch.
    await page.getByTestId('tool-shape').click();
    const fill = page.getByTestId('color-fill').first();
    await fill.click();
    await page.getByRole('button', { name: '#ef4444', exact: true }).click();
    await expect(fill).toHaveAttribute('aria-label', /#ef4444/i);

    // Save (manual button) + reload to confirm persistence.
    await page.getByTestId('save-now').click();
    await expect(page.locator('[data-testid="autosave-status"]')).toContainText(/saved/i, {
      timeout: 15_000,
    });
    const editorUrl = page.url();
    await page.reload();
    await canvasHost.waitFor({ state: 'visible', timeout: 20_000 });
    await expect(page).toHaveURL(editorUrl);
    await expect(page.locator('[data-testid="canvas-element"]').first()).toBeVisible({
      timeout: 15_000,
    });

    // Submit for production → order created → confirmation page. This is the
    // trigger for the order_submitted (customer) + order_received (shop) emails.
    await page.getByTestId('submit-production').click();
    await page.locator('#order-name').fill('Casey Customer');
    await page.locator('#order-email').fill('casey-smoke@e2e.alphawolf.test');
    await page.getByTestId('submit-production-confirm').click();

    await expect(page).toHaveURL(/order-confirmed/);
    await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 15_000 });
  });
});

// Shop side — gated until Goal 3b's dashboard is on main. Enable with
// SMOKE_INCLUDE_SHOP=1 once #94–#96 merge (and a pre-seeded shop account that the
// submitted order routes to). Asserts the accept → complete transitions that fire
// the order_in_production ("accepted") + order_fulfilled ("ready") customer mail.
test.describe('MVP smoke — shop receipt → fulfil loop (Goal 3b gated)', () => {
  test.skip(
    !process.env.SMOKE_INCLUDE_SHOP,
    'Requires Goal 3b dashboard (#94–#96) — set SMOKE_INCLUDE_SHOP=1 once merged',
  );

  test('shop sees the order, accepts it, then marks it complete', async ({ page, request }) => {
    const shopEmail = process.env.SMOKE_SHOP_EMAIL;
    const shopPassword = process.env.SMOKE_SHOP_PASSWORD;
    if (shopEmail && shopPassword) {
      await signIn(page, shopEmail, '/dashboard', shopPassword);
    } else {
      const email = uniqueEmail('mvp-shop');
      await signUpAndVerify(page, request, email);
      await signIn(page, email, '/dashboard');
    }

    // The newest order routed to this shop.
    const orderRow = page.locator('[data-testid="order-row"]').first();
    await orderRow.waitFor({ state: 'visible', timeout: 15_000 });
    await orderRow.click();
    await expect(page).toHaveURL(/dashboard\/orders\//);

    // Accept → in_production (fires order_in_production), then mark complete →
    // fulfilled (fires order_fulfilled).
    await page
      .getByRole('button', { name: /accept|mark in[- ]production/i })
      .first()
      .click();
    await expect(page.getByText(/in.?production/i)).toBeVisible({ timeout: 10_000 });
    await page
      .getByRole('button', { name: /complete|fulfil/i })
      .first()
      .click();
    await expect(page.getByText(/fulfilled|complete/i)).toBeVisible({ timeout: 10_000 });
  });
});
