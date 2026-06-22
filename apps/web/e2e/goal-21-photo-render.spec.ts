// Goal 21 T8 - E2E spec for the photo-render path (mock provider, CI-safe).
//
// Journey: sign up → create project from the seeded X3 → open brief → upload a
// vehicle photo → fill minimum brief fields → Generate → 3 concepts → assert
// on-photo preview (data-testid="photo-concept-<key>") → select a concept → free
// final → assert the "See it across your vehicle" showcase button appears → click
// it → assert the showcase modal (data-testid="showcase-modal") renders an image
// (data-testid="showcase-image") → request the export and assert it returns a
// valid PDF.
//
// LOCAL DEV ONLY (same guard as generation.spec.ts). The mock image provider is
// the default when AI_PROVIDER is unset; production uses the real provider, so
// this spec green-skips on any remote DEPLOY_URL target and must never join the
// prod smoke.
//
// Print-path invariant: the export spec pack must NOT include a 'photo' view.
// That invariant is unit-proven in load-spec-pack-data.test.ts (Task 5) and
// generation-finalize.test.ts (Task 5); this spec confirms the pack still
// downloads successfully with the photo path active.
//
// Cleanup contract (same as generation.spec.ts): the created user email is
// appended to /tmp/goal21-e2e/test-user-emails.txt - purge with
// `pnpm --filter @alphawolf/db db:cleanup-e2e <email>`.

import * as fs from 'fs';
import * as path from 'path';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, signIn, uniqueEmail } from './support/flows';

const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';
const SHOT_DIR = '/tmp/goal21-e2e';

// 64x64 solid-red PNG used in brief-wizard.spec.ts for the vehicle photo step.
// It satisfies the photo-input file picker (any image file accepted).
const OPAQUE_PNG = path.resolve(__dirname, 'fixtures/opaque-logo.png');

function isRemoteTarget(): boolean {
  const url = process.env.DEPLOY_URL;
  if (!url) return false;
  const { hostname } = new URL(url);
  return !['localhost', '127.0.0.1', '::1'].includes(hostname);
}

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`), fullPage: true });
}

async function createProject(page: Page): Promise<string> {
  await page.goto(`/vehicles/${SEEDED_VEHICLE_ID}`);
  await page.getByTestId('start-project-cta').click();
  await page.getByTestId('start-project-submit').click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/);
  const m = page.url().match(/\/projects\/([0-9a-f-]+)\/editor/);
  if (!m) throw new Error('did not land in editor after project create');
  return m[1] as string;
}

test.describe('Goal 21 photo-render path (mock provider)', () => {
  test.skip(
    isRemoteTarget(),
    'Mock-provider photo-render loop - local dev only; production uses the real provider.',
  );

  test('photo upload in brief → 3 concepts with on-photo previews → showcase modal → PDF export', async ({
    page,
    request,
  }) => {
    // Budget: cold compiles + photo upload parse round-trip + 3 poll-driven runs
    // (initial with photo jobs, final) + showcase server action + PDF fetch.
    test.setTimeout(600_000);

    const email = uniqueEmail('g21');
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    fs.appendFileSync(path.join(SHOT_DIR, 'test-user-emails.txt'), `${email}\n`);

    await signUpAndVerify(page, request, email);
    await signIn(page, email, '/vehicles/select');
    const projectId = await createProject(page);

    // --- Brief: upload a vehicle photo, then fill the minimum required fields
    //     to enable Generate. ---
    await page.getByTestId('open-brief').click();
    await page.waitForURL(`**/projects/${projectId}/brief`);

    // Photos step: upload the vehicle photo via photo-input (mirrors
    // brief-wizard.spec.ts pattern). Wait for the photo note to appear, which
    // confirms the upload + async parse worker accepted the file.
    await page.getByTestId('brief-step-tab-photos').click();
    await page.getByTestId('photo-input').setInputFiles(OPAQUE_PNG);
    // 180s budget: cold Render worker can take up to ~2.5 min for the parse
    // job (same allowance as brief-wizard.spec.ts; worker is usually warm).
    const photoNote = page.locator('[data-testid^="photo-note-"]').first();
    await photoNote.waitFor({ state: 'visible', timeout: 180_000 });
    await shot(page, '01-photo-uploaded');

    // Style step: provide a prompt so the orchestrator has something to work
    // with - same field used in generation.spec.ts.
    await page.getByTestId('brief-step-tab-style').click();
    await page
      .getByTestId('style-prompt')
      .fill('Aggressive fleet look, matte black and cyan accents, full wrap.');
    await shot(page, '02-style-filled');

    // Review: confirm the Generate button is present.
    await page.getByTestId('brief-step-tab-review').click();
    await expect(page.getByTestId('generate-concepts')).toBeVisible();
    await shot(page, '03-review-generate-button');

    // --- Generate (1 credit): navigates to the studio; poll drives the run. -
    await page.getByTestId('generate-concepts').click();
    await page.waitForURL(new RegExp(`/projects/${projectId}/generate`));
    await expect(page.getByTestId('generation-studio')).toBeVisible();
    await expect(page.getByTestId('credit-balance')).toContainText('4 credits');
    await expect(page.getByTestId('run-progress')).toBeVisible();
    await shot(page, '04-run-in-progress');

    // 3 concept cards appear when the initial run settles.
    await expect(page.getByTestId('concept-card-literal')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('concept-card-bolder')).toBeVisible();
    await expect(page.getByTestId('concept-card-minimal')).toBeVisible();
    await shot(page, '05-three-concepts');

    // --- On-photo preview assertion (Goal 21 D2). --------------------------
    // The studio renders data-testid="photo-concept-<conceptKey>" for each
    // concept whose on-photo render has landed (render_target='photo',
    // view='photo'). At least one concept must have surfaced a photo preview.
    const photoPreviewLiteral = page.getByTestId('photo-concept-literal');
    const photoPreviewBolder = page.getByTestId('photo-concept-bolder');
    const photoPreviewMinimal = page.getByTestId('photo-concept-minimal');

    // Wait for at least one photo preview to appear.
    await expect(photoPreviewLiteral.or(photoPreviewBolder).or(photoPreviewMinimal)).toBeVisible({
      timeout: 30_000,
    });
    await shot(page, '06-photo-previews-visible');

    // --- Select a concept → free final. ------------------------------------
    await page.getByTestId('use-design-literal').click();
    await expect(page.getByTestId('final-confirm')).toBeVisible();
    await page.getByTestId('confirm-final').click();
    // Free final: balance stays at 4.
    await expect(page.getByTestId('final-badge-literal')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('credit-balance')).toContainText('4 credits');
    await shot(page, '07-final-rendered');

    // --- Showcase modal (Goal 21 D3). ---------------------------------------
    // The "See it across your vehicle" button appears once a concept has a
    // finalViews set (the concept card's finalViews check in GenerationStudio).
    // Clicking it calls buildShowcaseAction server-side and opens the modal.
    const showcaseButton = page.getByTestId('showcase-open-literal');
    await expect(showcaseButton).toBeVisible({ timeout: 30_000 });
    await showcaseButton.click();

    // The showcase modal opens and the composite image eventually appears.
    await expect(page.getByTestId('showcase-modal')).toBeVisible();
    // The server action may take a few seconds on the mock provider.
    await expect(page.getByTestId('showcase-image')).toBeVisible({ timeout: 60_000 });
    await shot(page, '08-showcase-modal-with-image');

    // Dismiss the modal.
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('showcase-modal')).not.toBeVisible({ timeout: 5_000 });

    // --- Export: spec pack must be a valid PDF. ----------------------------
    // Confirmed via the session cookie (page.request inherits the auth session).
    // Print-path invariant: the spec pack derives from template renders only;
    // photo renders (render_target='photo') are filtered out at
    // loadFinalViews (Task 5 / load-spec-pack-data.ts) and never reach
    // buildSpecPack. That invariant is unit-proven in
    // load-spec-pack-data.test.ts and generation-finalize.test.ts (Task 5);
    // this assertion confirms the pack still downloads while the photo path is
    // active.
    const exportRes = await page.request.get(`/projects/${projectId}/export`);
    expect(exportRes.status()).toBe(200);
    expect(exportRes.headers()['content-type']).toContain('application/pdf');
    const pdf = await exportRes.body();
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(5_000); // a real multi-page pack, not an error body
    await shot(page, '09-export-downloaded');
  });
});
