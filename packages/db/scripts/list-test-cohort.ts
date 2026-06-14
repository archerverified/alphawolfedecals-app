// Read-only cohort inspector (Goal 10 D0). Decrypts + classifies every account
// like the maintenance routine, but ONLY prints REDACTED emails + domain + id +
// account_type + created_at — never full PII. Use it to eyeball the live test
// cohort before a retirement --apply.
//
//   dotenv -e packages/db/.env -- tsx packages/db/scripts/list-test-cohort.ts
//
// Runs on the DIRECT (non-pooled) connection: crypto.ts uses $queryRaw tagged
// templates that collide on the pgBouncer transaction pooler.

import {
  classifyAllUsers,
  redact,
  isRetireCohortEmail,
  isPurgeCohortEmail,
} from '../src/repos/maintenance.js';

if (process.env.DIRECT_URL) process.env.DATABASE_URL = process.env.DIRECT_URL;

function domainOf(email: string): string {
  const at = email.lastIndexOf('@');
  return at >= 0 ? email.slice(at).toLowerCase() : '(none)';
}

async function main(): Promise<void> {
  const users = await classifyAllUsers();
  const byDomain = new Map<string, number>();
  for (const u of users)
    byDomain.set(domainOf(u.email), (byDomain.get(domainOf(u.email)) ?? 0) + 1);

  console.log(`\n=== ${users.length} account(s) by domain ===`);
  for (const [d, n] of [...byDomain.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${d}`);
  }

  console.log(`\n=== per-account (redacted) ===`);
  for (const u of [...users].sort((a, b) => +a.createdAt - +b.createdAt)) {
    const flags = [
      u.isAdmin ? 'ADMIN' : '',
      isRetireCohortEmail(u.email) ? 'RETIRE' : '',
      !isRetireCohortEmail(u.email) && isPurgeCohortEmail(u.email) ? 'PURGE-PROJ' : '',
    ]
      .filter(Boolean)
      .join(',');
    console.log(
      `  ${u.id}  ${u.accountType.padEnd(10)}  ${domainOf(u.email).padEnd(26)}  ${redact(u.email).padEnd(20)}  ${u.createdAt.toISOString()}  ${flags}`,
    );
  }
  console.log('');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
