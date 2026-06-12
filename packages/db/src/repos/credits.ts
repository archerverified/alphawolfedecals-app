// Credit ledger repository (Goal 5 / B2C-001). The ledger is append-only and
// system-written: reads go through RLS on the withUser connection; writes run
// on the system connection from trusted call sites only (signup activation
// today, Stripe webhook in Phase 2). See the credit_ledger section of
// prisma/sql/auth_rls.sql for the enforcement story.

import { withSystem, withUser } from '../client.js';
import { CREDIT_CONFIG, PLAN_LIMITS, type PlanName } from '../credit-config.js';

// 'spend' / 'refund' (Goal 7) are written ONLY via the SECURITY DEFINER
// functions app_spend_credits / app_refund_credits — see repos/generation.ts.
export type CreditSource = 'grant' | 'purchase' | 'referral' | 'admin' | 'spend' | 'refund';

export type CreditLedgerRow = {
  id: string;
  delta: number;
  source: CreditSource;
  reason: string | null;
  createdAt: Date;
};

// Current balance = SUM(delta). RLS scopes the aggregate to the caller's rows.
export async function getCreditBalance(userId: string): Promise<number> {
  return withUser(userId, async (db) => {
    const agg = await db.creditLedger.aggregate({
      where: { userId },
      _sum: { delta: true },
    });
    return agg._sum.delta ?? 0;
  });
}

// TEST/DEV-ONLY drain: zero a user's balance with a system-written 'spend'
// row (no run_id, so the run-scoped partial uniques don't apply; the CHECK
// constraint allows source='spend' with a negative delta). Exists for the
// local generation E2E's exhaustion path (waitlist sheet); the only call site
// is the dev-gated /api/dev/drain-credits route (404 in production), which
// additionally restricts targets to @e2e.alphawolf.test identities.
// Defense-in-depth: the function ITSELF refuses to run in production — the
// route's NODE_ENV gate must not be the only thing between this withSystem
// write and a real customer's ledger. Single atomic INSERT…SELECT under the
// same per-user advisory lock the spend rails take, so a concurrent run spend
// can't race the read and drive the balance negative. The ledger stays
// append-only and truthful: the drain is a visible row.
export async function drainCredits(userId: string): Promise<number> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('[credits] drainCredits is a dev/test-only tool — refusing in production');
  }
  return withSystem(async (db) => {
    // Same xact-scoped lock app_spend_credits takes (separate statement, so
    // the INSERT's snapshot postdates any concurrent spend's commit).
    await db.$executeRaw`
      SELECT pg_advisory_xact_lock(hashtext('credit_spend'), hashtext(${userId}))
    `;
    const rows = await db.$queryRaw<Array<{ drained: number | bigint | null }>>`
      INSERT INTO credit_ledger (user_id, delta, source, reason)
      SELECT ${userId}::uuid, -SUM(delta), 'spend', 'dev_drain'
      FROM credit_ledger
      WHERE user_id = ${userId}::uuid
      HAVING SUM(delta) > 0
      RETURNING -delta AS drained
    `;
    return Number(rows[0]?.drained ?? 0);
  });
}

// Newest-first ledger page for the (Phase 2) account/credits UI.
export async function listCreditLedger(userId: string, limit = 50): Promise<CreditLedgerRow[]> {
  return withUser(userId, async (db) => {
    const rows = await db.creditLedger.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: { id: true, delta: true, source: true, reason: true, createdAt: true },
    });
    return rows as CreditLedgerRow[];
  });
}

// One-time signup grant, called from OTP activation (packages/auth signup.ts).
// System role: the user has no authenticated session yet — same doctrine as
// markUserActive, which runs in the same flow. Idempotent: the partial unique
// index credit_ledger_signup_grant_once turns a duplicate into a no-op, so an
// OTP-verify retry can never double-grant. Returns the number of credits
// granted (0 when the grant already existed).
export async function grantSignupCredits(userId: string): Promise<number> {
  const amount = CREDIT_CONFIG.signupGrant;
  return withSystem(async (db) => {
    const inserted = await db.$executeRaw`
      INSERT INTO credit_ledger (user_id, delta, source, reason)
      VALUES (${userId}::uuid, ${amount}, 'grant', 'signup')
      ON CONFLICT (user_id) WHERE source = 'grant' AND reason = 'signup' DO NOTHING
    `;
    return inserted === 1 ? amount : 0;
  });
}

// --- Plan gates (B2C-011) ----------------------------------------------------

export type PlanGateContext = {
  plan: PlanName;
  /** Distinct vehicles the user holds non-deleted projects for. */
  usedVehicleIds: string[];
};

// Everything the server-side plan gates need, in one RLS-scoped read. Unknown
// future plans (Phase 2 paid tiers) fall back to 'free' limits until their
// entry lands in PLAN_LIMITS — gates must never fail open on a typo.
export async function getPlanGateContext(userId: string): Promise<PlanGateContext> {
  return withUser(userId, async (db) => {
    const user = await db.user.findUnique({ where: { id: userId }, select: { plan: true } });
    const rows = await db.project.findMany({
      where: { ownerUserId: userId, status: { not: 'deleted' } },
      select: { vehicleId: true },
      distinct: ['vehicleId'],
    });
    const plan: PlanName = user && user.plan in PLAN_LIMITS ? (user.plan as PlanName) : 'free';
    return { plan, usedVehicleIds: rows.map((r) => r.vehicleId) };
  });
}
