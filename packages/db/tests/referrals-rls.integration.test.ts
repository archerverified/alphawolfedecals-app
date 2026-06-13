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
const EMAIL_CAP_REFERRER = 'alpha-cap-referrer@test.alphawolf.example';
const EMAIL_CAP_A = 'alpha-cap-a@test.alphawolf.example';
const EMAIL_CAP_B = 'alpha-cap-b@test.alphawolf.example';

const FIXTURE_EMAILS = [
  EMAIL_REFERRER,
  EMAIL_REFEREE,
  EMAIL_SELF_A,
  EMAIL_SELF_B,
  EMAIL_CAP_REFERRER,
  EMAIL_CAP_A,
  EMAIL_CAP_B,
];

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

describe('per-referrer cap (the boundary)', () => {
  test('a referrer at the cap stops earning, but the referee still gets theirs', async () => {
    const cap = CREDIT_CONFIG.referralReferrerCap;
    const capReferrerId = await newUser(EMAIL_CAP_REFERRER);
    const capCode = (await referrals.ensureReferralCode(capReferrerId))!;

    // Seed the referrer to cap-1 prior referral_referrer grants with synthetic
    // referees (referee_user_id has no FK, so random uuids are fine).
    await withSystem(
      (db) => db.$executeRaw`
        INSERT INTO credit_ledger (user_id, delta, source, reason, referee_user_id)
        SELECT ${capReferrerId}::uuid, 2, 'referral', 'referral_referrer', gen_random_uuid()
        FROM generate_series(1, ${cap - 1})`,
    );

    // Referee A lands the referrer exactly AT the cap → referrer still credited.
    const refA = await newUser(EMAIL_CAP_A, capCode);
    const resA = await referrals.grantReferralIfAttributed({ refereeUserId: refA });
    expect(resA.attributed && resA.referrerCredited).toBe(true);

    // Referee B is over the cap → referrer NOT credited, but B gets their bonus.
    const refB = await newUser(EMAIL_CAP_B, capCode);
    const resB = await referrals.grantReferralIfAttributed({ refereeUserId: refB });
    expect(resB.attributed && resB.referrerCredited).toBe(false);
    expect(resB.attributed && resB.refereeCredited).toBe(true);
    expect(await credits.getCreditBalance(refB)).toBe(SIGNUP + GRANT);
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
