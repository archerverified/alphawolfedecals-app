// Canonical MVP smoke. Drives the full customer → order loop, and a gated shop →
// fulfil loop, against DEPLOY_URL (local dev, a Vercel preview, or production).
//
// ── 2026-06-09 (Goal 4) rewrite ──────────────────────────────────────────────
// The original spec (Goal 3c PR2) asserted a UI that the shipped app never had:
// a `getByRole('searchbox')` on /vehicles (now an AW template *gallery*; search
// lives on /vehicles/select), `vehicle-card` cards (gallery cards link via
// `use-template-cta`), an `open editor` link (start-project redirects straight to
// the editor), and an uploaded-asset place flow keyed on testids that don't exist
// (`asset-status-ready`, `asset-thumbnail`, `canvas-element`) plus `autosave-status`
// and `order-row`. This rewrite drives the ACTUAL shipped instrumentation. The
// customer loop runs on the Ford Transit (TRANSIT_ID) — the panel-bearing template —
// because the 3 AW catalogue templates have no vehicle_panels, so the editor has no
// design surface on them (launch blocker; ADR-0014 inv 12). It exercises real place +
// color via the shape tool + inspector (`tool-shape` + `color-fill`), and artwork
// UPLOAD through the full parse pipeline (restored Goal 5 — the Goal 4 finding #3
// 500 was a stale Vercel service-role key, fixed + verified; Sentry NODE-A). A
// separate "catalogue opens" test guards that an AW template still browses + opens
// without crashing.
//   v1.1 follow-up — uploaded-image place/persist asserts
//   (needs `asset-status-ready` / `asset-thumbnail` / `canvas-element` testids).
//
// ── Auth gate (Option (a), unchanged) ────────────────────────────────────────
// Production: sign in PRE-SEEDED, already-verified accounts via PASSWORD
// (SMOKE_CUSTOMER_EMAIL/PASSWORD, SMOKE_SHOP_EMAIL/PASSWORD). Dev: fresh signup +
// dev-otp peek. The dev-otp endpoint is 404 in prod.
//
// ── Shop loop ────────────────────────────────────────────────────────────────
// The MVP has no customer→shop routing yet (an order inherits project.ownerShopId,
// which the customer UI never sets — so customer orders are null-shop and never
// reach a dashboard). The shop loop therefore verifies a PRE-SEEDED order routed to
// the smoke shop (scripts/seed-smoke-accounts.ts creates one). Gated behind
// SMOKE_INCLUDE_SHOP. v1.1 follow-up — wire customer→shop routing + per-run order
// seeding so the shop loop is self-contained in CI across repeated runs.

import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import * as path from 'path';
import { signIn, signUpAndVerify, uniqueEmail } from './support/flows';

const TINY_SVG = path.resolve(__dirname, 'fixtures/tiny-logo.svg');

// The Ford Transit is the panel-bearing template. The 3 curated AW catalogue
// templates have no vehicle_panels, so the editor has no design surface on them
// (launch blocker; ADR-0014 inv 12). The real place/color loop runs on the Transit.
const TRANSIT_ID = 'a0000000-0000-4000-8000-000000000001';

const HAS_SEEDED_CUSTOMER = Boolean(
  process.env.SMOKE_CUSTOMER_EMAIL && process.env.SMOKE_CUSTOMER_PASSWORD,
);

// Against a deployed (non-local) target the dev-otp peek is 404, so fresh signup
// can't run — pre-seeded creds are required. Mirrors playwright.config.ts.
function isRemoteTarget(): boolean {
  const url = process.env.DEPLOY_URL;
  if (!url) return false;
  const { hostname } = new URL(url);
  return !['localhost', '127.0.0.1', '::1'].includes(hostname);
}

async function authenticateCustomer(page: Page, request: APIRequestContext): Promise<string> {
  const seededEmail = process.env.SMOKE_CUSTOMER_EMAIL;
  const seededPassword = process.env.SMOKE_CUSTOMER_PASSWORD;
  if (seededEmail && seededPassword) {
    await signIn(page, seededEmail, '/vehicles/select', seededPassword);
    return seededEmail;
  }
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

    // Design on the panel-bearing Ford Transit (see TRANSIT_ID above). Start a
    // project from its detail page → redirects straight to the editor.
    await page.goto(`/vehicles/${TRANSIT_ID}`);
    await page.getByTestId('start-project-cta').click();
    await page.getByTestId('start-project-name').fill('Smoke MVP Wrap');
    await page.getByTestId('start-project-submit').click();
    await expect(page).toHaveURL(/\/projects\/.+\/editor/);

    const canvasHost = page.getByTestId('canvas-host');
    await canvasHost.waitFor({ state: 'visible', timeout: 20_000 });
    await page.getByTestId('canvas-ready').waitFor({ state: 'attached', timeout: 20_000 });

    // Artwork upload — restored 2026-06-11 (Goal 5). Goal 4 finding #3 (prod
    // 500) was a stale Vercel SUPABASE_SERVICE_ROLE_KEY after the Supabase
    // API-key rotation, fixed + verified e2e (Sentry NODE-A). This guards the
    // whole pipeline: signed-URL grant → browser PUT → finalize → BullMQ →
    // Render parse worker → "Parse complete." toast. Generous timeout: the
    // free-tier Render worker can cold-start.
    await page.getByTestId('upload-input').setInputFiles(TINY_SVG);
    await expect(page.getByText('Parse complete.')).toBeVisible({ timeout: 120_000 });

    // Place a shape on the auto-targeted front panel, then recolor it via the
    // inspector — both work on a panel-bearing template.
    await page.getByTestId('tool-shape').click();
    const fill = page.getByTestId('color-fill').first();
    await fill.waitFor({ state: 'visible', timeout: 10_000 });
    await fill.click();
    await page.getByRole('button', { name: '#ef4444', exact: true }).click();
    await expect(fill).toHaveAttribute('aria-label', /#ef4444/i);

    // Save (flush autosave) then reload — confirms the editor reloads the project.
    await page.getByTestId('save-now').click();
    const editorUrl = page.url();
    await page.reload();
    await canvasHost.waitFor({ state: 'visible', timeout: 20_000 });
    await expect(page).toHaveURL(editorUrl);

    // Submit for production → order created → confirmation page. Fires the
    // order_submitted (customer) + order_received (shop) dispatch.
    await page.getByTestId('submit-production').click();
    await page.locator('#order-name').fill('Casey Customer');
    await page.locator('#order-email').fill('casey-smoke@e2e.alphawolf.test');
    await page.getByTestId('submit-production-confirm').click();

    await expect(page).toHaveURL(/order-confirmed/);
    await expect(page.getByTestId('order-confirmed')).toBeVisible({ timeout: 15_000 });
  });

  // Catalogue regression guard — documents today's state honestly: the AW gallery
  // browses and a curated template's detail page opens without crashing, even though
  // the editor has no design surface on it yet (ADR-0014 inv 12 / launch blocker #1).
  test('AW catalogue template browses and its detail opens (no crash)', async ({
    page,
    request,
  }) => {
    await authenticateCustomer(page, request);
    await page.goto('/vehicles');
    await page
      .getByRole('link', { name: /use template/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/vehicles\/[0-9a-f-]{8,}/);
    await expect(page.getByTestId('start-project-cta')).toBeVisible({ timeout: 15_000 });
  });
});

// Shop side — verifies a pre-seeded order ROUTED to the smoke shop (see header).
// Enable with SMOKE_INCLUDE_SHOP=1 + a seeded shop account/order.
test.describe('MVP smoke — shop receipt → fulfil loop', () => {
  test.skip(
    !process.env.SMOKE_INCLUDE_SHOP,
    'Set SMOKE_INCLUDE_SHOP=1 + seed a routed order (scripts/seed-smoke-accounts.ts).',
  );

  test('shop sees a routed order, accepts it, then marks it complete', async ({
    page,
    request,
  }) => {
    const shopEmail = process.env.SMOKE_SHOP_EMAIL;
    const shopPassword = process.env.SMOKE_SHOP_PASSWORD;
    if (shopEmail && shopPassword) {
      await signIn(page, shopEmail, '/dashboard', shopPassword);
    } else {
      const email = uniqueEmail('mvp-shop');
      await signUpAndVerify(page, request, email);
      await signIn(page, email, '/dashboard');
    }

    // Dashboard loaded. The seeded routed order is CONSUMED by a successful run
    // (submitted → in_production → fulfilled is one-way), so target a row that
    // is still actionable instead of blindly clicking the newest. When every
    // routed order is already fulfilled (i.e. the fixture is spent — observed
    // 2026-06-11 after the cancelled 2026-06-10 run consumed it), fall back to
    // verifying the read path and say so, rather than timing out on a
    // transition button that can't exist. Re-seed a fresh routed order
    // (scripts/seed-smoke-accounts.ts) to restore full transition coverage.
    await page.getByTestId('orders-table').waitFor({ state: 'visible', timeout: 15_000 });
    const actionableRow = page
      .locator('tr')
      .filter({
        has: page.locator('[data-testid="order-status-badge"][data-status="submitted"]'),
      })
      .first();

    if ((await actionableRow.count()) === 0) {
      test.info().annotations.push({
        type: 'warning',
        description:
          'No routed order in `submitted` state — seeded fixture is spent. ' +
          'Verified the dashboard→detail read path only; re-seed to exercise transitions.',
      });
      const orderLink = page.getByTestId('order-link').first();
      await orderLink.waitFor({ state: 'visible', timeout: 15_000 });
      await orderLink.click();
      await expect(page).toHaveURL(/dashboard\/orders\//);
      await expect(page.getByTestId('order-detail')).toBeVisible();
      return;
    }

    await actionableRow.getByTestId('order-link').click();
    await expect(page).toHaveURL(/dashboard\/orders\//);
    await expect(page.getByTestId('order-detail')).toBeVisible();

    // Accept → in_production, then mark complete → fulfilled (deterministic
    // transition-<to> testids; fires order_in_production / order_fulfilled mail).
    await page.getByTestId('transition-in_production').click();
    await expect(page.getByTestId('order-status-badge').first()).toHaveAttribute(
      'data-status',
      'in_production',
      { timeout: 10_000 },
    );
    await page.getByTestId('transition-fulfilled').click();
    await expect(page.getByTestId('order-status-badge').first()).toHaveAttribute(
      'data-status',
      'fulfilled',
      { timeout: 10_000 },
    );
  });
});
