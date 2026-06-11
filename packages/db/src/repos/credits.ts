// Credit ledger repository (Goal 5 / B2C-001). The ledger is append-only and
// system-written: reads go through RLS on the withUser connection; writes run
// on the system connection from trusted call sites only (signup activation
// today, Stripe webhook in Phase 2). See the credit_ledger section of
// prisma/sql/auth_rls.sql for the enforcement story.

import { withSystem, withUser } from '../client.js';
import { CREDIT_CONFIG, PLAN_LIMITS, type PlanName } from '../credit-config.js';

export type CreditSource = 'grant' | 'purchase' | 'referral' | 'admin';

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
