// Referral give-2/get-2 repository (Goal 9 / growth loops). Grant-only — credits
// move through the sanctioned append-only ledger path (system-written, idempotent
// by partial unique index), NEVER Stripe. Built to the architecture review:
//   * grantReferralIfAttributed runs in ONE withSystem transaction (withSystem
//     opens a fresh tx per call, so attribution + both grants share that tx and
//     are atomic). It is fully RE-RUNNABLE: the partial uniques — not the
//     attribution rowcount — are the idempotency anchor, so an ops re-run heals
//     a half-applied grant.
//   * The referrer-side idempotency key is the TYPED credit_ledger.referee_user_id
//     column, not a concatenated reason (review C2).
//   * Anti-abuse: no self-referral by id OR by normalized email (second-email
//     farming), one grant per referee (unique), attribution only for a
//     verified+newly-active referee, referrer must be active, and a per-referrer
//     earnings cap. referred_by_code is set-once (trigger). Live ring detection
//     and disposable-domain blocking are DEFERRED (logged for Goal 10) — the
//     normalized-email block + cap + verified-email requirement are the ceiling.

import { randomBytes } from 'node:crypto';

import { withSystem, withUser } from '../client.js';
import { CREDIT_CONFIG } from '../credit-config.js';

const REFERRAL_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const REFERRAL_CODE_LENGTH = 10; // ~50 bits — not enumerable (review M1)

function generateReferralCode(): string {
  const bytes = randomBytes(REFERRAL_CODE_LENGTH);
  let out = '';
  for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
    out += REFERRAL_CODE_ALPHABET[bytes[i]! % REFERRAL_CODE_ALPHABET.length];
  }
  return out;
}

// Bound a user-supplied ?ref= value so garbage never blocks signup or reaches
// the set-once column (the DB CHECK is the backstop). Exported for unit tests.
export function sanitizeReferralCode(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const code = input.trim().toUpperCase();
  return /^[A-Z0-9]{6,20}$/.test(code) ? code : null;
}

// Collapse the abuse-equivalent forms of an email (plus-tagging, gmail dots) so
// "me@x.com", "me+1@x.com" and "m.e@gmail.com" compare equal — defeats the
// second-email self-referral. NOT used for auth identity (emailLowerHash stays
// the auth invariant); purely an abuse heuristic. Exported for unit tests.
export function normalizeEmailForAbuse(email: string): string {
  const lowered = email.trim().toLowerCase();
  const at = lowered.lastIndexOf('@');
  if (at < 0) return lowered;
  let local = lowered.slice(0, at);
  let domain = lowered.slice(at + 1);
  const plus = local.indexOf('+');
  if (plus >= 0) local = local.slice(0, plus);
  if (domain === 'googlemail.com') domain = 'gmail.com';
  if (domain === 'gmail.com') local = local.replace(/\./g, '');
  return `${local}@${domain}`;
}

// Mint (or fetch) the caller's own referral code. Owner-scoped (withUser), lazy
// + race-safe (guarded updateMany), like ensureShareToken.
export async function ensureReferralCode(userId: string): Promise<string | null> {
  return withUser(userId, async (db) => {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (!user) return null;
    if (user.referralCode) return user.referralCode;

    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generateReferralCode();
      const updated = await db.user.updateMany({
        where: { id: userId, referralCode: null },
        data: { referralCode: code },
      });
      if (updated.count === 1) return code;
      const fresh = await db.user.findUnique({
        where: { id: userId },
        select: { referralCode: true },
      });
      if (fresh?.referralCode) return fresh.referralCode;
    }
    throw new Error('[referrals] could not allocate a unique referral code');
  });
}

export type ReferralStats = {
  code: string | null;
  referredCount: number;
  creditsEarned: number;
};

// The referrer's own dashboard numbers. RLS scopes both reads to the caller.
export async function getReferralStats(userId: string): Promise<ReferralStats> {
  return withUser(userId, async (db) => {
    const [user, referredCount, earned] = await Promise.all([
      db.user.findUnique({ where: { id: userId }, select: { referralCode: true } }),
      db.referralAttribution.count({ where: { referrerUserId: userId } }),
      db.creditLedger.aggregate({
        where: { userId, source: 'referral', reason: 'referral_referrer' },
        _sum: { delta: true },
      }),
    ]);
    return {
      code: user?.referralCode ?? null,
      referredCount,
      creditsEarned: earned._sum.delta ?? 0,
    };
  });
}

export type ReferralGrantResult =
  | { attributed: true; referrerUserId: string; creditsGranted: number }
  | { attributed: false; reason: 'no_code' | 'invalid_code' | 'self' | 'not_active' | 'not_found' };

type UserRefRow = {
  id: string;
  status: string;
  referred_by_code: string | null;
  email: string;
};

// Attribute a just-verified referee to their referrer and grant give-2/get-2.
// ONE withSystem transaction, idempotent + re-runnable. Called non-fatally from
// verifySignupOtp AFTER the user is active. Returns what happened (the caller
// fires PostHog from the result).
export async function grantReferralIfAttributed(input: {
  refereeUserId: string;
  refereeIp?: string | null;
}): Promise<ReferralGrantResult> {
  const grant = CREDIT_CONFIG.referralGrant;
  const cap = CREDIT_CONFIG.referralReferrerCap;
  return withSystem(async (db) => {
    const refereeRows = await db.$queryRaw<UserRefRow[]>`
      SELECT id::text AS id, status::text AS status, referred_by_code,
             app_decrypt_pii(email_encrypted) AS email
      FROM users WHERE id = ${input.refereeUserId}::uuid`;
    const referee = refereeRows[0];
    if (!referee) return { attributed: false, reason: 'not_found' };
    if (!referee.referred_by_code) return { attributed: false, reason: 'no_code' };
    // Only a verified, active referee earns attribution (guards an old/lapsed
    // account from being attributed via a stray re-verify — review H2).
    if (referee.status !== 'active') return { attributed: false, reason: 'not_active' };

    const referrerRows = await db.$queryRaw<UserRefRow[]>`
      SELECT id::text AS id, status::text AS status, referred_by_code,
             app_decrypt_pii(email_encrypted) AS email
      FROM users WHERE referral_code = ${referee.referred_by_code}`;
    const referrer = referrerRows[0];
    if (!referrer) return { attributed: false, reason: 'invalid_code' };

    // No self-referral — by id, and by abuse-normalized email (second-email).
    if (referrer.id === input.refereeUserId) return { attributed: false, reason: 'self' };
    if (normalizeEmailForAbuse(referrer.email) === normalizeEmailForAbuse(referee.email)) {
      return { attributed: false, reason: 'self' };
    }

    // Once-per-referee anchor.
    await db.$executeRaw`
      INSERT INTO referral_attributions (referee_user_id, referrer_user_id, code, referee_ip)
      VALUES (${input.refereeUserId}::uuid, ${referrer.id}::uuid, ${referee.referred_by_code},
              ${input.refereeIp ?? null})
      ON CONFLICT (referee_user_id) DO NOTHING`;

    // Referee bonus — idempotent on the partial unique.
    await db.$executeRaw`
      INSERT INTO credit_ledger (user_id, delta, source, reason)
      VALUES (${input.refereeUserId}::uuid, ${grant}, 'referral', 'referral_referee')
      ON CONFLICT (user_id) WHERE source = 'referral' AND reason = 'referral_referee' DO NOTHING`;

    // Referrer bonus — only if active and under the per-referrer cap. The cap
    // count excludes THIS referee so a re-run (the row may already exist) never
    // trips it. Idempotent on (user_id, referee_user_id).
    if (referrer.status === 'active') {
      // Serialize per-referrer so two referees verifying at once can't both read
      // count = cap-1 and overshoot the cap (READ COMMITTED). Same xact-scoped
      // advisory-lock pattern as app_spend_credits; released at tx end.
      await db.$executeRaw`
        SELECT pg_advisory_xact_lock(hashtext('referral_cap'), hashtext(${referrer.id}))`;
      await db.$executeRaw`
        INSERT INTO credit_ledger (user_id, delta, source, reason, referee_user_id)
        SELECT ${referrer.id}::uuid, ${grant}, 'referral', 'referral_referrer',
               ${input.refereeUserId}::uuid
        WHERE (
          SELECT count(*) FROM credit_ledger
          WHERE user_id = ${referrer.id}::uuid AND source = 'referral'
            AND reason = 'referral_referrer'
            AND referee_user_id <> ${input.refereeUserId}::uuid
        ) < ${cap}
        ON CONFLICT (user_id, referee_user_id)
          WHERE source = 'referral' AND reason = 'referral_referrer' DO NOTHING`;
    }

    return { attributed: true, referrerUserId: referrer.id, creditsGranted: grant };
  });
}
