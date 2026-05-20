// Integration test: proves Postgres RLS enforces cross-tenant isolation on the
// authenticated (withUser → app_user) connection. This is the whole point of
// switching dev to DATABASE_URL_APP — without it, every authenticated query
// runs as the superuser and silently sees every tenant's rows.
//
// Runs against the REAL Supabase dev database, so it is NOT part of the default
// unit run. Invoke via:
//   pnpm --filter @alphawolf/db test:integration   (loads packages/db/.env)
//   vitest run --project integration                 (env already in process)
//
// Requires:
//   * DATABASE_URL_APP   — the app_user role (NOBYPASSRLS); the connection
//                          under test.
//   * DATABASE_URL       — superuser, used by withSystem to bootstrap and to
//                          clean up the fixtures (bypasses RLS).
//   * PII_ENCRYPTION_KEY — so app_encrypt_pii can write the test users.
//
// The proof: with app.current_user_id pinned to user A, A's own SELECT returns
// ONLY A's row, never B's — even though both rows (and likely others from
// manual testing) exist in the table. If RLS were bypassed, findMany() would
// return every user and the length assertion would fail.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { _resetClientForTests, withSystem, withUser } from '../src/client';
import { emailLookupHash } from '../src/crypto';
import { createUser } from '../src/repos/users';

const EMAIL_A = 'alpha-rls-A@test.alphawolf.example';
const EMAIL_B = 'alpha-rls-B@test.alphawolf.example';

let userAId: string;
let userBId: string;

// Delete any rows for a fixture email on the superuser connection (bypasses
// RLS, which has no DELETE policy). Used to make setup idempotent across reruns
// and to tear the fixtures down afterwards.
async function deleteFixtureUser(email: string): Promise<void> {
  await withSystem(async (db) => {
    const hash = await emailLookupHash(db, email);
    await db.user.deleteMany({ where: { emailLowerHash: hash } });
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error(
      'rls.integration: DATABASE_URL_APP (the app_user role) must be set — that connection is what this test exercises.',
    );
  }

  // Idempotent: clear any leftovers from a crashed prior run before recreating.
  await Promise.all([deleteFixtureUser(EMAIL_A), deleteFixtureUser(EMAIL_B)]);

  const [a, b] = await Promise.all([
    createUser({
      email: EMAIL_A,
      firstName: 'Alpha',
      lastName: 'RlsA',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
    createUser({
      email: EMAIL_B,
      firstName: 'Bravo',
      lastName: 'RlsB',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
  ]);
  userAId = a.id;
  userBId = b.id;
});

afterAll(async () => {
  await Promise.all([deleteFixtureUser(EMAIL_A), deleteFixtureUser(EMAIL_B)]);
  await _resetClientForTests();
});

test('withUser scopes user.findMany to the current user — A never sees B', async () => {
  // Sanity: the two fixtures really are distinct rows that both exist.
  expect(userAId).toBeTruthy();
  expect(userBId).toBeTruthy();
  expect(userAId).not.toBe(userBId);

  const rows = await withUser(userAId, async (db) => db.user.findMany());

  // RLS (users_self_select) restricts the SELECT to id = app.current_user_id.
  expect(rows).toHaveLength(1);
  expect(rows[0]?.id).toBe(userAId);
  expect(rows.some((r) => r.id === userBId)).toBe(false);
});
