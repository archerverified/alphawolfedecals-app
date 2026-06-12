-- Goal 7 / D4 + D7 — generation runs/jobs/images + credit spend rails.
--
-- Depends on 20260612200000_credit_spend_enum (the 'spend'/'refund' enum
-- values referenced below MUST be committed before this transaction runs —
-- PG 55P04). RLS + the SECURITY DEFINER spend/refund functions live in
-- prisma/sql/auth_rls.sql, applied via db:apply-sql after this migration.
--
-- Per CLAUDE.md §6: when this is applied to prod via the Supabase MCP, insert
-- the corresponding _prisma_migrations rows (SHA-256 checksums) so
-- `prisma migrate deploy` skips cleanly.

-- CreateEnum
CREATE TYPE "generation_run_kind" AS ENUM ('initial', 'iteration', 'final');

-- CreateEnum
CREATE TYPE "generation_run_status" AS ENUM ('queued', 'orchestrating', 'rendering', 'complete', 'failed');

-- CreateEnum
CREATE TYPE "generation_job_status" AS ENUM ('pending', 'submitted', 'complete', 'failed');

-- CreateTable: one row per generation run — the pipeline state machine
-- (queued → orchestrating → rendering → complete|failed). Runs are audit
-- records: RLS revokes DELETE from app_user (auth_rls.sql).
CREATE TABLE "generation_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "project_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "kind" "generation_run_kind" NOT NULL,
    "status" "generation_run_status" NOT NULL DEFAULT 'queued',
    "brief_version" INTEGER NOT NULL,
    "parent_run_id" UUID,
    "concept_key" TEXT,
    "instruction" TEXT,
    "directions" JSONB,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "model" TEXT NOT NULL DEFAULT '',
    -- ESTIMATED at insert (config prices — closes the spend-cap TOCTOU,
    -- pipeline design review item 4), trued up at completion from job costs.
    "cost_usd" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "error" TEXT,
    "client_token" TEXT,
    "deadline_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "generation_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: mutable per-(run, concept, view) work-unit state. THE resubmit
-- guard: provider_request_id is persisted AT SUBMIT TIME, so a resumed slice
-- harvests results by request id and NEVER resubmits (double-spend guard,
-- pipeline design review item 3).
CREATE TABLE "generation_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "concept_key" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "status" "generation_job_status" NOT NULL DEFAULT 'pending',
    "provider_request_id" TEXT,
    "prompt" TEXT NOT NULL DEFAULT '',
    "cost_usd" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable: IMMUTABLE results + provenance (brief_snapshots doctrine:
-- RLS revokes UPDATE/DELETE from app_user — a generated image's provenance
-- can never be silently rewritten).
CREATE TABLE "generation_images" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "run_id" UUID NOT NULL,
    "job_id" UUID NOT NULL,
    "concept_key" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    -- Unwatermarked original, PRIVATE bucket — served only via owner-scoped
    -- signed URLs (pipeline design review item 6).
    "storage_path" TEXT NOT NULL,
    -- Watermarked preview the gallery renders pre-selection.
    "preview_path" TEXT,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "provider_request_id" TEXT,
    "cost_usd" DECIMAL(8,4) NOT NULL DEFAULT 0,
    "provenance" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "generation_images_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "generation_runs_user_id_created_at_idx" ON "generation_runs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "generation_runs_project_id_created_at_idx" ON "generation_runs"("project_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "generation_jobs_run_id_concept_key_view_key" ON "generation_jobs"("run_id", "concept_key", "view");

-- CreateIndex
CREATE INDEX "generation_images_run_id_idx" ON "generation_images"("run_id");

-- Idempotency guard for double-submit (double-click / retried action): at most
-- one run per client token. Partial so the column stays optional. (Partial
-- unique indexes are not expressible in the Prisma schema — raw SQL by design,
-- same as credit_ledger_signup_grant_once.)
CREATE UNIQUE INDEX "generation_runs_client_token_once"
  ON "generation_runs"("client_token")
  WHERE "client_token" IS NOT NULL;

-- One in-flight (non-terminal) run per project+kind: a second concurrent
-- "Generate" on the same project conflicts instead of double-spending.
CREATE UNIQUE INDEX "generation_runs_one_active_per_project_kind"
  ON "generation_runs"("project_id", "kind")
  WHERE "status" NOT IN ('complete', 'failed');

-- Free-final farming guard: a given concept of a given parent run can be
-- finalized at most once (finals cost 0 credits — without this an attacker
-- replays selection for unlimited export-quality renders).
CREATE UNIQUE INDEX "generation_runs_final_once_per_concept"
  ON "generation_runs"("parent_run_id", "concept_key")
  WHERE "kind" = 'final';

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_runs" ADD CONSTRAINT "generation_runs_parent_run_id_fkey" FOREIGN KEY ("parent_run_id") REFERENCES "generation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_jobs" ADD CONSTRAINT "generation_jobs_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_images" ADD CONSTRAINT "generation_images_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "generation_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "generation_images" ADD CONSTRAINT "generation_images_job_id_fkey" FOREIGN KEY ("job_id") REFERENCES "generation_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- credit_ledger: money rails for generation spends/refunds (D7).
-- ----------------------------------------------------------------------------

-- AlterTable: tie spend/refund rows to the run they paid for. SET NULL (not
-- CASCADE): the ledger is append-only audit truth and must survive a run
-- row's deletion (project cascade).
ALTER TABLE "credit_ledger" ADD COLUMN "run_id" UUID;

-- AddForeignKey
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "generation_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Sign discipline: spends are negative, everything else (grant/purchase/
-- referral/admin/refund) is positive. Valid against existing rows — every
-- pre-Goal-7 row is a positive grant. Uses the enum values committed by
-- 20260612200000_credit_spend_enum (separate migration — PG 55P04).
ALTER TABLE "credit_ledger" ADD CONSTRAINT "chk_credit_ledger_spend_sign"
  CHECK (("source" = 'spend' AND "delta" < 0) OR ("source" <> 'spend' AND "delta" > 0));

-- At most ONE spend and ONE refund per run, ever. The spend unique makes a
-- double-spend per run structurally impossible (app_spend_credits lets the
-- violation surface); the refund unique is the ON CONFLICT target that makes
-- app_refund_credits idempotent from both the advance path and the sweeper.
CREATE UNIQUE INDEX "credit_ledger_spend_once_per_run"
  ON "credit_ledger"("run_id")
  WHERE "source" = 'spend';

CREATE UNIQUE INDEX "credit_ledger_refund_once_per_run"
  ON "credit_ledger"("run_id")
  WHERE "source" = 'refund';
