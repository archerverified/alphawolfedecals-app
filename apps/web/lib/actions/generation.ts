'use server';

// AI generation server actions (Goal 7 D5). RPC-style like saveCanvasAction /
// saveBriefAction: Next's built-in Server-Action origin check + requireUser +
// RLS (every run row is owner-scoped; startRun's WITH CHECK rejects foreign
// projects). No form CSRF token — these are JSON RPC actions, same convention
// as lib/actions/brief.ts.
//
// Gate ORDER on every paid start (design D7, money rails outermost-first):
//   1. per-account rate limit (abuse ceiling beneath credits)
//   2. GLOBAL daily spend cap (estimated cost counted conservatively)
//   3. generation.startRun — monthly plan gate + atomic credit spend, all in
//      one transaction under the per-user advisory lock.
// Failures map to typed, friendly results — never a raw throw at the client.

import {
  AI_CONFIG,
  AI_MODELS,
  CREDIT_CONFIG,
  PLAN_LIMITS,
  briefs,
  credits,
  estimateImageCostUsd,
  generation,
  projects,
  rateLimit,
  storage,
  vehicles,
  type AiModelKey,
  type GenerationRunKind,
  type GenerationRunStatus,
  type StartRunResult,
} from '@alphawolf/db';

import { requireUser } from '../admin/guard';
import {
  advanceRun,
  parseRunDirections,
  resolveRunViews,
  type RunSnapshot,
} from '../ai/run-pipeline';
import { getImageProvider } from '../ai/provider';
import { parseBriefData } from '../brief/schema';
import { captureServerEvent } from '../notifications/posthog-server';

const DAY_MS = 24 * 60 * 60 * 1000;
// Run TTL — past this the run fails + refunds (advance loop or sweeper cron).
const RUN_TTL_MS = 15 * 60 * 1000;

export type StartRunFailureCode =
  | 'not_found'
  | 'invalid'
  | 'rate_limited'
  | 'spend_cap'
  | 'insufficient_credits'
  | 'monthly_runs'
  | 'active_run'
  | 'final_exists'
  | 'error';

export type StartGenerationResult =
  | { ok: true; runId: string; deduped: boolean }
  | { ok: false; code: StartRunFailureCode; message: string };

// Customer-voice copy (CLAUDE.md §4: simple, direct, no dev-speak).
const FAILURE_MESSAGES: Record<StartRunFailureCode, string> = {
  not_found: "We couldn't find that project.",
  invalid: "Something about this request didn't look right. Refresh and try again.",
  rate_limited: "You've hit today's design-run limit. Come back tomorrow and keep going.",
  spend_cap:
    "We're at today's studio capacity for AI designs. Your credits are safe — try again tomorrow.",
  insufficient_credits: "You're out of credits for now.",
  monthly_runs: "You've used all your design runs for this month.",
  active_run: 'A design run is already in progress for this project. Hang tight.',
  final_exists: 'Final artwork for that concept already exists.',
  error: 'Something went wrong on our end. Nothing was charged — try again in a minute.',
};

function fail(code: StartRunFailureCode): StartGenerationResult {
  return { ok: false, code, message: FAILURE_MESSAGES[code] };
}

function mapStartRunFailure(
  reason: Extract<StartRunResult, { ok: false }>['reason'],
): StartGenerationResult {
  switch (reason) {
    case 'insufficient_credits':
      return fail('insufficient_credits');
    case 'monthly_runs':
      return fail('monthly_runs');
    case 'active_run_exists':
      return fail('active_run');
    case 'final_already_exists':
      return fail('final_exists');
    case 'project_not_found':
      return fail('not_found');
    case 'token_conflict':
      return fail('invalid');
  }
}

function validToken(token: unknown): token is string {
  return typeof token === 'string' && token.trim().length >= 8 && token.length <= 100;
}

function round4(n: number): number {
  return Math.round(n * 1e4) / 1e4;
}

function estimateRunCostUsd(modelKey: AiModelKey, kind: GenerationRunKind, views: number): number {
  const dims = kind === 'final' ? AI_CONFIG.finalImage : AI_CONFIG.draftImage;
  const perImage = estimateImageCostUsd(AI_MODELS[modelKey].pricing, dims.width, dims.height, 1);
  const directions = kind === 'initial' ? 3 : 1;
  return round4(perImage * directions * views);
}

// Gates 1+2, shared by all three start actions. Returns null when clear.
async function checkSharedGates(
  userId: string,
  projectId: string,
  estimatedCostUsd: number,
): Promise<StartGenerationResult | null> {
  // GATE 1 — per-account daily run ceiling (PRD §4.4 abuse rail). Every start
  // attempt consumes one unit of the fixed window.
  const decision = await rateLimit.recordFailure({
    key: `account:${userId}:generation`,
    windowMs: DAY_MS,
    threshold: AI_CONFIG.customerRunsPerDay,
    lockoutMs: DAY_MS,
  });
  if (!decision.allowed) return fail('rate_limited');

  // GATE 2 — GLOBAL daily spend cap, estimated cost counted conservatively
  // (estimate-then-true-up closes the TOCTOU, design review item 4).
  const spentToday = await generation.spendToday(userId);
  if (spentToday + estimatedCostUsd > AI_CONFIG.dailySpendCapUsd) {
    await captureServerEvent('ai_spend_cap_hit', userId, {
      projectId,
      spentTodayUsd: spentToday,
      estimatedRunUsd: estimatedCostUsd,
      capUsd: AI_CONFIG.dailySpendCapUsd,
    });
    return fail('spend_cap');
  }
  return null;
}

// ---------------------------------------------------------------------------
// Initial run: brief → 3 concept directions.
// ---------------------------------------------------------------------------

export async function startGenerationRunAction(
  projectId: string,
  clientToken: string,
): Promise<StartGenerationResult> {
  const user = await requireUser(`/projects/${projectId}/brief`);
  if (!validToken(clientToken)) return fail('invalid');

  const project = await projects.getProject(user.id, projectId);
  if (!project) return fail('not_found');
  const brief = await briefs.getBrief(user.id, projectId);
  if (!brief) return fail('not_found');

  const parsed = parseBriefData(brief.data ?? {});
  if (!parsed.ok) return fail('invalid');
  const vehicle = await vehicles.getPublishedDetail(project.vehicleId);
  if (!vehicle) return fail('not_found');
  const views = resolveRunViews(vehicle.panels, parsed.data);
  if (views.length === 0) return fail('invalid');

  // Freeze the brief the run renders from (provenance: every concept traces
  // to an immutable snapshot version).
  const snapshot = await briefs.snapshotBrief(user.id, brief.id, 'generation_run');
  if (!snapshot.ok) return fail('not_found');

  const modelKey = AI_CONFIG.defaults.draft;
  const estimatedCostUsd = estimateRunCostUsd(modelKey, 'initial', views.length);
  const gate = await checkSharedGates(user.id, projectId, estimatedCostUsd);
  if (gate) return gate;

  // GATE 3 — startRun enforces the monthly plan gate + credit balance
  // atomically (one tx, per-user advisory lock).
  const provider = await getImageProvider();
  const planCtx = await credits.getPlanGateContext(user.id);
  const res = await generation.startRun(user.id, {
    projectId,
    kind: 'initial',
    briefVersion: snapshot.version,
    clientToken,
    estimatedCostUsd,
    creditCost: CREDIT_CONFIG.conceptGenerationCost,
    provider: provider.name,
    model: modelKey,
    deadlineAt: new Date(Date.now() + RUN_TTL_MS),
    monthlyRunLimit: PLAN_LIMITS[planCtx.plan].monthlyGenerationRuns,
  });
  if (!res.ok) return mapStartRunFailure(res.reason);

  if (!res.deduped) {
    await captureServerEvent('generation_run_started', user.id, {
      runId: res.run.id,
      projectId,
      briefVersion: snapshot.version,
      views: views.length,
      model: modelKey,
      provider: provider.name,
      estimatedUsd: estimatedCostUsd,
    });
  }
  return { ok: true, runId: res.run.id, deduped: res.deduped };
}

// ---------------------------------------------------------------------------
// Iteration: tweak one chosen concept (1 credit, affected views only).
// ---------------------------------------------------------------------------

export async function startIterationAction(
  projectId: string,
  parentRunId: string,
  conceptKey: string,
  instruction: string,
  clientToken: string,
): Promise<StartGenerationResult> {
  const user = await requireUser(`/projects/${projectId}/brief`);
  if (!validToken(clientToken)) return fail('invalid');
  const trimmed = typeof instruction === 'string' ? instruction.trim().slice(0, 500) : '';
  if (!trimmed) return fail('invalid');

  const parent = await loadParentConcept(user.id, projectId, parentRunId, conceptKey);
  if (!parent.ok) return parent.result;

  const modelKey = AI_CONFIG.defaults.iteration;
  // Pessimistic estimate: ALL of the concept's views (the orchestrator narrows
  // to affected views later; the estimate must bound, never undercount).
  const estimatedCostUsd = estimateRunCostUsd(modelKey, 'iteration', parent.views.length);
  const gate = await checkSharedGates(user.id, projectId, estimatedCostUsd);
  if (gate) return gate;

  const provider = await getImageProvider();
  const res = await generation.startRun(user.id, {
    projectId,
    kind: 'iteration',
    briefVersion: parent.run.briefVersion,
    clientToken,
    parentRunId,
    conceptKey,
    instruction: trimmed,
    estimatedCostUsd,
    creditCost: CREDIT_CONFIG.iterationCost,
    provider: provider.name,
    model: modelKey,
    deadlineAt: new Date(Date.now() + RUN_TTL_MS),
  });
  if (!res.ok) return mapStartRunFailure(res.reason);

  if (!res.deduped) {
    await captureServerEvent('iteration_started', user.id, {
      runId: res.run.id,
      projectId,
      parentRunId,
      conceptKey,
      model: modelKey,
      estimatedUsd: estimatedCostUsd,
    });
  }
  return { ok: true, runId: res.run.id, deduped: res.deduped };
}

// ---------------------------------------------------------------------------
// Final: export-quality re-render of the chosen concept (0 credits — included
// with selection; the once-per-concept partial unique stops farming).
// ---------------------------------------------------------------------------

export async function startFinalAction(
  projectId: string,
  parentRunId: string,
  conceptKey: string,
  clientToken: string,
): Promise<StartGenerationResult> {
  const user = await requireUser(`/projects/${projectId}/brief`);
  if (!validToken(clientToken)) return fail('invalid');

  const parent = await loadParentConcept(user.id, projectId, parentRunId, conceptKey);
  if (!parent.ok) return parent.result;

  const modelKey = AI_CONFIG.defaults.final;
  const estimatedCostUsd = estimateRunCostUsd(modelKey, 'final', parent.views.length);
  const gate = await checkSharedGates(user.id, projectId, estimatedCostUsd);
  if (gate) return gate;

  const provider = await getImageProvider();
  const res = await generation.startRun(user.id, {
    projectId,
    kind: 'final',
    briefVersion: parent.run.briefVersion,
    clientToken,
    parentRunId,
    conceptKey,
    estimatedCostUsd,
    creditCost: 0,
    provider: provider.name,
    model: modelKey,
    deadlineAt: new Date(Date.now() + RUN_TTL_MS),
  });
  if (!res.ok) return mapStartRunFailure(res.reason);

  if (!res.deduped) {
    await captureServerEvent('final_started', user.id, {
      runId: res.run.id,
      projectId,
      parentRunId,
      conceptKey,
      model: modelKey,
      estimatedUsd: estimatedCostUsd,
    });
  }
  return { ok: true, runId: res.run.id, deduped: res.deduped };
}

// Shared parent-run validation for iteration/final.
type ParentConcept =
  | { ok: true; run: { briefVersion: number }; views: string[] }
  | { ok: false; result: StartGenerationResult };

async function loadParentConcept(
  userId: string,
  projectId: string,
  parentRunId: string,
  conceptKey: string,
): Promise<ParentConcept> {
  if (typeof parentRunId !== 'string' || !parentRunId)
    return { ok: false, result: fail('invalid') };
  const parent = await generation.getRun(userId, parentRunId);
  if (!parent || parent.projectId !== projectId) return { ok: false, result: fail('not_found') };
  if (parent.status !== 'complete') return { ok: false, result: fail('invalid') };
  const concept = parseRunDirections(parent.directions)?.directions.find(
    (d) => d.key === conceptKey,
  );
  if (!concept) return { ok: false, result: fail('invalid') };
  const views = Object.keys(concept.viewPrompts);
  if (views.length === 0) return { ok: false, result: fail('invalid') };
  return { ok: true, run: { briefVersion: parent.briefVersion }, views };
}

// ---------------------------------------------------------------------------
// Advance — THE CLIENT POLL DRIVES THE PIPELINE. Each call runs one bounded
// slice and returns the snapshot the gallery renders.
// ---------------------------------------------------------------------------

export type AdvanceGenerationResult =
  | { ok: true; run: RunSnapshot }
  | { ok: false; code: 'not_found'; message: string };

export async function advanceGenerationAction(runId: string): Promise<AdvanceGenerationResult> {
  const user = await requireUser('/projects');
  if (typeof runId !== 'string' || !runId) {
    return { ok: false, code: 'not_found', message: FAILURE_MESSAGES.not_found };
  }
  const snapshot = await advanceRun(user.id, runId);
  if (!snapshot) return { ok: false, code: 'not_found', message: FAILURE_MESSAGES.not_found };
  return { ok: true, run: snapshot };
}

// ---------------------------------------------------------------------------
// Context read for the generation UI: balance, monthly usage, active run, and
// the past-runs gallery with signed (watermarked) preview URLs.
// ---------------------------------------------------------------------------

export type GenerationRunSummary = {
  runId: string;
  kind: GenerationRunKind;
  status: GenerationRunStatus;
  conceptKey: string | null;
  createdAt: string;
  directions: Array<{ key: string; title: string; summary: string }>;
  images: Array<{ conceptKey: string; view: string; previewUrl: string }>;
};

export type GenerationContextResult =
  | {
      ok: true;
      balance: number;
      runsThisMonth: number;
      monthlyRunLimit: number;
      activeRunId: string | null;
      runs: GenerationRunSummary[];
    }
  | { ok: false; code: 'not_found'; message: string };

export async function getGenerationContextAction(
  projectId: string,
): Promise<GenerationContextResult> {
  const user = await requireUser(`/projects/${projectId}/brief`);
  const project = await projects.getProject(user.id, projectId);
  if (!project) return { ok: false, code: 'not_found', message: FAILURE_MESSAGES.not_found };

  const ctx = await generation.getRunContext(user.id, projectId);
  const planCtx = await credits.getPlanGateContext(user.id);
  const runs = await generation.listRunsForProject(user.id, projectId);

  const summaries: GenerationRunSummary[] = await Promise.all(
    runs.map(async (run) => {
      const directions = (parseRunDirections(run.directions)?.directions ?? []).map(
        ({ key, title, summary }) => ({ key, title, summary }),
      );
      const images = (
        await Promise.all(
          run.images.map(async (img) => {
            if (!img.previewPath) return null;
            try {
              const previewUrl = await storage.signedAssetReadUrl(img.previewPath);
              return { conceptKey: img.conceptKey, view: img.view, previewUrl };
            } catch {
              return null;
            }
          }),
        )
      ).filter((i): i is NonNullable<typeof i> => i !== null);
      return {
        runId: run.id,
        kind: run.kind,
        status: run.status,
        conceptKey: run.conceptKey,
        createdAt: run.createdAt.toISOString(),
        directions,
        images,
      };
    }),
  );

  return {
    ok: true,
    balance: ctx.balance,
    runsThisMonth: ctx.runsThisMonth,
    monthlyRunLimit: PLAN_LIMITS[planCtx.plan].monthlyGenerationRuns,
    activeRunId: ctx.activeRunId,
    runs: summaries,
  };
}
