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

import { expect, type Page } from '@playwright/test';

// Soft-delete one project via the /projects card menu → confirm dialog. No-ops if
// the card is already gone (never created, or a prior attempt removed it).
// NB: /projects lists at most 200 active projects, so if the daily hard-purge cron
// were ever disabled and the smoke ran 200+ times between sweeps, the oldest cards
// would fall off this list and self-clean would no-op on them — the cron backstop
// (maintenance.purgeTestProjects) catches those, so this is fast-feedback only.
export async function softDeleteProjectViaUi(page: Page, projectId: string): Promise<void> {
  await page.goto('/projects');
  const card = page.getByTestId('project-card').filter({
    has: page.locator(`a[data-testid="project-open"][href="/projects/${projectId}/editor"]`),
  });
  if ((await card.count()) === 0) return;
  await card.getByTestId('project-menu-trigger').click();
  await page.getByTestId('project-delete-item').click();
  await page.getByTestId('delete-confirm').click();
  // Soft-deleted projects drop out of the active list — the card disappears.
  await expect(card).toHaveCount(0, { timeout: 15_000 });
}

// Drain a tracked-id list, best-effort. Mutates `ids` (pops as it goes) so a
// re-entrant afterEach never double-deletes.
export async function cleanupCreatedProjects(page: Page, ids: string[]): Promise<void> {
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
