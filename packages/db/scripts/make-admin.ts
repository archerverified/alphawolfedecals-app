// Grant (or revoke) the internal-admin flag for a user, by email.
//
//   pnpm --filter @alphawolf/db db:make-admin archer@example.com
//   pnpm --filter @alphawolf/db db:make-admin archer@example.com --revoke
//
// is_admin gates the /admin/vehicles routes (ADR-0005). This is the human path
// for provisioning staff in dev; the dev-only POST /api/dev/make-admin endpoint
// is the equivalent hook for E2E. Runs on the system role (withSystem).

import { _resetClientForTests } from '../src/client';
import { setUserAdminByEmail } from '../src/repos/users';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const email = args.find((a) => !a.startsWith('--'));
  const revoke = args.includes('--revoke');
  if (!email) {
    console.error('usage: db:make-admin <email> [--revoke]');
    process.exit(1);
  }
  // The deliberate human operator path — passes operatorOverride so a real-staff
  // email can be promoted (the rider-5 guard blocks non-test elevation otherwise).
  const user = await setUserAdminByEmail(email, !revoke, { operatorOverride: true });
  if (!user) {
    console.error(`[db] no user found for ${email}`);
    process.exit(1);
  }
  console.log(`[db] ${email} is_admin=${user.isAdmin}`);
  await _resetClientForTests();
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
