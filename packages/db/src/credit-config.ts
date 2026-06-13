// Credit + plan launch values (Goal 5, PRD §5). Tunable data, deliberately kept
// out of the schema and out of feature code: change a number here, ship, done.
// PHASE 1 NOTE: only signupGrant is live (granted at OTP activation). The other
// values are the PRD's launch numbers, wired up when their feature lands
// (generation/iteration = Phase 2 AI build; monthlyDrip = Phase 2 cron).
export const CREDIT_CONFIG = {
  // Credits granted once, when the account activates (B2C-001).
  signupGrant: 5,
  // Monthly re-engagement drip (Phase 2 — no scheduler in Phase 1).
  monthlyDrip: 2,
  // Cost of one concept-generation run, 3 directions (Phase 2 / B2C-007).
  conceptGenerationCost: 1,
  // Cost of one iteration / tweak request (Phase 2 / B2C-008).
  iterationCost: 1,
  // Referral give-2/get-2 (Goal 9): credits granted to EACH side when a verified
  // new signup attributes a referral code. Grant-only (no Stripe).
  referralGrant: 2,
  // Abuse ceiling: max distinct referees a single referrer earns credits for.
  // The referee always gets their bonus; a referrer past the cap stops earning.
  referralReferrerCap: 25,
} as const;

// Free-plan limits (B2C-011), enforced server-side. PRD §3 step 2 + §9.4.
export const PLAN_LIMITS = {
  free: {
    // Distinct vehicles a customer can hold projects for ("vehicle slots").
    vehicleSlots: 2,
    // Brief-to-generation runs per calendar month (metered when Phase 2 AI lands).
    monthlyGenerationRuns: 3,
  },
} as const;

export type PlanName = keyof typeof PLAN_LIMITS;
