-- Goal 5 / B2C-001 — credit ledger + plan attribution.
-- RLS for credit_ledger (SELECT-only for app_user; system-role writes only)
-- lives in prisma/sql/auth_rls.sql, applied via db:apply-sql after this migration.

-- CreateEnum
CREATE TYPE "user_plan" AS ENUM ('free');

-- CreateEnum
CREATE TYPE "credit_source" AS ENUM ('grant', 'purchase', 'referral', 'admin');

-- AlterTable: plan attribution, default free (PRD §3 step 1).
ALTER TABLE "users" ADD COLUMN "plan" "user_plan" NOT NULL DEFAULT 'free';

-- CreateTable
CREATE TABLE "credit_ledger" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "delta" INTEGER NOT NULL,
    "source" "credit_source" NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_ledger_pkey" PRIMARY KEY ("id")
);

-- A zero-delta row is always a bug (it can only blur the audit trail).
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_delta_nonzero" CHECK ("delta" <> 0);

-- CreateIndex
CREATE INDEX "credit_ledger_user_id_created_at_idx" ON "credit_ledger"("user_id", "created_at");

-- Idempotency guard for the signup grant: at most ONE grant/'signup' row per
-- user, ever. The grant INSERT uses ON CONFLICT against this index, so OTP
-- verify retries / backfill re-runs cannot double-grant. (Partial unique
-- indexes are not expressible in the Prisma schema — raw SQL by design.)
CREATE UNIQUE INDEX "credit_ledger_signup_grant_once"
  ON "credit_ledger"("user_id")
  WHERE "source" = 'grant' AND "reason" = 'signup';

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: every already-active user gets the signup grant the new flow gives
-- at OTP activation (5 credits — keep in sync with credit-config.ts
-- CREDIT_CONFIG.signupGrant). Idempotent via the partial unique index above.
INSERT INTO "credit_ledger" ("user_id", "delta", "source", "reason")
SELECT "id", 5, 'grant', 'signup'
FROM "users"
WHERE "status" = 'active'
ON CONFLICT ("user_id") WHERE "source" = 'grant' AND "reason" = 'signup' DO NOTHING;
