// GH-004 E2E: admin uploads a template with a valid SVG (created + published)
// and is rejected for an invalid SVG. Also asserts the route 404s for a
// non-admin (the route's existence is hidden).

import path from 'node:path';
import { expect, test } from '@playwright/test';
import { makeAdmin, signIn, signUpAndVerify, uniqueEmail } from './support/flows';

const VALID_SVG = path.resolve(
  __dirname,
  '../../../packages/db/seeds/vehicles/2024-ford-transit-250-148-highroof.svg',
);
const INVALID_SVG = path.resolve(__dirname, 'fixtures/invalid-no-wrap-safe.svg');

async function fillCommonMeta(page: import('@playwright/test').Page, model: string): Promise<void> {
  await page.locator('input[name="year"]').fill('2024');
  await page.locator('input[name="make"]').fill('Ford');
  await page.locator('input[name="model"]').fill(model);
  await page.locator('select[name="bodyType"]').selectOption('van');
  await page.locator('input[name="lengthMm"]').fill('5531');
  await page.locator('input[name="widthMm"]').fill('2032');
  await page.locator('input[name="heightMm"]').fill('2630');
  await page.locator('select[name="sourceAuthority"]').selectOption('manufacturer_spec');
}

test.describe('GH-004 admin template CRUD', () => {
  test('non-admin gets 404 at /admin/vehicles', async ({ page, request }) => {
    const email = uniqueEmail('cust');
    await signUpAndVerify(page, request, email);
    await signIn(page, email, '/vehicles/select');
    const res = await page.goto('/admin/vehicles');
    expect(res?.status()).toBe(404);
  });

  test('admin creates a draft from a valid SVG, then publishes it', async ({ page, request }) => {
    const email = uniqueEmail('admin');
    await signUpAndVerify(page, request, email);
    await makeAdmin(request, email);
    await signIn(page, email, '/admin/vehicles');

    await page.goto('/admin/vehicles/new');
    const model = `E2E Transit ${Date.now()}`;
    await fillCommonMeta(page, model);
    await page.locator('input[name="svg"]').setInputFiles(VALID_SVG);
    await page.getByRole('button', { name: /create draft template/i }).click();

    // Redirects to the new draft's detail page (first dev-compile can be slow).
    await page.waitForURL(/\/admin\/vehicles\/[0-9a-f-]{36}/, { timeout: 30_000 });
    await expect(page.getByTestId('admin-vehicle-detail')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: new RegExp(model) })).toBeVisible();

    await page.getByRole('button', { name: /^publish$/i }).click();
    await expect(page.getByTestId('admin-vehicle-detail')).toContainText('Published', {
      timeout: 15_000,
    });
  });

  test('admin upload of an invalid SVG is rejected with §3.4 errors', async ({ page, request }) => {
    const email = uniqueEmail('admin2');
    await signUpAndVerify(page, request, email);
    await makeAdmin(request, email);
    await signIn(page, email, '/admin/vehicles');

    await page.goto('/admin/vehicles/new');
    await fillCommonMeta(page, `E2E Bad ${Date.now()}`);
    await page.locator('input[name="svg"]').setInputFiles(INVALID_SVG);
    await page.getByRole('button', { name: /create draft template/i }).click();

    await expect(page.getByTestId('create-error')).toBeVisible();
    await expect(page.getByTestId('create-error')).toContainText('§3.4');
  });
});
