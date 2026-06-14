// Test-account retirement routine (Goal 9 rider 5). A DOCUMENTED, RLS-safe
// maintenance routine (not ad-hoc) that retires the synthetic test cohort that
// accumulates in the LIVE shared DB from local E2E / smoke / proof runs.
//
//   pnpm --filter @alphawolf/db db:retire-test-accounts            # DRY RUN (default)
//   pnpm --filter @alphawolf/db db:retire-test-accounts --apply    # actually delete
//
// DETERMINISTIC COHORT: an account is "test" iff its (decrypted) email ends with
// one of RETIRE_SUFFIXES — all RFC-reserved / synthetic domains that a real
// customer can never own. This allowlist IS the safety guarantee: a real account
// (e.g. @1stimpression.co) never matches and is never touched. Dry-run prints the
// cohort for review; --apply deletes (cascade), mirroring db:cleanup-e2e.
//
// SECURITY: deleting real user data is gated on the §3 second security review +
// this routine (per CLAUDE.md). Runs on withSystem (system maintenance, no user
// session) — the legitimate withSystem use. Requires the prod env (DATABASE_URL
// + PII_ENCRYPTION_KEY) to decrypt + classify; run via `dotenv -e .env`.

import { withSystem } from '../src/client.js';
import { decryptPii } from '../src/crypto.js';
import { removeAssetObject } from '../src/storage/supabase.js';

// Synthetic / RFC-reserved domains. None can belong to a real customer:
//   @e2e.alphawolf.test   — Playwright E2E identities (uniqueEmail)
//   @test.alphawolf.example — RLS integration-test identities
//   @example.com / @example-shop.test — smoke + demo + brief-wizard fixtures
const RETIRE_SUFFIXES = [
  '@e2e.alphawolf.test',
  '@test.alphawolf.example',
  '@example.com',
  '@example-shop.test',
];

function redact(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  return `${local.slice(0, 2)}***${email.slice(at)}`;
}

type TestUser = {
  id: string;
  email: string;
  accountType: string;
  isAdmin: boolean;
  createdAt: Date;
};

async function classifyCohort(): Promise<{ test: TestUser[]; adminNonTest: TestUser[] }> {
  return withSystem(async (db) => {
    const users = await db.user.findMany({
      select: {
        id: true,
        emailEncrypted: true,
        accountType: true,
        isAdmin: true,
        createdAt: true,
      },
    });
    const test: TestUser[] = [];
    const adminNonTest: TestUser[] = [];
    for (const u of users) {
      const email = await decryptPii(db, u.emailEncrypted);
      const lower = email.toLowerCase();
      const isTest = RETIRE_SUFFIXES.some((s) => lower.endsWith(s));
      const row: TestUser = {
        id: u.id,
        email,
        accountType: u.accountType,
        isAdmin: u.isAdmin,
        createdAt: u.createdAt,
      };
      if (isTest) test.push(row);
      // Tripwire: a REAL account that still carries is_admin — never auto-touched,
      // surfaced for human review (rider-5 invariant: no elevated real accounts).
      else if (u.isAdmin) adminNonTest.push(row);
    }
    return { test, adminNonTest };
  });
}

// Delete one test user + everything it created (mirrors db:cleanup-e2e). Projects
// do NOT cascade from users (schema note), so they're deleted first; the user
// cascades credit_ledger / referral_attributions / otp / auth events.
async function retireOne(userId: string): Promise<{ projects: number; storage: number }> {
  const { storagePaths, projectCount } = await withSystem(async (db) => {
    const projects = await db.project.findMany({
      where: { ownerUserId: userId },
      select: { id: true },
    });
    const projectIds = projects.map((p) => p.id);
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
    await db.project.deleteMany({ where: { ownerUserId: userId } });
    await db.user.delete({ where: { id: userId } });
    return { storagePaths: [...paths], projectCount: projectIds.length };
  });

  let removed = 0;
  for (const path of storagePaths) {
    try {
      await removeAssetObject(path);
      removed += 1;
    } catch {
      // best-effort
    }
  }
  return { projects: projectCount, storage: removed };
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const { test, adminNonTest } = await classifyCohort();

  console.log(`\n=== Test-account retirement (${apply ? 'APPLY' : 'DRY RUN'}) ===`);
  console.log(`Test cohort: ${test.length} account(s) matching ${RETIRE_SUFFIXES.join(', ')}`);
  const byType = test.reduce<Record<string, number>>((acc, u) => {
    acc[u.accountType] = (acc[u.accountType] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  by account_type: ${JSON.stringify(byType)}`);
  const stillAdmin = test.filter((u) => u.isAdmin).length;
  console.log(`  still is_admin: ${stillAdmin}`);
  for (const u of test) {
    console.log(`  - ${redact(u.email)} [${u.accountType}${u.isAdmin ? ', ADMIN' : ''}]`);
  }

  if (adminNonTest.length > 0) {
    console.warn(
      `\n⚠️  ${adminNonTest.length} NON-test account(s) carry is_admin — NOT touched, review manually:`,
    );
    for (const u of adminNonTest) console.warn(`  - ${redact(u.email)}`);
  }

  if (!apply) {
    console.log('\nDry run only. Re-run with --apply to retire the cohort above.\n');
    return;
  }
  if (test.length === 0) {
    console.log('\nNothing to retire.\n');
    return;
  }

  let projects = 0;
  let storage = 0;
  for (const u of test) {
    const res = await retireOne(u.id);
    projects += res.projects;
    storage += res.storage;
  }
  console.log(
    `\nRETIRED ${test.length} account(s): ${projects} project(s) and ${storage} storage object(s) removed.\n`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
