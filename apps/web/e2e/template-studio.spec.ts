// Goal 6 E2E: the Template Studio loop — an admin creates a draft vehicle,
// draws panels in the Studio workspace, calibrates, saves (panel rows land),
// and publishes (layout sheet + catalogue). Local/dev only: it relies on the
// dev make-admin endpoint and creates throwaway vehicles; the AW-template
// coverage that runs in the prod smoke lives in brief-wizard/editor specs.

import path from 'node:path';
import { expect, test } from '@playwright/test';
import { makeAdmin, signIn, signUpAndVerify, uniqueEmail } from './support/flows';

const VALID_SVG = path.resolve(
  __dirname,
  '../../../packages/db/seeds/vehicles/2024-ford-transit-250-148-highroof.svg',
);

test.describe('Goal 6 Template Studio', () => {
  test('non-admin gets 404 at /admin/studio', async ({ page, request }) => {
    test.setTimeout(90_000); // first hit dev-compiles the route chain
    const email = uniqueEmail('cust');
    await signUpAndVerify(page, request, email);
    await signIn(page, email, '/vehicles/select');
    // Generous timeout: the first hit dev-compiles the route.
    const res = await page.goto('/admin/studio', { timeout: 60_000 });
    expect(res?.status()).toBe(404);
  });

  test('author → calibrate → save → publish on a fresh draft', async ({ page, request }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail('studio-admin');
    await signUpAndVerify(page, request, email);
    await makeAdmin(request, email);
    await signIn(page, email, '/admin/studio');

    // The worklist shows the library and the request queue sections.
    await expect(page.getByRole('heading', { name: 'Template Studio' })).toBeVisible();

    // Create a throwaway draft via the existing admin form (the Studio's
    // "new vehicle" entry point).
    await page.goto('/admin/vehicles/new');
    const model = `Studio E2E ${Date.now()}`;
    await page.locator('input[name="year"]').fill('2024');
    await page.locator('input[name="make"]').fill('Ford');
    await page.locator('input[name="model"]').fill(model);
    await page.locator('select[name="bodyType"]').selectOption('van');
    await page.locator('input[name="lengthMm"]').fill('5531');
    await page.locator('input[name="widthMm"]').fill('2032');
    await page.locator('input[name="heightMm"]').fill('2630');
    await page.locator('select[name="sourceAuthority"]').selectOption('measured_in_shop');
    await page.locator('input[name="svg"]').setInputFiles(VALID_SVG);
    await page.getByRole('button', { name: /create draft template/i }).click();
    await page.waitForURL(/\/admin\/vehicles\/([0-9a-f-]{36})/, { timeout: 30_000 });
    const vehicleId = page.url().match(/\/admin\/vehicles\/([0-9a-f-]{36})/)![1]!;

    // Open the Studio workspace for it (first hit dev-compiles the route).
    await page.goto(`/admin/studio/${vehicleId}`, { timeout: 60_000 });
    const canvas = page.getByTestId('studio-canvas');
    await expect(canvas).toBeVisible({ timeout: 15_000 });

    // Draw two panels on the driver view (draw mode is the default).
    const box = (await canvas.boundingBox())!;
    const drawRect = async (fx0: number, fy0: number, fx1: number, fy1: number) => {
      await page.mouse.move(box.x + box.width * fx0, box.y + box.height * fy0);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * fx1, box.y + box.height * fy1, { steps: 5 });
      await page.mouse.up();
    };
    await drawRect(0.1, 0.3, 0.35, 0.6);
    // Drawing switches to select mode; re-arm draw for the second panel.
    await page.getByRole('button', { name: 'Draw panel' }).click();
    await drawRect(0.4, 0.3, 0.7, 0.6);

    // Name the selected (second) panel via the sidebar.
    await page.getByTestId('studio-panel-name').fill('Cargo Side');

    // Calibrate EVERY used view (the draft inherited the Transit SVG's four
    // views; the two drawn panels joined "driver"). Save stays disabled until
    // all spans are set — that gate is part of what we verify.
    await expect(page.getByTestId('studio-save')).toBeDisabled();
    await page.getByTestId('studio-span-driver').fill('1080');
    await page.getByTestId('studio-span-passenger').fill('1080');
    await page.getByTestId('studio-span-front').fill('960');
    await page.getByTestId('studio-span-back').fill('960');

    // Save the panel set (the seed's inherited panels + 2 drawn — don't
    // hard-couple the count to the Transit fixture's current shape).
    await page.getByTestId('studio-save').click();
    await expect(page.getByText(/Saved \d+ panels across \d+ views\./)).toBeVisible({
      timeout: 30_000,
    });

    // Publish (also generates the 1/20 layout sheet).
    await page.getByTestId('studio-publish').click();
    await expect(page.getByText(/^Published\./)).toBeVisible({
      timeout: 30_000,
    });

    // The published template now renders its panels for customers: the brief
    // wizard zone selector consumes the same rows the editor does.
    await page.goto(`/vehicles/${vehicleId}`);
    await expect(page.getByRole('heading', { name: new RegExp(model) })).toBeVisible({
      timeout: 15_000,
    });

    // Cleanup: retire the throwaway so it never lingers in the public catalog
    // (this suite can run against the shared dev DB). Retried as a block: a
    // pre-hydration click on the status form can bounce to the list page.
    await expect(async () => {
      await page.goto(`/admin/vehicles/${vehicleId}`);
      await expect(page.getByTestId('admin-vehicle-detail')).toBeVisible({ timeout: 10_000 });
      await page.getByRole('button', { name: /^retire$/i }).click();
      await expect(page.getByTestId('admin-vehicle-detail')).toContainText('Retired', {
        timeout: 5_000,
      });
    }).toPass({ timeout: 60_000 });
  });
});
