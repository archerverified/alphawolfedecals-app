// Goal 4 DELIVERABLE 1 — capture the demo screenshot set from the REAL prod flow.
// Standalone Playwright (chromium.launch — not a CI spec). Reads the seeded smoke
// creds from env (SMOKE_CUSTOMER_*/SMOKE_SHOP_*). Run:
//   cd apps/web && dotenv -e /tmp/aw-smoke-creds.env -- tsx scripts/capture-screenshots.ts
//
// Writes 1440x900 PNGs to docs/deployment/screenshots/2026-06-09-goal-4/.

import { chromium, type Page } from '@playwright/test';
import * as path from 'node:path';

const BASE = process.env.DEPLOY_URL ?? 'https://alphawolfedecals-app-web.vercel.app';
const OUT = path.resolve(__dirname, '../../../docs/deployment/screenshots/2026-06-09-goal-4');
const TINY_SVG = path.resolve(__dirname, '../e2e/fixtures/tiny-logo.svg');

async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: path.join(OUT, name) });
  console.log('  ✓', name);
}

async function login(page: Page, email: string, password: string, next: string): Promise<void> {
  await page.goto(`${BASE}/signin?next=${encodeURIComponent(next)}`);
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.getByRole('button', { name: /^sign in$/i }).click();
  await page.waitForURL(`${BASE}${next}`, { timeout: 30_000 });
}

// Best-effort wrapper: a flaky step (e.g. the inspector color control) must not
// abort the whole capture run.
async function tryStep(label: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.warn(`  ! skipped "${label}":`, (e as Error).message.split('\n')[0]);
  }
}

async function main(): Promise<void> {
  const { SMOKE_CUSTOMER_EMAIL, SMOKE_CUSTOMER_PASSWORD, SMOKE_SHOP_EMAIL, SMOKE_SHOP_PASSWORD } =
    process.env;
  if (
    !SMOKE_CUSTOMER_EMAIL ||
    !SMOKE_CUSTOMER_PASSWORD ||
    !SMOKE_SHOP_EMAIL ||
    !SMOKE_SHOP_PASSWORD
  )
    throw new Error('SMOKE_* creds not set — source /tmp/aw-smoke-creds.env');

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });

  // ---- Customer flow ----
  console.log('Customer flow:');
  const page = await ctx.newPage();
  await login(page, SMOKE_CUSTOMER_EMAIL, SMOKE_CUSTOMER_PASSWORD, '/vehicles/select');

  await page.goto(`${BASE}/vehicles`);
  await page
    .getByRole('link', { name: /use template/i })
    .first()
    .waitFor({ timeout: 20_000 });
  await shot(page, '01-catalog-gallery.png');

  await page
    .getByRole('link', { name: /use template/i })
    .first()
    .click();
  await page.waitForURL(/\/vehicles\/[0-9a-f-]{8,}/, { timeout: 20_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await shot(page, '02-template-detail.png');

  await page.getByTestId('start-project-cta').click();
  await page.getByTestId('start-project-name').fill('Investor Demo Wrap');
  await page.getByTestId('start-project-submit').click();
  await page.waitForURL(/\/projects\/.+\/editor/, { timeout: 30_000 });
  await page.getByTestId('canvas-host').waitFor({ state: 'visible', timeout: 20_000 });
  await page.getByTestId('canvas-ready').waitFor({ state: 'attached', timeout: 20_000 });
  await page.waitForTimeout(1500);
  await shot(page, '03-editor-empty.png');

  await tryStep('upload', async () => {
    await page.locator('[data-testid="upload-input"]').setInputFiles(TINY_SVG);
    await page.waitForTimeout(3500);
    await shot(page, '04-editor-upload.png');
  });

  await tryStep('place-shape', async () => {
    await page.getByTestId('tool-shape').click();
    await page.waitForTimeout(800);
    await shot(page, '05-editor-shape-placed.png');
  });

  await tryStep('color', async () => {
    await page.getByTestId('color-fill').first().click({ timeout: 8_000 });
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: '#ef4444', exact: true }).click({ timeout: 8_000 });
    await page.waitForTimeout(800);
    await shot(page, '06-editor-colored.png');
  });

  await tryStep('save', async () => {
    await page.getByTestId('save-now').click();
    await page.waitForTimeout(1500);
    await shot(page, '07-editor-saved.png');
  });

  await page.getByTestId('submit-production').click();
  await page.locator('#order-name').fill('Casey Customer');
  await page.locator('#order-email').fill('casey-demo@e2e.alphawolf.test');
  await page.waitForTimeout(500);
  await shot(page, '08-submit-dialog.png');
  await page.getByTestId('submit-production-confirm').click();
  await page.waitForURL(/order-confirmed/, { timeout: 20_000 });
  await page.getByTestId('order-confirmed').waitFor({ state: 'visible', timeout: 15_000 });
  await page.waitForTimeout(800);
  await shot(page, '09-order-confirmed.png');

  // ---- Shop flow (fresh context) ----
  console.log('Shop flow:');
  const shopCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const shopPage = await shopCtx.newPage();
  await login(shopPage, SMOKE_SHOP_EMAIL, SMOKE_SHOP_PASSWORD, '/dashboard');
  await shopPage.getByTestId('orders-table').waitFor({ state: 'visible', timeout: 15_000 });
  await shopPage.waitForTimeout(600);
  await shot(shopPage, '10-shop-queue.png');

  await shopPage.getByTestId('order-link').first().click();
  await shopPage.waitForURL(/dashboard\/orders\//, { timeout: 15_000 });
  await shopPage.getByTestId('order-detail').waitFor({ state: 'visible', timeout: 15_000 });
  await shopPage.waitForTimeout(600);
  await shot(shopPage, '11-order-detail.png');

  await tryStep('accept', async () => {
    await shopPage.getByTestId('transition-in_production').click();
    await shopPage
      .getByTestId('order-status-badge')
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 });
    await shopPage.waitForTimeout(1200);
    await shot(shopPage, '12-order-in-production.png');
  });

  await tryStep('fulfil', async () => {
    await shopPage.getByTestId('transition-fulfilled').click();
    await shopPage.waitForTimeout(1500);
    await shot(shopPage, '13-order-fulfilled.png');
  });

  await browser.close();
  console.log('done.');
}

main().catch((err) => {
  console.error('capture FAILED:', err);
  process.exit(1);
});
