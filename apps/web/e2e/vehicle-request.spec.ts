// GH-017 E2E: a signed-in customer requests a vehicle that isn't in the library,
// and the request lands in the admin queue.

import { expect, test } from '@playwright/test';
import { makeAdmin, signIn, signUpAndVerify, uniqueEmail } from './support/flows';

test('customer submits a request and it appears in the admin queue', async ({ page, request }) => {
  const stamp = Date.now();
  const make = 'Rivian';
  const model = `R1T ${stamp}`;

  // Customer files the request.
  const custEmail = uniqueEmail('req-cust');
  await signUpAndVerify(page, request, custEmail);
  await signIn(page, custEmail, '/vehicles/select');

  await page.goto('/vehicles/request');
  await page.locator('input[name="year"]').fill('2024');
  await page.locator('input[name="make"]').fill(make);
  await page.locator('input[name="model"]').fill(model);
  await page.getByRole('button', { name: /submit request/i }).click();
  await expect(page.getByTestId('request-success')).toBeVisible();

  // An admin sees it in the queue.
  const adminEmail = uniqueEmail('req-admin');
  await signUpAndVerify(page, request, adminEmail);
  await makeAdmin(request, adminEmail);
  await signIn(page, adminEmail, '/admin/vehicles');
  await page.goto('/admin/vehicles/requests');

  await expect(page.getByTestId('request-queue')).toContainText(`${make} ${model}`);
});
