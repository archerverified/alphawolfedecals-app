// Integration test: proves the credit-ledger write boundary (Goal 5 / B2C-001)
// on the authenticated (withUser → app_user) connection — the role that
// actually enforces RLS in production.
//
// Same harness as orders-rls.integration.test.ts. Runs against the REAL
// Supabase dev DB and is EXCLUDED from the default unit run:
//   pnpm --filter @alphawolf/db db:apply-sql     # apply credit_ledger RLS first
//   pnpm --filter @alphawolf/db test:integration
// Requires DATABASE_URL_APP (the NOBYPASSRLS app_user role under test),
// DATABASE_URL (superuser, for fixtures), PII_ENCRYPTION_KEY. The b2c_credits
// migration + RLS section must be applied to the target DB.
//
// The proof: the signup grant is idempotent; the owner can READ their ledger
// but cannot INSERT/UPDATE/DELETE (no write policy + revoked grants — a user
// cannot mint credits); another user sees nothing.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { _resetClientForTests, withSystem, withUser } from '../src/client';
import { emailLookupHash } from '../src/crypto';
import { createUser } from '../src/repos/users';
import * as credits from '../src/repos/credits';
import { CREDIT_CONFIG } from '../src/credit-config';

const EMAIL_OWNER = 'alpha-credits-owner@test.alphawolf.example';
const EMAIL_OTHER = 'alpha-credits-other@test.alphawolf.example';

let ownerId: string;
let otherId: string;

async function deleteFixtureUser(email: string): Promise<void> {
  await withSystem(async (db) => {
    const hash = await emailLookupHash(db, email);
    await db.user.deleteMany({ where: { emailLowerHash: hash } }); // cascades credit_ledger
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error('credits-rls.integration: DATABASE_URL_APP (the app_user role) must be set.');
  }
  await Promise.all([deleteFixtureUser(EMAIL_OWNER), deleteFixtureUser(EMAIL_OTHER)]);

  const [owner, other] = await Promise.all([
    createUser({
      email: EMAIL_OWNER,
      firstName: 'Cred',
      lastName: 'Owner',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
    createUser({
      email: EMAIL_OTHER,
      firstName: 'Other',
      lastName: 'User',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
  ]);
  ownerId = owner.id;
  otherId = other.id;
});

afterAll(async () => {
  await Promise.all([deleteFixtureUser(EMAIL_OWNER), deleteFixtureUser(EMAIL_OTHER)]);
  await _resetClientForTests();
});

describe('credit ledger — signup grant idempotency + RLS write lockout', () => {
  test('signup grant credits once; a retry is a no-op', async () => {
    const first = await credits.grantSignupCredits(ownerId);
    expect(first).toBe(CREDIT_CONFIG.signupGrant);

    const retry = await credits.grantSignupCredits(ownerId);
    expect(retry).toBe(0);

    expect(await credits.getCreditBalance(ownerId)).toBe(CREDIT_CONFIG.signupGrant);
  });

  test('owner reads own ledger; another user sees nothing', async () => {
    const rows = await credits.listCreditLedger(ownerId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      delta: CREDIT_CONFIG.signupGrant,
      source: 'grant',
      reason: 'signup',
    });

    // RLS scopes the other user's view to their own (empty) ledger — including
    // a raw cross-user query with no WHERE-by-owner.
    expect(await credits.getCreditBalance(otherId)).toBe(0);
    const crossRead = await withUser(otherId, (db) =>
      db.creditLedger.findMany({ where: { userId: ownerId } }),
    );
    expect(crossRead).toHaveLength(0);
  });

  test('app_user cannot INSERT into credit_ledger (no self-minting)', async () => {
    await expect(
      withUser(ownerId, (db) =>
        db.creditLedger.create({
          data: { userId: ownerId, delta: 1_000_000, source: 'grant', reason: 'exploit' },
        }),
      ),
    ).rejects.toThrow();

    // Balance unchanged — the INSERT really was rejected, not silently dropped.
    expect(await credits.getCreditBalance(ownerId)).toBe(CREDIT_CONFIG.signupGrant);
  });

  test('app_user cannot UPDATE or DELETE ledger rows (append-only holds)', async () => {
    // updateMany/deleteMany surface the lockout as zero affected rows when RLS
    // filters them, or a permission error from the revoked table grants —
    // either way the row must survive unchanged.
    let updated = 0;
    try {
      const res = await withUser(ownerId, (db) =>
        db.creditLedger.updateMany({ where: { userId: ownerId }, data: { delta: 999 } }),
      );
      updated = res.count;
    } catch {
      // revoked grant → permission denied is an acceptable (stronger) outcome
    }
    expect(updated).toBe(0);

    let deleted = 0;
    try {
      const res = await withUser(ownerId, (db) =>
        db.creditLedger.deleteMany({ where: { userId: ownerId } }),
      );
      deleted = res.count;
    } catch {
      // ditto
    }
    expect(deleted).toBe(0);

    expect(await credits.getCreditBalance(ownerId)).toBe(CREDIT_CONFIG.signupGrant);
  });
});
