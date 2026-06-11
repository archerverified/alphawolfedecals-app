// Goal 5 / B2C-011 E2E: the free-plan vehicle-slot gate, end to end against
// the real server action. Two distinct vehicles fill the free slots; the
// third attempt must bounce back to the vehicle page with the friendly
// banner and create nothing.

import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, signIn, uniqueEmail } from './support/flows';

async function startProject(page: Page, vehicleId: string): Promise<void> {
  await page.goto(`/vehicles/${vehicleId}`);
  await page.getByTestId('start-project-cta').click();
  await page.getByTestId('start-project-submit').click();
}

test.describe('Free-plan vehicle slots', () => {
  test('third distinct vehicle hits the gate with friendly messaging', async ({
    page,
    request,
  }) => {
    test.setTimeout(240_000); // dev-mode compiles + 3 project creations
    const email = uniqueEmail('gates');
    await signUpAndVerify(page, request, email);
    await signIn(page, email, '/vehicles/select');

    // Grab three distinct published vehicles from the gallery.
    await page.goto('/vehicles');
    const links = page.getByRole('link', { name: /use template/i });
    await links.first().waitFor({ state: 'visible', timeout: 15_000 });
    const hrefs = await links.evaluateAll((as) =>
      as.map((a) => (a as HTMLAnchorElement).getAttribute('href') ?? ''),
    );
    const vehicleIds = hrefs
      .map((h) => h.match(/\/vehicles\/([0-9a-f-]{36})/)?.[1])
      .filter((v): v is string => Boolean(v));
    test.skip(vehicleIds.length < 3, 'needs 3 published vehicles to exercise the gate');
    const [v1, v2, v3] = vehicleIds as [string, string, string];

    // Slots 1 and 2 → editor opens.
    await startProject(page, v1);
    await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/);
    await startProject(page, v2);
    await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/);

    // Second project on an already-used vehicle does NOT consume a slot.
    await startProject(page, v1);
    await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/);

    // Third distinct vehicle → bounced with the banner, no editor.
    await startProject(page, v3);
    await page.waitForURL(new RegExp(`/vehicles/${v3}\\?gate=slots`));
    await expect(page.getByTestId('slot-gate-banner')).toBeVisible();
    await expect(page.getByTestId('slot-gate-banner')).toContainText(/coming soon/i);
  });
});
