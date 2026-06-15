// Smoke self-clean (Goal 9.1 D1). The prod smoke (mvp-flow / brief-wizard /
// aw-template) signs in as ONE persistent pre-seeded @alphawolf.test account and
// creates ~3 projects per deploy with no teardown — they leaked into the live DB
// forever. These helpers net-zero a spec's OWN data each run by soft-deleting the
// projects it created, through the genuine authenticated customer path (the same
// /projects delete control a real user uses — RLS-scoped to the owner). The
// account itself (the persistent smoke login) is untouched.
//
// This is the fast-feedback layer; the daily maintenance cron
// (api/cron/sweep-generation → maintenance.purgeTestProjects) is the GUARANTEED
// server-side hard purge that also catches a crashed worker or a retried spec.
// So every step here is best-effort: it must never fail the spec it cleans up.

import { expect, test, type Page } from '@playwright/test';

// Teardown budget + bounds (Goal 11 D4). Playwright counts the test body AND the
// afterEach hook against ONE shared test timeout. On a cold production deploy the
// long brief-wizard journey (two uploads) consumed most of the 300s budget AND
// the self-clean's `/projects` navigation could hang (no nav timeout) →
// "Test timeout of 300000ms exceeded while running afterEach hook", then a 30-min
// job timeout once the deadline was merely extended. Two-part fix:
//   1. extend the deadline so teardown isn't starved by a slow body, AND
//   2. give every teardown STEP its own short timeout so a cold/hanging
//      `/projects` fails fast → the caller swallows it (best-effort) and the
//      daily purge cron reclaims the project. The smoke stays GREEN instead of
//      dying in teardown; no assertion is weakened (the test body's own expects
//      keep their own timeouts).
const TEARDOWN_BUDGET_MS = 120_000;
const NAV_TIMEOUT_MS = 25_000;
const STEP_TIMEOUT_MS = 10_000;

// Soft-delete one project via the /projects card menu → confirm dialog. No-ops if
// the card is already gone (never created, or a prior attempt removed it).
// NB: /projects lists at most 200 active projects, so if the daily hard-purge cron
// were ever disabled and the smoke ran 200+ times between sweeps, the oldest cards
// would fall off this list and self-clean would no-op on them — the cron backstop
// (maintenance.purgeTestProjects) catches those, so this is fast-feedback only.
export async function softDeleteProjectViaUi(page: Page, projectId: string): Promise<void> {
  // Bounded nav: domcontentloaded (not 'load' — don't wait on every cold-start
  // resource) and a hard cap so this can never hang the afterEach.
  await page.goto('/projects', { timeout: NAV_TIMEOUT_MS, waitUntil: 'domcontentloaded' });
  const card = page.getByTestId('project-card').filter({
    has: page.locator(`a[data-testid="project-open"][href="/projects/${projectId}/editor"]`),
  });
  // The card is server-rendered; wait briefly for it before concluding it's gone
  // (a slow cold render shouldn't be misread as "already deleted").
  await card
    .first()
    .waitFor({ state: 'visible', timeout: STEP_TIMEOUT_MS })
    .catch(() => undefined);
  if ((await card.count()) === 0) return;
  // Open the Radix overflow menu, then click delete. The FIRST trigger click
  // frequently no-ops (the menu doesn't mount), so the delete item never appears
  // and teardown silently leaked the project (soft_deleted stayed false) — this
  // was no-op'ing net-zero for every spec using this helper. Retry the open until
  // the destructive item is actually visible (Goal 12; the prior single-click is
  // the original 2026-06-14 leak source).
  const trigger = card.getByTestId('project-menu-trigger');
  const deleteItem = page.getByTestId('project-delete-item');
  for (let attempt = 0; attempt < 5; attempt++) {
    await trigger.click({ timeout: STEP_TIMEOUT_MS });
    if (await deleteItem.isVisible().catch(() => false)) break;
    await deleteItem.waitFor({ state: 'visible', timeout: 1500 }).catch(() => undefined);
    if (await deleteItem.isVisible().catch(() => false)) break;
  }
  await deleteItem.click({ timeout: STEP_TIMEOUT_MS });
  await page.getByTestId('delete-confirm').click({ timeout: STEP_TIMEOUT_MS });
  // Soft-deleted projects drop out of the active list — the card disappears.
  await expect(card).toHaveCount(0, { timeout: STEP_TIMEOUT_MS });
}

// Drain a tracked-id list, best-effort. Mutates `ids` (pops as it goes) so a
// re-entrant afterEach never double-deletes.
export async function cleanupCreatedProjects(page: Page, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // Give teardown its own budget ON TOP of whatever the (cold-prod-slow) test
  // body already burned — additive so the shared deadline only ever grows, never
  // shrinks below the elapsed time.
  test.setTimeout(test.info().timeout + TEARDOWN_BUDGET_MS);
  while (ids.length > 0) {
    const id = ids.pop();
    if (!id) continue;
    try {
      await softDeleteProjectViaUi(page, id);
    } catch {
      // best-effort — the daily maintenance cron is the guaranteed backstop.
    }
  }
}
