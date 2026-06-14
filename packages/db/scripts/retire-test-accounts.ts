// Test-account retirement CLI (Goal 9 rider 5; bare-smoke straggler path added
// Goal 10 D0). A DOCUMENTED, RLS-safe maintenance routine that retires the
// synthetic test cohort accumulating in the LIVE shared DB from local E2E / smoke
// / proof runs.
//
//   pnpm --filter @alphawolf/db db:retire-test-accounts                       # DRY RUN
//   pnpm --filter @alphawolf/db db:retire-test-accounts --apply               # delete RETIRE_SUFFIXES cohort
//   ... --include-bare-smoke --keep=<uuid> --keep=<uuid> --apply              # also retire stale @alphawolf.test
//
// The classification + deletion logic lives in src/repos/maintenance.ts so the CLI
// and the daily maintenance cron share ONE implementation. DETERMINISTIC COHORT:
// an account is "test" iff its decrypted email ends with one of RETIRE_SUFFIXES —
// RFC-reserved / synthetic domains a real customer can never own. That allowlist
// IS the safety guarantee.
//
// `--include-bare-smoke` (Goal 10 D0): additionally retire @alphawolf.test
// STRAGGLERS — old seed runs that are no longer the active CI smoke login. This is
// NEVER done automatically (the daily cron leaves @alphawolf.test accounts alone so
// it can't delete the live smoke login). The MANUAL path requires `--keep=<uuid>`
// for the live keeper(s) and is protected by the same guards below.
//
// SECURITY: deleting real user data is gated on the §3 second security review +
// this routine (per CLAUDE.md). Runs on withSystem (system maintenance, no user
// session). Requires the prod env (DATABASE_URL + PII_ENCRYPTION_KEY) to decrypt
// + classify; run via `dotenv -e .env`.

import {
  RETIRE_SUFFIXES,
  BARE_SMOKE_SUFFIX,
  NEVER_RETIRE_SUFFIXES,
  classifyAllUsers,
  partitionRetireCohort,
  classifyBareSmokeStragglers,
  deleteOrphanShops,
  matchesSuffix,
  redact,
  retireOne,
  type TestUser,
} from '../src/repos/maintenance.js';

// crypto.ts uses $queryRaw tagged templates that collide on the pgBouncer txn
// pooler — run classification on the DIRECT (non-pooled) connection.
if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const includeBareSmoke = process.argv.includes('--include-bare-smoke');
  const keepIds = new Set(
    process.argv
      .filter((a) => a.startsWith('--keep='))
      .map((a) => a.slice('--keep='.length).trim())
      .filter(Boolean),
  );
  const maxArg = process.argv.find((a) => a.startsWith('--max='));
  const max = maxArg ? Number(maxArg.slice('--max='.length)) : null;

  // ONE decrypt pass, shared across the retire cohort + the bare-smoke stragglers.
  const allUsers = await classifyAllUsers();
  const { test: retireCohort, adminNonTest } = partitionRetireCohort(allUsers);
  const bareSmoke: TestUser[] = includeBareSmoke
    ? classifyBareSmokeStragglers(allUsers, keepIds)
    : [];
  const test: TestUser[] = [...retireCohort, ...bareSmoke];

  // Allowed suffixes for THIS run (Guard A reference set).
  const allow = [...RETIRE_SUFFIXES, ...(includeBareSmoke ? [BARE_SMOKE_SUFFIX] : [])];

  // Requested keepers actually present on the bare-smoke domain (a typo'd --keep
  // id keeps nothing — so we assert presence at apply time, see Guard B0).
  const keptPresent = includeBareSmoke
    ? allUsers.filter((u) => matchesSuffix(u.email, [BARE_SMOKE_SUFFIX]) && keepIds.has(u.id))
    : [];

  console.log(`\n=== Test-account retirement (${apply ? 'APPLY' : 'DRY RUN'}) ===`);
  console.log(`Allowed suffixes: ${allow.join(', ')}`);
  if (includeBareSmoke) {
    console.log(
      `Bare-smoke keepers (preserved): ${keptPresent.length} of ${keepIds.size} requested`,
    );
    for (const u of keptPresent) console.log(`  KEEP ${u.id}  ${redact(u.email)}`);
  }
  console.log(`\nCohort to retire: ${test.length} account(s)`);
  const byType = test.reduce<Record<string, number>>((acc, u) => {
    acc[u.accountType] = (acc[u.accountType] ?? 0) + 1;
    return acc;
  }, {});
  console.log(`  by account_type: ${JSON.stringify(byType)}`);
  console.log(`  still is_admin: ${test.filter((u) => u.isAdmin).length}`);
  for (const u of test) {
    console.log(`  - ${u.id}  ${redact(u.email)} [${u.accountType}${u.isAdmin ? ', ADMIN' : ''}]`);
  }

  if (adminNonTest.length > 0) {
    console.warn(`\n⚠️  ${adminNonTest.length} NON-test account(s) carry is_admin:`);
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

  // ── APPLY GUARDS (an irreversible op — fail closed) ──────────────────────────
  // Guard B0: every requested keeper must be found present (a typo'd --keep id
  // would otherwise silently retire the live smoke login it was meant to protect).
  if (includeBareSmoke && keptPresent.length < keepIds.size) {
    console.error(
      `\n✋ ABORT: only ${keptPresent.length}/${keepIds.size} requested keeper(s) found on ${BARE_SMOKE_SUFFIX} — refusing to retire with an unmatched --keep id.`,
    );
    process.exitCode = 1;
    return;
  }
  // Guard B1: no real domain (operator / Archer) in the cohort — checked first so
  // the scariest failure is the one surfaced.
  const realDomain = test.filter((u) => matchesSuffix(u.email, NEVER_RETIRE_SUFFIXES));
  if (realDomain.length > 0) {
    console.error(
      `\n✋ ABORT (Guard B): ${realDomain.length} REAL-domain account(s) in the cohort.`,
    );
    for (const u of realDomain) console.error(`  - ${redact(u.email)}`);
    process.exitCode = 1;
    return;
  }
  // Guard A: every cohort email ends with an allowlisted suffix.
  const notAllowed = test.filter((u) => !matchesSuffix(u.email, allow));
  if (notAllowed.length > 0) {
    console.error(
      `\n✋ ABORT (Guard A): ${notAllowed.length} cohort email(s) outside the allowlist.`,
    );
    for (const u of notAllowed) console.error(`  - ${redact(u.email)}`);
    process.exitCode = 1;
    return;
  }
  // Guard B2: the admin tripwire must be empty (rider-5 invariant).
  if (adminNonTest.length > 0) {
    console.error(
      `\n✋ ABORT (Guard B): ${adminNonTest.length} non-test is_admin account(s) present.`,
    );
    process.exitCode = 1;
    return;
  }
  // Guard B3: no requested keeper leaked into the cohort.
  const keptInCohort = test.filter((u) => keepIds.has(u.id));
  if (keptInCohort.length > 0) {
    console.error(`\n✋ ABORT: ${keptInCohort.length} keeper id(s) present in the retire cohort.`);
    process.exitCode = 1;
    return;
  }
  // Blast-radius ceiling (TOCTOU guard): abort if cohort exceeds --max.
  if (max !== null && test.length > max) {
    console.error(`\n✋ ABORT: cohort ${test.length} exceeds --max=${max}.`);
    process.exitCode = 1;
    return;
  }

  // Per-account isolation: one undeletable account must not leave the DB
  // half-retired — log, continue, report, exit non-zero so failures are visible.
  let retired = 0;
  let projects = 0;
  let storage = 0;
  const failures: string[] = [];
  for (const u of test) {
    try {
      const res = await retireOne(u.id);
      retired += 1;
      projects += res.projects;
      storage += res.storage;
    } catch (err) {
      failures.push(`${redact(u.email)}: ${err instanceof Error ? err.message : 'unknown'}`);
    }
  }
  const orphanShops = await deleteOrphanShops();
  console.log(
    `\nRETIRED ${retired}/${test.length} account(s): ${projects} project(s), ${storage} storage object(s), ${orphanShops} orphan shop(s) removed.\n`,
  );
  if (failures.length > 0) {
    console.error(`⚠️  ${failures.length} account(s) FAILED to retire:`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
