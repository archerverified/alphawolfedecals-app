// Test-account retirement CLI (Goal 9 rider 5). A DOCUMENTED, RLS-safe
// maintenance routine that retires the synthetic test cohort accumulating in the
// LIVE shared DB from local E2E / smoke / proof runs.
//
//   pnpm --filter @alphawolf/db db:retire-test-accounts            # DRY RUN (default)
//   pnpm --filter @alphawolf/db db:retire-test-accounts --apply    # actually delete
//
// The classification + deletion logic lives in src/repos/maintenance.ts so the
// CLI and the daily maintenance cron share ONE implementation (Goal 9.1 D1). This
// file is just the dry-run/apply CLI wrapper. DETERMINISTIC COHORT: an account is
// "test" iff its decrypted email ends with one of RETIRE_SUFFIXES — RFC-reserved
// / synthetic domains a real customer can never own. That allowlist IS the safety
// guarantee.
//
// SECURITY: deleting real user data is gated on the §3 second security review +
// this routine (per CLAUDE.md). Runs on withSystem (system maintenance, no user
// session). Requires the prod env (DATABASE_URL + PII_ENCRYPTION_KEY) to decrypt
// + classify; run via `dotenv -e .env`.

import { RETIRE_SUFFIXES, classifyCohort, redact, retireOne } from '../src/repos/maintenance.js';

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

  // Blast-radius ceiling for an IRREVERSIBLE op (§3 security review): abort if the
  // freshly-classified cohort exceeds an explicit `--max=<n>`. Cheap TOCTOU guard
  // against a classification that somehow over-matches between dry-run and apply.
  const maxArg = process.argv.find((a) => a.startsWith('--max='));
  const max = maxArg ? Number(maxArg.slice('--max='.length)) : null;
  if (max !== null && test.length > max) {
    console.error(
      `\n✋ ABORT: cohort ${test.length} exceeds --max=${max}. Re-review the dry run before applying.\n`,
    );
    process.exitCode = 1;
    return;
  }

  // Per-account isolation: one account that can't be deleted must not leave the
  // prod DB half-retired — log, continue, report, and exit non-zero so failures
  // are visible.
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
  console.log(
    `\nRETIRED ${retired}/${test.length} account(s): ${projects} project(s) and ${storage} storage object(s) removed.\n`,
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
