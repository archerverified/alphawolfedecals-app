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
// Goal 10 D3 anti-abuse fixtures.
const EMAIL_DISP_REFERRER = 'alpha-disp-referrer@test.alphawolf.example';
const EMAIL_DISP_REFEREE = 'alpha-disp-referee@mailinator.com'; // disposable domain
const EMAIL_RING_REFERRER = 'alpha-ring-referrer@test.alphawolf.example';
const EMAIL_RING_A = 'alpha-ring-a@test.alphawolf.example';
const EMAIL_RING_B = 'alpha-ring-b@test.alphawolf.example';
const EMAIL_RING_C = 'alpha-ring-c@test.alphawolf.example';

const FIXTURE_EMAILS = [
  EMAIL_REFERRER,
  EMAIL_REFEREE,
  EMAIL_SELF_A,
  EMAIL_SELF_B,
  EMAIL_CAP_REFERRER,
  EMAIL_CAP_A,
  EMAIL_CAP_B,
  EMAIL_DISP_REFERRER,
  EMAIL_DISP_REFEREE,
  EMAIL_RING_REFERRER,
  EMAIL_RING_A,
  EMAIL_RING_B,
  EMAIL_RING_C,
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
  // Mirror the REAL signup flow (packages/auth/src/signup.ts: markUserActive →
  // grantSignupCredits): an activated account carries the signup grant. The repo
  // path alone doesn't grant it, so without this every balance assertion below is
  // short by SIGNUP — the reason this live proof never ran green before (Goal 9.1
  // D4). Idempotent via credit_ledger_signup_grant_once.
  await credits.grantSignupCredits(u.id);
  return u.id;
}

let referrerId: string;
let refereeId: string;
let referrerCode: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error('referrals-rls.integration: DATABASE_URL_APP (the app_user role) must be set.');
  }
  // Sequential, not Promise.all: withSystem runs on the pooled connection
  // (connection_limit=1), so N concurrent fixture deletes exhaust the pool and
  // trip "unable to start a transaction" (Goal 10 D3 — the cohort grew).
  for (const email of FIXTURE_EMAILS) await deleteFixtureUser(email);

  referrerId = await newUser(EMAIL_REFERRER);
  referrerCode = (await referrals.ensureReferralCode(referrerId))!;
  refereeId = await newUser(EMAIL_REFEREE, referrerCode);
});

afterAll(async () => {
  // Sequential, not Promise.all: withSystem runs on the pooled connection
  // (connection_limit=1), so N concurrent fixture deletes exhaust the pool and
  // trip "unable to start a transaction" (Goal 10 D3 — the cohort grew).
  for (const email of FIXTURE_EMAILS) await deleteFixtureUser(email);
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

  test('a disposable/throwaway-domain referee earns NO attribution (Goal 10 D3)', async () => {
    const dispReferrerId = await newUser(EMAIL_DISP_REFERRER);
    const dispCode = (await referrals.ensureReferralCode(dispReferrerId))!;
    const dispRefereeId = await newUser(EMAIL_DISP_REFEREE, dispCode); // @mailinator.com

    const res = await referrals.grantReferralIfAttributed({ refereeUserId: dispRefereeId });
    expect(res).toEqual({ attributed: false, reason: 'disposable' });
    // Neither side gets the referral bonus; the referee keeps only its signup grant.
    expect(await credits.getCreditBalance(dispReferrerId)).toBe(SIGNUP);
    expect(await credits.getCreditBalance(dispRefereeId)).toBe(SIGNUP);
  });

  test('same-IP RING heuristic withholds the referrer bonus past the threshold (Goal 10 D3)', async () => {
    const threshold = CREDIT_CONFIG.referralRingIpThreshold; // 2 prior allowed
    const ringReferrerId = await newUser(EMAIL_RING_REFERRER);
    const ringCode = (await referrals.ensureReferralCode(ringReferrerId))!;
    const ip = '203.0.113.7'; // one device/NAT farming the code

    // The first `threshold` same-IP referees still credit the referrer.
    const emails = [EMAIL_RING_A, EMAIL_RING_B, EMAIL_RING_C];
    const results = [];
    for (const email of emails) {
      const id = await newUser(email, ringCode);
      results.push(await referrals.grantReferralIfAttributed({ refereeUserId: id, refereeIp: ip }));
    }

    // A and B (prior same-IP count 0 then 1, both < 2) credit the referrer.
    expect(results[0]!.attributed && results[0]!.referrerCredited).toBe(true);
    expect(results[1]!.attributed && results[1]!.referrerCredited).toBe(true);
    // C (prior same-IP count = 2 >= threshold) is ring-blocked on the referrer side…
    expect(
      results[2]!.attributed &&
        (results[2] as { referrerRingBlocked: boolean }).referrerRingBlocked,
    ).toBe(true);
    expect(results[2]!.attributed && results[2]!.referrerCredited).toBe(false);
    // …but C still gets their own referee bonus.
    expect(results[2]!.attributed && results[2]!.refereeCredited).toBe(true);
    // Referrer earned exactly `threshold` referral bonuses, not 3.
    expect(await credits.getCreditBalance(ringReferrerId)).toBe(SIGNUP + threshold * GRANT);
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
