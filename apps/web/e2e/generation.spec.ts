// Goal 7 D5/D6 E2E — the full AI-generation loop on the MOCK provider:
// brief → Generate (1 credit) → 3 concepts → iteration (1 credit) → select →
// free final → editor carries the locked layers → exhaustion opens the
// waitlist sheet.
//
// LOCAL DEV ONLY. The mock image provider is the default when AI_PROVIDER is
// unset (local `pnpm dev`); production runs the real provider, so this spec
// green-skips on any remote DEPLOY_URL target — same guard shape as
// brief-wizard.spec.ts. It must never join the prod smoke.
//
// NOTE: the orchestrator (Haiku) is NOT mocked — local runs make a real,
// sub-cent Anthropic call per run (design doc: Anthropic calls may run
// locally; ANTHROPIC_API_KEY lives in .env.local).
//
// Cleanup contract (repo rule: no test artifacts left on the live DB): the
// created user's email is appended to /tmp/goal7-e2e/test-user-emails.txt —
// remove it with `pnpm --filter @alphawolf/db db:cleanup-e2e <email>`.

import * as fs from 'fs';
import * as path from 'path';
import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, signIn, uniqueEmail } from './support/flows';

const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';
const SHOT_DIR = '/tmp/goal7-e2e';

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
  if (!m) throw new Error('did not land in editor');
  return m[1] as string;
}

test.describe('Goal 7 generation studio (mock provider)', () => {
  test.skip(
    isRemoteTarget(),
    'Mock-provider loop — local dev only; production uses the real provider.',
  );

  test('brief → 3 concepts → iteration → final → editor layers → waitlist', async ({
    page,
    request,
  }) => {
    // Dev-mode cold compiles + 3 poll-driven runs (initial ~5 views × 3
    // concepts at 3 jobs/slice, iteration, final) + an editor visit.
    test.setTimeout(600_000);

    const email = uniqueEmail('gen');
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    fs.appendFileSync(path.join(SHOT_DIR, 'test-user-emails.txt'), `${email}\n`);

    await signUpAndVerify(page, request, email);
    await signIn(page, email, '/vehicles/select');
    const projectId = await createProject(page);

    // --- Brief: give the orchestrator something to chew on, then Review. ----
    await page.getByTestId('open-brief').click();
    await page.waitForURL(`**/projects/${projectId}/brief`);
    await page.getByTestId('brief-step-tab-style').click();
    await page
      .getByTestId('style-prompt')
      .fill('Clean contractor look, navy and white, subtle pinstripe accents.');
    await page.getByTestId('brief-step-tab-review').click();
    await expect(page.getByTestId('generate-concepts')).toBeVisible();
    await shot(page, '01-review-generate-button');

    // --- Generate: 1 credit, navigates to the studio, poll drives the run. --
    await page.getByTestId('generate-concepts').click();
    await page.waitForURL(new RegExp(`/projects/${projectId}/generate`));
    await expect(page.getByTestId('generation-studio')).toBeVisible();
    // Credit header is the PRD §5 hard rule; signup grant 5 → 4 after the run.
    await expect(page.getByTestId('credit-balance')).toContainText('4 credits');
    await expect(page.getByTestId('run-progress')).toBeVisible();
    await shot(page, '02-run-in-progress');

    // 3 concept cards appear when the initial run settles.
    await expect(page.getByTestId('concept-card-literal')).toBeVisible({ timeout: 240_000 });
    await expect(page.getByTestId('concept-card-bolder')).toBeVisible();
    await expect(page.getByTestId('concept-card-minimal')).toBeVisible();
    await expect(page.getByTestId('before-after').first()).toBeVisible();
    await shot(page, '03-three-concepts');

    // --- Iteration: chip + refine on the literal concept (1 credit). --------
    await page.getByTestId('iteration-chip-literal-2').click(); // "Brighter colors"
    await expect(page.getByTestId('refine-input-literal')).not.toHaveValue('');
    await page.getByTestId('refine-submit-literal').click();
    await expect(page.getByTestId('run-progress')).toBeVisible({ timeout: 30_000 });
    await expect(page.getByTestId('credit-balance')).toContainText('3 credits', {
      timeout: 30_000,
    });
    await expect(page.getByTestId('run-progress')).toBeHidden({ timeout: 240_000 });
    await shot(page, '04-after-iteration');

    // --- Selection → final (free) → handoff. --------------------------------
    await page.getByTestId('use-design-literal').click();
    await expect(page.getByTestId('final-confirm')).toBeVisible();
    await page.getByTestId('confirm-final').click();
    await expect(page.getByTestId('final-badge-literal')).toBeVisible({ timeout: 240_000 });
    // Final is included free — balance unchanged.
    await expect(page.getByTestId('credit-balance')).toContainText('3 credits');
    await shot(page, '05-final-rendered');

    // --- Editor handoff: locked AI layers + logo land in the working doc. ---
    await page.getByTestId('open-editor-literal').click();
    await page.waitForURL(`**/projects/${projectId}/editor`);
    // The dev-only stage handle exposes the Konva tree (same hook as
    // editor.spec.ts). Locked AI elements render as Image nodes.
    const lockedImageCount = await page.waitForFunction(
      () => {
        const stage = (
          window as unknown as {
            __KONVA_STAGE__?: { find: (sel: string) => Array<{ draggable: () => boolean }> };
          }
        ).__KONVA_STAGE__;
        if (!stage) return null;
        // Locked elements render with draggable=false (ImageNode contract) —
        // that's the AI final layers; user-placed images would be draggable.
        const locked = stage.find('Image').filter((n) => !n.draggable());
        return locked.length > 0 ? locked.length : null;
      },
      undefined,
      { timeout: 60_000 },
    );
    expect(await lockedImageCount.jsonValue()).toBeGreaterThan(0);
    await shot(page, '06-editor-with-ai-layers');

    // --- Exhaustion path: drain credits → refine opens the waitlist sheet. --
    const drain = await request.post(`/api/dev/drain-credits?email=${encodeURIComponent(email)}`);
    expect(drain.ok()).toBeTruthy();
    await page.goto(`/projects/${projectId}/generate`);
    await expect(page.getByTestId('credit-balance')).toContainText('0 credits');
    // The literal concept is final — refine on a still-open concept instead.
    await page.getByTestId('iteration-chip-bolder-0').click();
    await page.getByTestId('refine-submit-bolder').click();
    await expect(page.getByTestId('waitlist-sheet')).toBeVisible();
    await shot(page, '07-waitlist-sheet');
    await page.getByTestId('waitlist-join').click();
    await expect(page.getByTestId('waitlist-joined')).toBeVisible();
    await shot(page, '08-waitlist-joined');
  });
});
