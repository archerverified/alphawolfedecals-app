// Test-data maintenance (Goal 9 rider 5 + Goal 9.1 D1). The single source of
// truth for classifying + removing the synthetic test data that accumulates in
// the LIVE shared DB from local E2E / smoke / proof runs. Both the CLI
// (scripts/retire-test-accounts.ts) and the daily maintenance cron
// (apps/web/app/api/cron/sweep-generation) import from here so there is exactly
// ONE implementation of "what counts as test data" and "how it's removed".
//
// SECURITY: deleting user data runs on withSystem (system maintenance, no user
// session — the legitimate withSystem use) and is gated by the §3 second security
// review. The suffix allowlists below ARE the safety guarantee: a real customer
// can never own these RFC-reserved / synthetic domains, so a real account or its
// data never matches. Never widen them to a pattern a real domain could match.

import { withSystem, type TxClient } from '../client.js';
import { decryptPii } from '../crypto.js';
import { removeAssetObject } from '../storage/supabase.js';

// ── Cohorts ──────────────────────────────────────────────────────────────────

// ACCOUNT-retirement cohort: a whole synthetic ACCOUNT (+ everything it created)
// is deleted iff its decrypted email ends with one of these. RFC-reserved /
// synthetic domains a real customer can never own:
//   @e2e.alphawolf.test     — Playwright E2E identities (uniqueEmail)
//   @test.alphawolf.example — RLS integration-test identities
//   @example.com / @example-shop.test — smoke + demo + brief-wizard fixtures
export const RETIRE_SUFFIXES = [
  '@e2e.alphawolf.test',
  '@test.alphawolf.example',
  '@example.com',
  '@example-shop.test',
] as const;

// PROJECT-purge cohort: these accounts' PROJECTS are pure test artifacts and are
// hard-purged, but the ACCOUNT itself may legitimately persist. Adds the smoke
// seed domain `@alphawolf.test` — the persistent, pre-seeded production-smoke
// login (scripts/seed-smoke-accounts.ts). It must NOT be in RETIRE_SUFFIXES (the
// smoke would lose its account), yet its projects leak ~3 per deploy with no
// teardown, so we purge the projects while keeping the login. `.test` is an
// RFC-2606 reserved TLD — no real domain.
export const PURGE_PROJECT_SUFFIXES = [...RETIRE_SUFFIXES, '@alphawolf.test'] as const;

export function matchesSuffix(email: string, suffixes: readonly string[]): boolean {
  const e = email.trim().toLowerCase();
  return suffixes.some((s) => e.endsWith(s));
}

// Account-retirement predicate: does this email's whole account get deleted?
export function isRetireCohortEmail(email: string): boolean {
  return matchesSuffix(email, RETIRE_SUFFIXES);
}

// Project-purge predicate: do this email's leaked projects get hard-purged?
export function isPurgeCohortEmail(email: string): boolean {
  return matchesSuffix(email, PURGE_PROJECT_SUFFIXES);
}

export function redact(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  return `${local.slice(0, 2)}***${email.slice(at)}`;
}

export type TestUser = {
  id: string;
  email: string;
  accountType: string;
  isAdmin: boolean;
  createdAt: Date;
};

// ── Classification ───────────────────────────────────────────────────────────

// Decrypt + classify every account ONCE. Decryption is a per-row pgcrypto
// round-trip, so it's done in bounded batches — each batch is its own short
// withSystem transaction — instead of one transaction over the whole table (the
// 15s tx timeout would eventually trip as the real user base grows). The cron
// calls this once per tick and feeds the result to BOTH sweeps (no double pass).
export async function classifyAllUsers(opts: { batchSize?: number } = {}): Promise<TestUser[]> {
  const batchSize = opts.batchSize ?? 50;
  // One short read for the ciphertext rows (no decrypt — just bytes).
  const rows = await withSystem((db) =>
    db.user.findMany({
      select: {
        id: true,
        emailEncrypted: true,
        accountType: true,
        isAdmin: true,
        createdAt: true,
      },
    }),
  );
  const out: TestUser[] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const decrypted = await withSystem(async (db) => {
      const r: TestUser[] = [];
      for (const u of batch) {
        r.push({
          id: u.id,
          email: await decryptPii(db, u.emailEncrypted),
          accountType: u.accountType,
          isAdmin: u.isAdmin,
          createdAt: u.createdAt,
        });
      }
      return r;
    });
    out.push(...decrypted);
  }
  return out;
}

// Partition a classified set into the retire cohort + a tripwire: any NON-test
// account that still carries is_admin (rider-5 invariant — never auto-touched,
// surfaced for human review). Pure; takes an already-decrypted set.
export function partitionRetireCohort(users: TestUser[]): {
  test: TestUser[];
  adminNonTest: TestUser[];
} {
  const test: TestUser[] = [];
  const adminNonTest: TestUser[] = [];
  for (const u of users) {
    if (isRetireCohortEmail(u.email)) test.push(u);
    else if (u.isAdmin) adminNonTest.push(u);
  }
  return { test, adminNonTest };
}

// Convenience wrapper for the CLI + standalone callers (classifies, then
// partitions). The cron uses classifyAllUsers + partitionRetireCohort directly so
// it shares one decrypt pass across both sweeps.
export async function classifyCohort(): Promise<{ test: TestUser[]; adminNonTest: TestUser[] }> {
  return partitionRetireCohort(await classifyAllUsers());
}

// ── Storage helpers ──────────────────────────────────────────────────────────

// Collect the storage object keys hung off a project BEFORE the cascade wipes the
// rows (the keys are only knowable from the rows the cascade destroys). Shared by
// retireOne + purgeTestProjects so storage cleanup never drifts between the two.
async function collectProjectStorageKeys(db: TxClient, projectIds: string[]): Promise<string[]> {
  if (projectIds.length === 0) return [];
  const assets = await db.projectAsset.findMany({
    where: { projectId: { in: projectIds } },
    select: { sourceUrl: true, parsedUrl: true },
  });
  const genImages = await db.generationImage.findMany({
    where: { run: { projectId: { in: projectIds } } },
    select: { storagePath: true, previewPath: true },
  });
  const paths = new Set<string>();
  for (const a of assets) {
    if (a.sourceUrl) paths.add(a.sourceUrl);
    if (a.parsedUrl) paths.add(a.parsedUrl);
  }
  for (const g of genImages) {
    paths.add(g.storagePath);
    if (g.previewPath) paths.add(g.previewPath);
  }
  return [...paths];
}

async function removeStorageKeys(keys: string[]): Promise<number> {
  let removed = 0;
  for (const key of keys) {
    try {
      await removeAssetObject(key);
      removed += 1;
    } catch {
      // best-effort: a missing object / unconfigured storage never fails the sweep.
    }
  }
  return removed;
}

// ── Account retirement ───────────────────────────────────────────────────────

// Delete one test account + everything it created (mirrors db:cleanup-e2e).
// Projects do NOT cascade from users (schema note), so they're deleted first; the
// user cascades credit_ledger / referral_attributions / otp / auth events.
export async function retireOne(userId: string): Promise<{ projects: number; storage: number }> {
  const { storageKeys, projectCount } = await withSystem(async (db) => {
    const projects = await db.project.findMany({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
    const keys = await collectProjectStorageKeys(db, projectIds);
    await db.project.deleteMany({ where: { ownerUserId: userId } });
    await db.user.delete({ where: { id: userId } });
    return { storageKeys: keys, projectCount: projectIds.length };
  });
  const storage = await removeStorageKeys(storageKeys);
  return { projects: projectCount, storage };
}

// Apply loop shared by the cron (the CLI keeps its own dry-run printing but reuses
// classifyCohort + retireOne). Pass a pre-classified `test` set to avoid a second
// decrypt pass. Bounded per call so the first post-backlog run can never blow the
// Hobby 60s function ceiling — leftovers drain on the next tick.
export async function retireTestAccounts(
  opts: { limit?: number; test?: TestUser[]; adminNonTest?: number } = {},
): Promise<{ retired: number; projects: number; storage: number; adminNonTest: number }> {
  const limit = opts.limit ?? 50;
  let test = opts.test;
  let adminNonTest = opts.adminNonTest ?? 0;
  if (!test) {
    const c = await classifyCohort();
    test = c.test;
    adminNonTest = c.adminNonTest.length;
  }
  const batch = test.slice(0, limit);
  let projects = 0;
  let storage = 0;
  for (const u of batch) {
    const res = await retireOne(u.id);
    projects += res.projects;
    storage += res.storage;
  }
  return { retired: batch.length, projects, storage, adminNonTest };
}

// ── Project purge (the per-deploy smoke leak) ────────────────────────────────

// Hard-purge leaked test PROJECTS without deleting their (persistent) account.
// Targets the per-deploy prod-smoke leak: each deploy the seeded @alphawolf.test
// smoke customer creates ~3 projects with no teardown. Self-clean soft-deletes
// them per run; this is the guaranteed server-side hard purge.
//
// Guards:
//   * cohort-scoped: owner's decrypted email ∈ PURGE_PROJECT_SUFFIXES only.
//   * ownerShopId IS NULL: never touches the deliberately-persistent seeded
//     routed-order fixture (seed-smoke-accounts.ts pins ownerShopId on it).
//   * updatedAt older than `olderThanMinutes`: never races an in-flight smoke run
//     (smoke.yml runs are serialized via concurrency:cancel-in-progress and
//     finish well inside the window).
//   * `limit`-bounded: a backlog drains across daily ticks (Hobby 60s ceiling).
//
// Pass `cohortUserIds` to reuse a classification the caller already did.
export async function purgeTestProjects(
  opts: { olderThanMinutes?: number; limit?: number; cohortUserIds?: string[] } = {},
): Promise<{ projects: number; storage: number }> {
  const olderThanMinutes = opts.olderThanMinutes ?? 30;
  const limit = opts.limit ?? 200;

  const cohortIds =
    opts.cohortUserIds ??
    (await classifyAllUsers()).filter((u) => isPurgeCohortEmail(u.email)).map((u) => u.id);
  if (cohortIds.length === 0) return { projects: 0, storage: 0 };

  // Candidate projects: cohort-owned, NOT a routed-order fixture, settled.
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const candidates = await withSystem((db) =>
    db.project.findMany({
      where: {
        ownerUserId: { in: cohortIds },
        ownerShopId: null,
        updatedAt: { lt: cutoff },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: limit,
    }),
  );

  // Purge each in its own transaction (collect keys → cascade delete → remove
  // storage), so a mid-backlog timeout keeps its progress.
  let projects = 0;
  let storage = 0;
  for (const { id } of candidates) {
    const keys = await withSystem(async (db) => {
      const k = await collectProjectStorageKeys(db, [id]);
      await db.project.delete({ where: { id } });
      return k;
    });
    projects += 1;
    storage += await removeStorageKeys(keys);
  }
  return { projects, storage };
}

// ── Cron entry point ─────────────────────────────────────────────────────────

// One classification pass feeding BOTH sweeps. The cron calls this; callers that
// want only one sweep can use purgeTestProjects / retireTestAccounts directly.
export async function sweepTestData(
  opts: { olderThanMinutes?: number; purgeLimit?: number; retireLimit?: number } = {},
): Promise<{
  projectsPurged: number;
  storagePurged: number;
  accountsRetired: number;
  accountProjects: number;
  adminTripwire: number;
}> {
  const users = await classifyAllUsers();
  const purgeIds = users.filter((u) => isPurgeCohortEmail(u.email)).map((u) => u.id);
  const { test, adminNonTest } = partitionRetireCohort(users);

  const purge = await purgeTestProjects({
    olderThanMinutes: opts.olderThanMinutes,
    limit: opts.purgeLimit,
    cohortUserIds: purgeIds,
  });
  const retire = await retireTestAccounts({
    limit: opts.retireLimit,
    test,
    adminNonTest: adminNonTest.length,
  });

  return {
    projectsPurged: purge.projects,
    storagePurged: purge.storage,
    accountsRetired: retire.retired,
    accountProjects: retire.projects,
    adminTripwire: retire.adminNonTest,
  };
}
