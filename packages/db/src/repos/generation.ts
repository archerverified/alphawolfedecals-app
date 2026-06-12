// Generation-run repository (Goal 7 / D4 data + D7 money rails). See
// docs/product/goal-7-pipeline-design.md — especially the backend-architect
// review items this module implements:
//
//   * startRun is ONE withUser transaction: monthly-gate count → run INSERT →
//     app_spend_credits (SECURITY DEFINER, advisory-locked per user). An
//     insufficient balance rolls the whole thing back — no orphan run, no
//     orphan spend.
//   * Every status transition is CAS (`UPDATE … WHERE status = <expected>`),
//     so the client-poll-driven advance loop is idempotent and re-entrant.
//   * Jobs persist the provider request id AT SUBMIT (markJobSubmitted is the
//     resubmit guard: it only fires pending→submitted while the id is NULL).
//   * Refunds go through app_refund_credits — idempotent by construction
//     (ON CONFLICT against the refund partial unique), callable from both the
//     owner path (failRun) and the system sweeper (sweepStaleRuns).
//
// All customer paths run on withUser (RLS-enforced). withSystem appears
// exactly twice: spendTodaySystem (cron observability) and sweepStaleRuns —
// the legitimate system-maintenance uses.

import type { Prisma } from '@prisma/client';
import { pgQuoteLiteral, withSystem, withUser, type TxClient } from '../client.js';

export type GenerationRunKind = 'initial' | 'iteration' | 'final';
export type GenerationRunStatus = 'queued' | 'orchestrating' | 'rendering' | 'complete' | 'failed';
// 'submitting' is the per-job submit claim (review fix F2): pending →
// submitting (claimJob, BEFORE provider.submit) → submitted (markJobSubmitted,
// persisting the provider request id). Non-terminal — an orphaned claim is
// reaped by the run deadline/sweeper.
export type GenerationJobStatus = 'pending' | 'submitting' | 'submitted' | 'complete' | 'failed';

export const NON_TERMINAL_RUN_STATUSES = ['queued', 'orchestrating', 'rendering'] as const;

export type GenerationRunRow = {
  id: string;
  projectId: string;
  userId: string;
  kind: GenerationRunKind;
  status: GenerationRunStatus;
  briefVersion: number;
  parentRunId: string | null;
  conceptKey: string | null;
  instruction: string | null;
  directions: unknown;
  provider: string;
  model: string;
  costUsd: number;
  error: string | null;
  clientToken: string | null;
  deadlineAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
};

export type GenerationJobRow = {
  id: string;
  runId: string;
  conceptKey: string;
  view: string;
  status: GenerationJobStatus;
  providerRequestId: string | null;
  prompt: string;
  costUsd: number;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GenerationImageRow = {
  id: string;
  runId: string;
  jobId: string;
  conceptKey: string;
  view: string;
  storagePath: string;
  previewPath: string | null;
  width: number;
  height: number;
  provider: string;
  model: string;
  providerRequestId: string | null;
  costUsd: number;
  provenance: unknown;
  createdAt: Date;
};

export type StartRunInput = {
  projectId: string;
  kind: GenerationRunKind;
  briefVersion: number;
  /** Client-generated idempotency token (one per "Generate" click). */
  clientToken: string;
  parentRunId?: string;
  conceptKey?: string;
  instruction?: string;
  /** ESTIMATED run cost at config prices (spend-cap TOCTOU guard, D7). */
  estimatedCostUsd: number;
  /** Credits to debit via app_spend_credits. 0 for the free 'final' kind. */
  creditCost: number;
  provider: string;
  model: string;
  deadlineAt: Date;
  /**
   * PLAN_LIMITS[plan].monthlyGenerationRuns, applied to kind='initial' runs
   * only. Counted INSIDE the startRun transaction right before the insert, so
   * the gate can't be raced past by parallel submits (the per-user advisory
   * lock in app_spend_credits closes the balance race; this closes the gate
   * race for the metered kind).
   */
  monthlyRunLimit?: number;
};

export type StartRunResult =
  | { ok: true; run: GenerationRunRow; deduped: boolean }
  | {
      ok: false;
      reason:
        | 'insufficient_credits'
        | 'monthly_runs'
        | 'active_run_exists'
        | 'final_already_exists'
        | 'project_not_found'
        // The clientToken unique fired but the RLS re-read found no run: the
        // token belongs to ANOTHER user. Caller should mint a fresh token.
        | 'token_conflict';
    };

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested in tests/generation-helpers.test.ts).
// ---------------------------------------------------------------------------

/** UTC start of the calendar month containing `now` (monthly run gate). */
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Cutoff before which a non-terminal run with no deadline counts as stale. */
export function staleCutoff(now: Date, ttlMinutes: number): Date {
  return new Date(now.getTime() - ttlMinutes * 60_000);
}

/** Ledger `reason` for a run kind's spend row (refunds append '_refund'). */
export function spendReasonForKind(kind: GenerationRunKind): string {
  return kind === 'iteration' ? 'iteration_run' : 'generation_run';
}

/**
 * Throws on a negative or non-finite estimated cost — a caller bug, never a
 * customer input. cost_usd is the conservative number the daily spend cap
 * sums, so a negative estimate would silently widen the cap for everyone.
 */
export function assertValidEstimatedCost(estimatedCostUsd: number): void {
  if (!Number.isFinite(estimatedCostUsd) || estimatedCostUsd < 0) {
    throw new Error(`[generation] estimatedCostUsd must be >= 0 (got ${estimatedCostUsd})`);
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/** True when an error is the app_spend_credits insufficient-balance raise. */
export function isInsufficientCreditsError(error: unknown): boolean {
  return errorText(error).includes('insufficient_credits');
}

/** True when an error is an RLS rejection (e.g. INSERT against a foreign project). */
export function isRlsViolationError(error: unknown): boolean {
  return /row-level security/i.test(errorText(error));
}

/**
 * If `error` is a unique violation, return a string that names the violated
 * constraint/index (Prisma P2002 carries it in meta.target and/or the
 * message; raw Postgres errors carry it in the message). Null otherwise.
 */
export function uniqueViolationTarget(error: unknown): string | null {
  const message = errorText(error);
  const code =
    typeof error === 'object' && error !== null ? (error as { code?: unknown }).code : undefined;
  const isUnique = code === 'P2002' || /unique constraint|duplicate key value/i.test(message);
  if (!isUnique) return null;
  const meta =
    typeof error === 'object' && error !== null
      ? (error as { meta?: { target?: unknown } }).meta
      : undefined;
  const target = meta?.target;
  const targetText = Array.isArray(target)
    ? target.join(',')
    : typeof target === 'string'
      ? target
      : '';
  return `${targetText} ${message}`;
}

// ---------------------------------------------------------------------------
// Selects + row mapping (Decimal → number at the repo boundary).
// ---------------------------------------------------------------------------

const RUN_SELECT = {
  id: true,
  projectId: true,
  userId: true,
  kind: true,
  status: true,
  briefVersion: true,
  parentRunId: true,
  conceptKey: true,
  instruction: true,
  directions: true,
  provider: true,
  model: true,
  costUsd: true,
  error: true,
  clientToken: true,
  deadlineAt: true,
  createdAt: true,
  updatedAt: true,
  completedAt: true,
} as const;

const JOB_SELECT = {
  id: true,
  runId: true,
  conceptKey: true,
  view: true,
  status: true,
  providerRequestId: true,
  prompt: true,
  costUsd: true,
  error: true,
  createdAt: true,
  updatedAt: true,
} as const;

const IMAGE_SELECT = {
  id: true,
  runId: true,
  jobId: true,
  conceptKey: true,
  view: true,
  storagePath: true,
  previewPath: true,
  width: true,
  height: true,
  provider: true,
  model: true,
  providerRequestId: true,
  costUsd: true,
  provenance: true,
  createdAt: true,
} as const;

type RunRecord = Prisma.GenerationRunGetPayload<{ select: typeof RUN_SELECT }>;
type JobRecord = Prisma.GenerationJobGetPayload<{ select: typeof JOB_SELECT }>;
type ImageRecord = Prisma.GenerationImageGetPayload<{ select: typeof IMAGE_SELECT }>;

function toRunRow(r: RunRecord): GenerationRunRow {
  return {
    ...r,
    kind: r.kind as GenerationRunKind,
    status: r.status as GenerationRunStatus,
    costUsd: Number(r.costUsd),
  };
}

function toJobRow(j: JobRecord): GenerationJobRow {
  return { ...j, status: j.status as GenerationJobStatus, costUsd: Number(j.costUsd) };
}

function toImageRow(i: ImageRecord): GenerationImageRow {
  return { ...i, costUsd: Number(i.costUsd) };
}

// ---------------------------------------------------------------------------
// SECURITY DEFINER call sites. $queryRawUnsafe + pgQuoteLiteral is the safe
// raw shape on the Supabase transaction pooler (see the long note in
// client.ts applySessionConfig — tagged-template raw creates prepared
// statements that collide across pool reuse).
// ---------------------------------------------------------------------------

async function callSpendCredits(
  db: TxClient,
  runId: string,
  amount: number,
  reason: string,
): Promise<number> {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error(`[generation] creditCost must be a positive integer (got ${amount})`);
  }
  const rows = await db.$queryRawUnsafe<Array<{ balance: number }>>(
    `SELECT app_spend_credits(${pgQuoteLiteral(runId)}::uuid, ${amount}, ${pgQuoteLiteral(reason)}) AS balance`,
  );
  return Number(rows[0]?.balance ?? 0);
}

async function callRefundCredits(db: TxClient, runId: string): Promise<boolean> {
  const rows = await db.$queryRawUnsafe<Array<{ refunded: boolean }>>(
    `SELECT app_refund_credits(${pgQuoteLiteral(runId)}::uuid) AS refunded`,
  );
  return rows[0]?.refunded === true;
}

async function callSpendToday(db: TxClient): Promise<number> {
  const rows = await db.$queryRawUnsafe<Array<{ spend: unknown }>>(
    'SELECT app_generation_spend_today() AS spend',
  );
  return Number(rows[0]?.spend ?? 0);
}

// ---------------------------------------------------------------------------
// Run lifecycle.
// ---------------------------------------------------------------------------

export type RunContext = {
  /** Current credit balance (SUM of the caller's ledger rows, RLS-scoped). */
  balance: number;
  /** kind='initial' runs this UTC calendar month (the monthly-gate counter). */
  runsThisMonth: number;
  /** The project's in-flight run, if any — lets the action resume polling. */
  activeRunId: string | null;
};

// One RLS-scoped read with everything the pre-flight gates need. ADVISORY
// ONLY for UI copy ("2 of 3 runs left"): the authoritative checks re-run
// inside startRun's transaction (monthly count) and inside app_spend_credits
// under the per-user advisory lock (balance).
export async function getRunContext(userId: string, projectId: string): Promise<RunContext> {
  return withUser(userId, async (db) => {
    // Sequential on purpose: queries inside one interactive transaction must
    // not run concurrently on the shared tx client.
    const agg = await db.creditLedger.aggregate({ where: { userId }, _sum: { delta: true } });
    const runsThisMonth = await db.generationRun.count({
      where: { userId, kind: 'initial', createdAt: { gte: monthStartUtc(new Date()) } },
    });
    const active = await db.generationRun.findFirst({
      where: { projectId, status: { in: [...NON_TERMINAL_RUN_STATUSES] } },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    return {
      balance: agg._sum.delta ?? 0,
      runsThisMonth,
      activeRunId: active?.id ?? null,
    };
  });
}

// Create a run and debit its credits ATOMICALLY (one withUser transaction).
// Failure modes map to typed results — the transaction rolls back, so a
// blocked run leaves no row and no spend:
//   * monthly_runs           — gate count (re-checked in-tx) at/over the limit.
//   * insufficient_credits   — app_spend_credits raised; INSERT rolled back.
//   * active_run_exists      — the one-non-terminal-run-per-(project,kind)
//                              partial unique fired.
//   * final_already_exists   — the free-final farming guard fired.
//   * project_not_found      — RLS WITH CHECK rejected the insert (foreign or
//                              missing project — indistinguishable by design).
// A clientToken replay returns the EXISTING run ({deduped: true}) — the
// double-click path spends nothing twice.
export async function startRun(userId: string, input: StartRunInput): Promise<StartRunResult> {
  assertValidEstimatedCost(input.estimatedCostUsd);
  try {
    return await withUser(userId, async (db) => {
      // Per-user serialization for EVERYTHING below — same advisory-lock key
      // as app_spend_credits (re-entrant when the spend re-takes it later in
      // this tx; xact-scoped, so pooler-safe). Taking it before the monthly
      // count closes the gate race: two parallel submits by the same user
      // serialize here, so the second one counts the first one's committed
      // run instead of both passing the gate.
      // $executeRawUnsafe, not $queryRawUnsafe: the lock fn returns void,
      // which Prisma cannot deserialize as a result column (caught by the
      // integration suite on first live run).
      await db.$executeRawUnsafe(
        `SELECT pg_advisory_xact_lock(hashtext('credit_spend'), hashtext(${pgQuoteLiteral(userId)}))`,
      );

      // Idempotency fast path: this token already produced a run.
      const existing = await db.generationRun.findFirst({
        where: { clientToken: input.clientToken },
        select: RUN_SELECT,
      });
      if (existing) return { ok: true as const, run: toRunRow(existing), deduped: true };

      // Monthly gate for metered (initial) runs, counted in the same tx as
      // the insert, under the advisory lock above. The unique-violation path
      // below backstops any residual conflict (token dedupe race against a
      // DIFFERENT connection's committed insert, one-active-per-project).
      if (input.kind === 'initial' && input.monthlyRunLimit !== undefined) {
        const runsThisMonth = await db.generationRun.count({
          where: { userId, kind: 'initial', createdAt: { gte: monthStartUtc(new Date()) } },
        });
        if (runsThisMonth >= input.monthlyRunLimit) {
          return { ok: false as const, reason: 'monthly_runs' as const };
        }
      }

      const created = await db.generationRun.create({
        data: {
          projectId: input.projectId,
          userId,
          kind: input.kind,
          briefVersion: input.briefVersion,
          parentRunId: input.parentRunId ?? null,
          conceptKey: input.conceptKey ?? null,
          instruction: input.instruction ?? null,
          provider: input.provider,
          model: input.model,
          costUsd: input.estimatedCostUsd,
          clientToken: input.clientToken,
          deadlineAt: input.deadlineAt,
        },
        select: RUN_SELECT,
      });

      if (input.creditCost > 0) {
        // Raises 'insufficient_credits' (caught below → typed result; the
        // whole tx, including the run INSERT, rolls back with it).
        await callSpendCredits(db, created.id, input.creditCost, spendReasonForKind(input.kind));
      }

      return { ok: true as const, run: toRunRow(created), deduped: false };
    });
  } catch (error) {
    if (isInsufficientCreditsError(error)) {
      return { ok: false, reason: 'insufficient_credits' };
    }
    if (isRlsViolationError(error)) {
      return { ok: false, reason: 'project_not_found' };
    }
    const unique = uniqueViolationTarget(error);
    if (unique) {
      // Raw-SQL partial uniques surface as P2002 with NO index name (Prisma
      // reports "(not available)" — confirmed live by the integration suite),
      // so name-matching is hopeless. Disambiguate by probing, most specific
      // first; every probe is an RLS-scoped read.
      const tokenRun = await withUser(userId, (db) =>
        db.generationRun.findFirst({
          where: { clientToken: input.clientToken },
          select: RUN_SELECT,
        }),
      );
      // Two requests raced the same token past the fast path; the loser
      // reads the winner's run.
      if (tokenRun) return { ok: true, run: toRunRow(tokenRun), deduped: true };

      if (input.kind === 'final' && input.parentRunId && input.conceptKey) {
        // Mirrors generation_runs_final_once_per_concept, which excludes
        // failed finals (review fix F1): a failed final does not brick its
        // concept, so the probe must ignore it too or every retry after a
        // failure would be misreported as final_already_exists.
        const existingFinal = await withUser(userId, (db) =>
          db.generationRun.findFirst({
            where: {
              kind: 'final',
              parentRunId: input.parentRunId,
              conceptKey: input.conceptKey,
              status: { not: 'failed' },
            },
            select: { id: true },
          }),
        );
        if (existingFinal) return { ok: false, reason: 'final_already_exists' };
      }

      const activeRun = await withUser(userId, (db) =>
        db.generationRun.findFirst({
          where: {
            projectId: input.projectId,
            kind: input.kind,
            status: { notIn: ['complete', 'failed'] },
          },
          select: { id: true },
        }),
      );
      if (activeRun) return { ok: false, reason: 'active_run_exists' };

      // Unique fired but every RLS-scoped probe sees nothing: the token
      // collides with ANOTHER user's run. Typed failure, not a raw rethrow
      // — the caller mints a fresh token and retries.
      return { ok: false, reason: 'token_conflict' };
    }
    throw error;
  }
}

export type RunPatch = Partial<{
  directions: Prisma.InputJsonValue;
  provider: string;
  model: string;
  error: string | null;
  deadlineAt: Date;
  completedAt: Date;
}>;

// Compare-and-set status transition: returns false when the run was not in
// `from` (another slice advanced it first) — the caller simply re-reads. This
// is what makes the poll-driven advance loop safe to call concurrently.
export async function advanceStatus(
  userId: string,
  runId: string,
  from: GenerationRunStatus,
  to: GenerationRunStatus,
  patch?: RunPatch,
): Promise<boolean> {
  return withUser(userId, async (db) => {
    const updated = await db.generationRun.updateMany({
      where: { id: runId, status: from },
      data: { status: to, ...(patch ?? {}) },
    });
    return updated.count > 0;
  });
}

export type FailRunResult = { failed: boolean; refunded: boolean };

// CAS any non-terminal run to 'failed', record the error, stamp completed_at,
// and refund its spend (idempotent — at most one refund row ever exists).
// failed:false means the run was already terminal; nothing changed.
export async function failRun(
  userId: string,
  runId: string,
  error: string,
): Promise<FailRunResult> {
  return withUser(userId, async (db) => {
    const updated = await db.generationRun.updateMany({
      where: { id: runId, status: { in: [...NON_TERMINAL_RUN_STATUSES] } },
      data: { status: 'failed', error, completedAt: new Date() },
    });
    if (updated.count === 0) return { failed: false, refunded: false };
    const refunded = await callRefundCredits(db, runId);
    return { failed: true, refunded };
  });
}

export async function getRun(userId: string, runId: string): Promise<GenerationRunRow | null> {
  return withUser(userId, async (db) => {
    const row = await db.generationRun.findUnique({ where: { id: runId }, select: RUN_SELECT });
    return row ? toRunRow(row) : null;
  });
}

export type RunWithImages = GenerationRunRow & { images: GenerationImageRow[] };

// Gallery read: the project's runs, newest first, each with its images.
export async function listRunsForProject(
  userId: string,
  projectId: string,
): Promise<RunWithImages[]> {
  return withUser(userId, async (db) => {
    const rows = await db.generationRun.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      select: { ...RUN_SELECT, images: { select: IMAGE_SELECT, orderBy: { createdAt: 'asc' } } },
    });
    return rows.map((r) => ({ ...toRunRow(r), images: r.images.map(toImageRow) }));
  });
}

// ---------------------------------------------------------------------------
// Jobs (per-(run, concept, view) work units).
// ---------------------------------------------------------------------------

export type RecordJobInput = { conceptKey: string; view: string; prompt?: string };

// Create the run's pending job rows. skipDuplicates makes a re-entered slice
// (the advance loop re-running after a crash) a no-op for already-recorded
// units — the (run_id, concept_key, view) unique is the identity.
export async function recordJobs(
  userId: string,
  runId: string,
  jobs: RecordJobInput[],
): Promise<number> {
  if (jobs.length === 0) return 0;
  return withUser(userId, async (db) => {
    const created = await db.generationJob.createMany({
      data: jobs.map((j) => ({
        runId,
        conceptKey: j.conceptKey,
        view: j.view,
        prompt: j.prompt ?? '',
      })),
      skipDuplicates: true,
    });
    return created.count;
  });
}

// THE submit claim (review fix F2). CAS pending→submitting, only while no
// provider request id exists. Exactly ONE concurrent slice wins this claim,
// and ONLY the winner may call provider.submit — the structural guarantee
// that two racing polls can never double-submit (and double-bill) a job.
export async function claimJob(userId: string, jobId: string): Promise<boolean> {
  return withUser(userId, async (db) => {
    const updated = await db.generationJob.updateMany({
      where: { id: jobId, status: 'pending', providerRequestId: null },
      data: { status: 'submitting' },
    });
    return updated.count > 0;
  });
}

// Release a submit claim after a DEFINITE provider rejection (the submission
// certainly does not exist provider-side): CAS submitting→pending so a later
// slice can re-claim and retry. Ambiguous failures (timeouts) must NOT
// release — the pipeline fails the job instead (see run-pipeline.ts).
export async function releaseJobClaim(userId: string, jobId: string): Promise<boolean> {
  return withUser(userId, async (db) => {
    const updated = await db.generationJob.updateMany({
      where: { id: jobId, status: 'submitting', providerRequestId: null },
      data: { status: 'pending' },
    });
    return updated.count > 0;
  });
}

// THE resubmit guard. Persists the provider's request id in the same CAS that
// flips submitting→submitted, and only while provider_request_id IS NULL — a
// resumed slice that lost the race finds count=0, re-reads the job, and
// HARVESTS by the stored id instead of resubmitting (double-spend guard).
export async function markJobSubmitted(
  userId: string,
  jobId: string,
  providerRequestId: string,
  costUsd: number,
): Promise<boolean> {
  return withUser(userId, async (db) => {
    const updated = await db.generationJob.updateMany({
      where: { id: jobId, status: 'submitting', providerRequestId: null },
      data: { status: 'submitted', providerRequestId, costUsd },
    });
    return updated.count > 0;
  });
}

// CAS a non-terminal job to complete. `costUsd` (when provided) replaces the
// submit-time estimate with the provider-reported actual.
export async function completeJob(
  userId: string,
  jobId: string,
  patch?: { costUsd?: number },
): Promise<boolean> {
  return withUser(userId, async (db) => {
    const updated = await db.generationJob.updateMany({
      where: { id: jobId, status: { in: ['pending', 'submitted'] } },
      data: {
        status: 'complete',
        ...(patch?.costUsd !== undefined ? { costUsd: patch.costUsd } : {}),
      },
    });
    return updated.count > 0;
  });
}

// 'submitting' included: an AMBIGUOUS submit failure (timeout — the request
// may exist provider-side) is conservatively failed from the claim state.
export async function failJob(userId: string, jobId: string, error: string): Promise<boolean> {
  return withUser(userId, async (db) => {
    const updated = await db.generationJob.updateMany({
      where: { id: jobId, status: { in: ['pending', 'submitting', 'submitted'] } },
      data: { status: 'failed', error },
    });
    return updated.count > 0;
  });
}

export async function listJobs(userId: string, runId: string): Promise<GenerationJobRow[]> {
  return withUser(userId, async (db) => {
    const rows = await db.generationJob.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
      select: JOB_SELECT,
    });
    return rows.map(toJobRow);
  });
}

// ---------------------------------------------------------------------------
// Images (immutable results + provenance).
// ---------------------------------------------------------------------------

export type InsertImageInput = {
  runId: string;
  jobId: string;
  conceptKey: string;
  view: string;
  storagePath: string;
  previewPath?: string;
  width: number;
  height: number;
  provider: string;
  model: string;
  providerRequestId?: string;
  costUsd: number;
  provenance?: Prisma.InputJsonValue;
};

export async function insertImage(
  userId: string,
  input: InsertImageInput,
): Promise<GenerationImageRow> {
  return withUser(userId, async (db) => {
    const row = await db.generationImage.create({
      data: {
        runId: input.runId,
        jobId: input.jobId,
        conceptKey: input.conceptKey,
        view: input.view,
        storagePath: input.storagePath,
        previewPath: input.previewPath ?? null,
        width: input.width,
        height: input.height,
        provider: input.provider,
        model: input.model,
        providerRequestId: input.providerRequestId ?? null,
        costUsd: input.costUsd,
        provenance: input.provenance,
      },
      select: IMAGE_SELECT,
    });
    return toImageRow(row);
  });
}

// All images for one run (the advance loop's harvest-idempotency read: a job
// that already has an image row is never re-inserted on a re-entered slice).
export async function listImages(userId: string, runId: string): Promise<GenerationImageRow[]> {
  return withUser(userId, async (db) => {
    const rows = await db.generationImage.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
      select: IMAGE_SELECT,
    });
    return rows.map(toImageRow);
  });
}

// ---------------------------------------------------------------------------
// Cost true-up + spend cap reads.
// ---------------------------------------------------------------------------

// Replace the run's ESTIMATED cost with the sum of its jobs' actuals (review
// item 4: estimate at insert, true up at completion) and stamp completed_at
// once the run is complete. TERMINAL runs only: pre-terminal, cost_usd is the
// conservative estimate the daily spend cap sums — lowering it mid-run would
// let concurrent runs slip under the cap (the TOCTOU the estimate exists to
// close). A non-terminal run is left untouched. Returns the jobs' actual total
// either way. `extraCostUsd` carries run-level costs that have no job row —
// the orchestrator's token spend (pipeline D7: orchestration is part of the
// run's real cost).
export async function trueUpRunCost(
  userId: string,
  runId: string,
  extraCostUsd = 0,
): Promise<number> {
  if (!Number.isFinite(extraCostUsd) || extraCostUsd < 0) {
    throw new Error(`[generation] extraCostUsd must be >= 0 (got ${extraCostUsd})`);
  }
  return withUser(userId, async (db) => {
    const agg = await db.generationJob.aggregate({
      where: { runId },
      _sum: { costUsd: true },
    });
    const total = Number(agg._sum.costUsd ?? 0) + extraCostUsd;
    await db.generationRun.updateMany({
      where: { id: runId, status: { in: ['complete', 'failed'] } },
      data: { costUsd: total },
    });
    await db.generationRun.updateMany({
      where: { id: runId, status: 'complete', completedAt: null },
      data: { completedAt: new Date() },
    });
    return total;
  });
}

// Today's GLOBAL generation spend (UTC), via the SECURITY DEFINER aggregate —
// app_user's RLS view only covers the caller's own runs, hence the definer.
// Needs an authenticated user only for the connection; any session works.
export async function spendToday(userId: string): Promise<number> {
  return withUser(userId, (db) => callSpendToday(db));
}

// Same read for the system sweeper/cron, where no user session exists.
export async function spendTodaySystem(): Promise<number> {
  return withSystem((db) => callSpendToday(db));
}

// ---------------------------------------------------------------------------
// Sweeper (system maintenance — the ONE legitimate withSystem write path
// here). Fails + refunds non-terminal runs past their deadline (or, lacking
// one, idle past the TTL). app_refund_credits derives the refunded user from
// the spend row, so no user identity is ever supplied from system code.
// ---------------------------------------------------------------------------

// SECURITY NOTE (advisory): when this is wired to cron, ttlMinutes must stay a
// SERVER constant — never derived from request input. A caller-supplied tiny
// TTL would fail (and refund) every healthy in-flight run in the system.
export async function sweepStaleRuns(ttlMinutes: number): Promise<number> {
  const now = new Date();
  const cutoff = staleCutoff(now, ttlMinutes);

  // List read in its OWN transaction, then ONE withSystem transaction PER
  // stale run: a backlog (e.g. cron resuming after an outage) must not pile
  // every CAS+refund into a single 15s interactive tx that times out and
  // rolls back ALL of them. Per-run, a partial sweep keeps its progress.
  const stale = await withSystem((db) =>
    db.generationRun.findMany({
      where: {
        status: { in: [...NON_TERMINAL_RUN_STATUSES] },
        OR: [{ deadlineAt: { lt: now } }, { deadlineAt: null, updatedAt: { lt: cutoff } }],
      },
      select: { id: true },
    }),
  );

  let swept = 0;
  for (const { id } of stale) {
    const didSweep = await withSystem(async (db) => {
      const updated = await db.generationRun.updateMany({
        where: { id, status: { in: [...NON_TERMINAL_RUN_STATUSES] } },
        data: { status: 'failed', error: 'timeout: swept after deadline', completedAt: now },
      });
      if (updated.count === 0) return false; // a poll slice completed it under us
      await callRefundCredits(db, id);
      return true;
    });
    if (didSweep) swept += 1;
  }
  return swept;
}
