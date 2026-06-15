// Goal 12 — Editor overhaul E2E. Codifies the four pillars of the rebuilt
// design surface on the BMW X3 (AW-TPL-0001, the most-paneled template):
//   D2  the editor renders a RECOGNIZABLE vehicle, not boxes — the approved
//       AI-generated art mounts as a Konva Image backdrop, and the multi-view
//       camera (all/front/driver/back/passenger) frames it;
//   D2  the panel geometry is now SELECTABLE wrap-zone overlays — clicking a
//       zone surfaces its name + calibrated area in the inspector;
//   D3  the AI design assistant is reachable INSIDE the editor ("Design with
//       AI") and its dialog shows the credit cost before generating.
//
// Same two-mode auth + net-zero contract as aw-template.spec.ts: local dev =
// fresh @e2e.alphawolf.test signup; deployed targets = the seeded SMOKE_CUSTOMER
// (dev-otp is 404 in prod). Every created project is soft-deleted in afterEach
// through the real owner path, so repeat runs never leak into the live DB.
//
// The editor is Konva (canvas, not DOM); interactions drive the stage through
// the dev-only `window.__KONVA_STAGE__` handle the editor exposes when
// NODE_ENV !== 'production' (CanvasStage.tsx). Konva nodes support
// .find(sel)/.findOne(sel) and .fire(eventType, evt?, bubble?).

import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, signIn, uniqueEmail } from './support/flows';
import { cleanupCreatedProjects } from './support/cleanup';

const AW_X3_VEHICLE_ID = 'aa000001-0000-4000-8000-000000000001';

// Minimal shape of the dev-only Konva stage handle — avoids a hard konva type
// import inside page.evaluate. find returns nodes; fire(eventType, evt?, bubble?)
// dispatches a synthetic event up the parent chain when bubble is true.
type KNode = { fire: (evt: string, e?: unknown, bubble?: boolean) => void };
type StageHandle = { find: (s: string) => KNode[]; findOne: (s: string) => KNode | undefined };

const HAS_SEEDED_CUSTOMER = Boolean(
  process.env.SMOKE_CUSTOMER_EMAIL && process.env.SMOKE_CUSTOMER_PASSWORD,
);

function isRemoteTarget(): boolean {
  const url = process.env.DEPLOY_URL;
  if (!url) return false;
  const { hostname } = new URL(url);
  return !['localhost', '127.0.0.1', '::1'].includes(hostname);
}

async function createProjectOnX3(page: Page): Promise<string> {
  await page.goto(`/vehicles/${AW_X3_VEHICLE_ID}`);
  // Primary path (matches aw-template.spec.ts); fall back to role-driven dialog
  // if the testid CTA isn't surfaced (mirrors editor.spec.ts robustness).
  const cta = page.getByTestId('start-project-cta');
  if (await cta.isVisible().catch(() => false)) {
    await cta.click();
    const submit = page.getByTestId('start-project-submit');
    if (await submit.isVisible().catch(() => false)) {
      await submit.click();
    } else {
      await page
        .getByRole('dialog')
        .getByRole('button', { name: /create|start/i })
        .click();
    }
  } else {
    await page.getByRole('button', { name: /start a project/i }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: /create|start/i })
      .click();
  }
  await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/, { timeout: 60_000 });
  const m = page.url().match(/\/projects\/([0-9a-f-]+)\/editor/);
  if (!m) throw new Error('did not land in editor');
  return m[1] as string;
}

test.describe('Goal 12 — editor overhaul on AW-TPL-0001 (BMW X3)', () => {
  test.skip(
    isRemoteTarget() && !HAS_SEEDED_CUSTOMER,
    'Against a deployed target set SMOKE_CUSTOMER_EMAIL/PASSWORD — dev-otp is 404 in production.',
  );

  // Net-zero (Goal 9.1 D1): soft-delete every X3 project this spec creates so the
  // persistent smoke account doesn't leak it into the live DB on each run.
  const createdProjectIds: string[] = [];
  test.afterEach(async ({ page }) => {
    await cleanupCreatedProjects(page, createdProjectIds);
  });

  test('renders recognizable vehicle art + multi-view + selectable zones + in-editor AI', async ({
    page,
    request,
  }) => {
    test.setTimeout(300_000);

    const seededEmail = process.env.SMOKE_CUSTOMER_EMAIL;
    const seededPassword = process.env.SMOKE_CUSTOMER_PASSWORD;
    if (seededEmail && seededPassword) {
      await signIn(page, seededEmail, '/vehicles/select', seededPassword);
    } else {
      const email = uniqueEmail('g12');
      await signUpAndVerify(page, request, email);
      await signIn(page, email, '/vehicles/select');
    }

    // ---- 1. Editor opens on the X3; the canvas mounts. ----
    const projectId = await createProjectOnX3(page);
    createdProjectIds.push(projectId);
    await page.getByTestId('canvas-ready').waitFor({ state: 'attached', timeout: 60_000 });
    await expect(page.getByTestId('editor-root').last()).toBeVisible();

    // ---- 2. Art backdrop renders (D2): the approved AI art mounts as a Konva
    // Image node. It mounts only after the (cross-origin) HTMLImage onload fires,
    // so poll generously rather than asserting once. ----
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const stage = (window as unknown as { __KONVA_STAGE__?: StageHandle }).__KONVA_STAGE__;
            return stage ? stage.find('Image').length : 0;
          }),
        {
          message: 'vehicle art Image node should mount on the Konva stage',
          timeout: 60_000,
          intervals: [500, 1000, 2000],
        },
      )
      .toBeGreaterThan(0);

    // ---- 3. View selector (D2): the X3's 4 views + "all" are offered, and the
    // camera toggles. The X3 panels span back/driver/front/passenger (no top). ----
    const viewSelector = page.getByTestId('view-selector');
    await expect(viewSelector).toBeVisible();
    for (const v of ['view-all', 'view-driver', 'view-front', 'view-back', 'view-passenger']) {
      await expect(page.getByTestId(v)).toBeVisible();
    }

    const driverBtn = page.getByTestId('view-driver');
    await driverBtn.click();
    await expect(driverBtn).toHaveAttribute('aria-pressed', 'true');

    const allBtn = page.getByTestId('view-all');
    await allBtn.click();
    await expect(allBtn).toHaveAttribute('aria-pressed', 'true');
    // Back to "all" so every view's zones are on the stage for the next step.

    // ---- 4. Wrap-zone select (D2): clicking a zone surfaces its name + the
    // calibrated area in the inspector. Drive the click through the stage handle;
    // every X3 panel is calibrated so zone-area must populate. ----
    const fired = await page.evaluate(() => {
      const stage = (window as unknown as { __KONVA_STAGE__?: StageHandle }).__KONVA_STAGE__;
      if (!stage) return false;
      const zone = stage.find('.wrap-zone')[0];
      if (!zone) return false;
      // bubble=true so the synthetic event reaches the Path's onClick handler
      // (Konva → React click bridge), which calls onZoneSelect(panel.id).
      zone.fire('click', { type: 'click' }, true);
      return true;
    });
    expect(fired).toBe(true);

    const inspector = page.getByTestId('zone-inspector');
    await expect(inspector).toBeVisible();
    const zoneName = page.getByTestId('zone-name');
    await expect(zoneName).toBeVisible({ timeout: 15_000 });
    await expect(zoneName).not.toHaveText('');
    // X3 areas are calibrated → the formatted m²·ft² readout renders.
    await expect(page.getByTestId('zone-area')).toBeVisible({ timeout: 15_000 });

    // ---- 5. AI design assistant inside the editor (D3): the top-bar entry opens
    // a dialog that shows the credit cost before generating. The testid appears
    // twice (header bar + the in-canvas CTA when no design exists yet); scope to
    // the top bar (role=banner), which is the entry point the prompt specifies. ----
    const aiButton = page.getByRole('banner').getByTestId('design-with-ai');
    await expect(aiButton).toBeVisible();
    await aiButton.click();
    await expect(page.getByTestId('ai-credit-balance')).toBeVisible({ timeout: 15_000 });
  });
});
