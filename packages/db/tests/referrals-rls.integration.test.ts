// Integration test: proves the referral give-2/get-2 grant + anti-abuse (Goal 9)
// on the REAL Supabase dev DB. Excluded from the default unit run:
//   pnpm --filter @alphawolf/db db:migrate     # referrals migration
//   pnpm --filter @alphawolf/db db:apply-sql    # referral_attributions RLS + set-once trigger
//   pnpm --filter @alphawolf/db test:integration
//
// The proof: a verified referee attributing a valid code grants +2 to EACH side
// via the sanctioned ledger path; it is idempotent (re-run grants nothing more);
// self-referral by a second/abuse-equivalent email is blocked; an invalid code
// is a no-op; referral_attributions is system-written (app_user cannot forge an
// attribution) and the referrer — not the referee — can read it.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { _resetClientForTests, withSystem, withUser } from '../src/client';
import { emailLookupHash } from '../src/crypto';
import { createUser, markUserActive } from '../src/repos/users';
import * as referrals from '../src/repos/referrals';
import * as credits from '../src/repos/credits';
import { CREDIT_CONFIG } from '../src/credit-config';

const GRANT = CREDIT_CONFIG.referralGrant;
const SIGNUP = CREDIT_CONFIG.signupGrant;

const EMAIL_REFERRER = 'alpha-ref-referrer@test.alphawolf.example';
const EMAIL_REFEREE = 'alpha-ref-referee@test.alphawolf.example';
// Self-referral by a second inbox: same gmail mailbox, plus-tagged.
const EMAIL_SELF_A = 'alpha.ring@gmail.com';
const EMAIL_SELF_B = 'alpharing+promo@gmail.com';

const FIXTURE_EMAILS = [EMAIL_REFERRER, EMAIL_REFEREE, EMAIL_SELF_A, EMAIL_SELF_B];

async function deleteFixtureUser(email: string): Promise<void> {
  await withSystem(async (db) => {
    const hash = await emailLookupHash(db, email);
    // Cascades referral_attributions + credit_ledger (user FK).
    await db.user.deleteMany({ where: { emailLowerHash: hash } });
  });
}

async function newUser(email: string, referredByCode?: string): Promise<string> {
  const u = await createUser({
    email,
    firstName: 'Ref',
    lastName: 'Test',
    passwordHash: 'integration-test-not-a-real-hash',
    accountType: 'customer',
    referredByCode,
  });
  await markUserActive(u.id);
  return u.id;
}

let referrerId: string;
let refereeId: string;
let referrerCode: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error('referrals-rls.integration: DATABASE_URL_APP (the app_user role) must be set.');
  }
  await Promise.all(FIXTURE_EMAILS.map(deleteFixtureUser));

  referrerId = await newUser(EMAIL_REFERRER);
  referrerCode = (await referrals.ensureReferralCode(referrerId))!;
  refereeId = await newUser(EMAIL_REFEREE, referrerCode);
});

afterAll(async () => {
  await Promise.all(FIXTURE_EMAILS.map(deleteFixtureUser));
  await _resetClientForTests();
});

describe('referral grant — give-2/get-2, sanctioned + idempotent', () => {
  test('a valid attribution grants +2 to each side exactly once', async () => {
    const res = await referrals.grantReferralIfAttributed({ refereeUserId: refereeId });
    expect(res).toMatchObject({
      attributed: true,
      referrerUserId: referrerId,
      creditsGranted: GRANT,
    });

    // Referee: signup grant + referral bonus. Referrer: signup grant + referral bonus.
    expect(await credits.getCreditBalance(refereeId)).toBe(SIGNUP + GRANT);
    expect(await credits.getCreditBalance(referrerId)).toBe(SIGNUP + GRANT);

    // Re-run heals nothing extra (idempotent on the partial uniques).
    await referrals.grantReferralIfAttributed({ refereeUserId: refereeId });
    expect(await credits.getCreditBalance(refereeId)).toBe(SIGNUP + GRANT);
    expect(await credits.getCreditBalance(referrerId)).toBe(SIGNUP + GRANT);
  });

  test('the referrer can read their attribution; stats reflect it', async () => {
    const stats = await referrals.getReferralStats(referrerId);
    expect(stats.code).toBe(referrerCode);
    expect(stats.referredCount).toBe(1);
    expect(stats.creditsEarned).toBe(GRANT);
  });
});

describe('anti-abuse', () => {
  test('self-referral via a second/plus-tagged inbox is blocked (no credits)', async () => {
    const selfReferrerId = await newUser(EMAIL_SELF_A);
    const selfCode = (await referrals.ensureReferralCode(selfReferrerId))!;
    const selfRefereeId = await newUser(EMAIL_SELF_B, selfCode);

    const res = await referrals.grantReferralIfAttributed({ refereeUserId: selfRefereeId });
    expect(res).toEqual({ attributed: false, reason: 'self' });
    // Only the signup grant — no referral bonus on either side.
    expect(await credits.getCreditBalance(selfReferrerId)).toBe(SIGNUP);
    expect(await credits.getCreditBalance(selfRefereeId)).toBe(SIGNUP);
  });

  test('an unknown code is a no-op', async () => {
    // referee with a syntactically-valid but non-existent code.
    await deleteFixtureUser(EMAIL_REFEREE);
    const lonelyRefereeId = await newUser(EMAIL_REFEREE, 'ZZZZ999999');
    const res = await referrals.grantReferralIfAttributed({ refereeUserId: lonelyRefereeId });
    expect(res).toEqual({ attributed: false, reason: 'invalid_code' });
    expect(await credits.getCreditBalance(lonelyRefereeId)).toBe(SIGNUP);
  });
});

describe('referral_attributions — system-written ballot', () => {
  test('app_user cannot forge an attribution (no self-minting referral credits)', async () => {
    let inserted = false;
    try {
      await withUser(referrerId, (db) =>
        db.referralAttribution.create({
          data: { refereeUserId: referrerId, referrerUserId: referrerId, code: referrerCode },
        }),
      );
      inserted = true;
    } catch {
      // RLS (no insert policy) / revoked grant → rejected (expected)
    }
    expect(inserted).toBe(false);
  });
});
