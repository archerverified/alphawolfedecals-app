// Haiku orchestrator (Goal 7 D3, PRD §10). Compiles a brief snapshot into
// per-view image-generation instructions for 3 concept directions, and parses
// iteration requests into Kontext-style edits scoped to the affected views.
//
// Contract with the rest of the pipeline:
//  - structured outputs (output_config json_schema) constrain the model, then
//    zod RE-VALIDATES before anything is returned — model JSON is never fed
//    downstream unvalidated (design review B8). One repair retry on failure,
//    then a typed OrchestratorError.
//  - ANTHROPIC_API_KEY comes from env only and is never logged or included in
//    error messages.
//  - usage tokens + estimated USD are returned so the pipeline can ledger the
//    orchestration cost alongside image costs.
//  - transport failures (429/500/timeouts) propagate as the SDK's typed
//    Anthropic.APIError — deliberately NOT wrapped, so the pipeline can
//    distinguish retry-safe transport errors from OrchestratorError
//    (validation/config) when deciding refunds.

import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { resolveOrchestratorModel } from '@alphawolf/db';

import {
  buildCompileUserMessage,
  buildIterationUserMessage,
  ITERATION_SYSTEM_PROMPT,
  ORCHESTRATOR_PROMPT_VERSION,
  ORCHESTRATOR_SYSTEM_PROMPT,
  orderViews,
  type CompileBriefInput,
  type CompileIterationInput,
} from './prompts';

export { ORCHESTRATOR_PROMPT_VERSION } from './prompts';
export type { CompileBriefInput, CompileIterationInput, OrchestratorVehicle } from './prompts';
export { ITERATION_CHIPS, type IterationChip } from './chips';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export const DIRECTION_KEYS = ['literal', 'bolder', 'minimal'] as const;
export type DirectionKey = (typeof DIRECTION_KEYS)[number];

export interface OrchestratorUsage {
  inputTokens: number;
  outputTokens: number;
  /** From AI_CONFIG.orchestrator $/MTok pricing; for the spend ledger. */
  estimatedUsd: number;
}

/**
 * Structured directional-gradient descriptor (Goal 18). The image model cannot be
 * steered on gradient DIRECTION by prose (proven on real fal), so the final-stage
 * render is pinned with a deterministic gradient guide image built from this. When
 * `directional` is false the design has no front→rear flow and frontHex===rearHex
 * (the single base color); the pipeline then skips the guide.
 */
// Type alias (NOT an interface) so it stays assignable to Prisma's InputJsonValue
// when carried inside the run's `directions` JSONB (RunDirectionsJson) — interfaces
// lack the implicit index signature the JSON input types require.
export type GradientDescriptor = {
  directional: boolean;
  /** Hex of the color at the FRONT of the vehicle (grille/hood end). */
  frontHex: string;
  /** Hex of the color at the REAR of the vehicle (tailgate end). */
  rearHex: string;
};

export interface ConceptDirection {
  key: DirectionKey;
  /** Customer-facing, ≤40 chars. */
  title: string;
  /** Customer-facing, ≤140 chars. */
  summary: string;
  /** Structured front→rear gradient flow (Goal 18) for the deterministic guide. */
  gradient: GradientDescriptor;
  /** One image prompt per requested view. */
  viewPrompts: Record<string, string>;
}

export interface OrchestratorResult {
  directions: ConceptDirection[];
  promptVersion: string;
  usage: OrchestratorUsage;
}

export interface IterationResult {
  /** ONLY the views the edit touches — subset of the input views. */
  affectedViews: string[];
  /** Kontext-style edit instruction applied to each affected view. */
  editPrompt: string;
  /** Customer-facing revision label, ≤40 chars. */
  title: string;
  promptVersion: string;
  usage: OrchestratorUsage;
}

export type OrchestratorErrorCode = 'missing_api_key' | 'invalid_input' | 'invalid_model_output';

export class OrchestratorError extends Error {
  constructor(
    readonly code: OrchestratorErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'OrchestratorError';
  }
}

// ---------------------------------------------------------------------------
// Validation — structured outputs constrain generation; zod is the boundary
// the pipeline trusts. Length rules (≤40/≤140) are NOT expressible in the
// API's json_schema subset (no maxLength), so zod enforces them here and the
// repair retry handles the rare overflow.
// ---------------------------------------------------------------------------

function viewPromptsZod(views: string[]) {
  return z
    .object(
      Object.fromEntries(views.map((v) => [v, z.string().min(1)])) as Record<string, z.ZodString>,
    )
    .strict();
}

function compileResultZod(views: string[]) {
  const direction = z
    .object({
      key: z.enum(DIRECTION_KEYS),
      // Generous caps so a verbose model (Sonnet writes longer than Haiku) passes
      // validation instead of failing the run; the hard UI limits (40 / 140) are
      // applied by truncation in compileBrief. A genuinely runaway value still fails.
      title: z.string().min(1).max(160),
      summary: z.string().min(1).max(600),
      // Goal 18: shape-validated here; hex values are normalized/validated at the
      // guide-builder boundary (a bad hex just skips the guide, never repair-loops).
      gradient: z
        .object({
          directional: z.boolean(),
          frontHex: z.string(),
          rearHex: z.string(),
        })
        .strict(),
      viewPrompts: viewPromptsZod(views),
    })
    .strict();
  return z
    .object({
      directions: z
        .array(direction)
        .length(3)
        .refine((dirs) => new Set(dirs.map((d) => d.key)).size === 3, {
          message: 'directions must contain literal, bolder and minimal exactly once each',
        }),
    })
    .strict();
}

function iterationResultZod(views: string[]) {
  return z
    .object({
      affectedViews: z
        .array(z.string())
        .min(1)
        .refine((vs) => vs.every((v) => views.includes(v)), {
          message: `affectedViews must be a subset of: ${views.join(', ')}`,
        }),
      editPrompt: z.string().min(1),
      title: z.string().min(1).max(40),
    })
    .strict();
}

// JSON schemas for output_config — hand-built per request because the view set
// is dynamic. Structured-outputs subset rules: every object carries
// additionalProperties:false; no minLength/maxLength/minItems constraints.
type JsonSchema = Record<string, unknown>;

function compileJsonSchema(views: string[]): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['directions'],
    properties: {
      directions: {
        type: 'array',
        // NOTE: the structured-output subset still rejects minItems/maxItems > 1
        // and maxLength (verified real-API, Goal 18), so "exactly 3" + the ≤40/≤140
        // limits live in zod + the repair retry, not here. Over-long title/summary
        // are TRUNCATED in compileBrief (not failed) so a verbose model degrades
        // gracefully instead of erroring the run.
        description: 'Exactly three directions, keys literal, bolder, minimal in that order.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'title', 'summary', 'gradient', 'viewPrompts'],
          properties: {
            key: { type: 'string', enum: [...DIRECTION_KEYS] },
            title: {
              type: 'string',
              description: 'Customer-facing concept title, 40 characters max.',
            },
            summary: {
              type: 'string',
              description: 'Customer-facing one-liner, 140 characters max.',
            },
            gradient: {
              type: 'object',
              additionalProperties: false,
              required: ['directional', 'frontHex', 'rearHex'],
              properties: {
                directional: {
                  type: 'boolean',
                  description:
                    'true if the wrap is a directional gradient/fade/ombré along the vehicle.',
                },
                frontHex: {
                  type: 'string',
                  description:
                    'Hex (e.g. #000000) of the color at the FRONT of the vehicle. If not directional, the single base color.',
                },
                rearHex: {
                  type: 'string',
                  description:
                    'Hex of the color at the REAR of the vehicle. If not directional, the same base color as frontHex.',
                },
              },
            },
            viewPrompts: {
              type: 'object',
              additionalProperties: false,
              required: views,
              properties: Object.fromEntries(
                views.map((v) => [
                  v,
                  { type: 'string', description: `60-120 word image prompt for the ${v} view.` },
                ]),
              ),
            },
          },
        },
      },
    },
  };
}

function iterationJsonSchema(views: string[]): JsonSchema {
  return {
    type: 'object',
    additionalProperties: false,
    required: ['affectedViews', 'editPrompt', 'title'],
    properties: {
      affectedViews: {
        type: 'array',
        description: 'Only the views this edit visibly changes.',
        items: { type: 'string', enum: views },
      },
      editPrompt: {
        type: 'string',
        description: 'One Kontext-style edit instruction, 15-60 words.',
      },
      title: { type: 'string', description: 'Customer-facing revision label, 40 characters max.' },
    },
  };
}

// ---------------------------------------------------------------------------
// Anthropic call with one repair retry
// ---------------------------------------------------------------------------

function getClient(): Anthropic {
  // Key from env ONLY; never logged, never echoed into errors.
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey?.trim()) {
    throw new OrchestratorError('missing_api_key', 'ANTHROPIC_API_KEY is not set');
  }
  // Bounded so the orchestration slice fits the 60s hobby function ceiling.
  // maxRetries:0 — the SDK's auto-retry would DOUBLE wall time on a slow model;
  // our own callWithRepair loop is the only retry. The timeout must fit the
  // SLOWEST allowlisted model (Sonnet/Opus are slower than Haiku) inside 60s.
  return new Anthropic({ apiKey, timeout: 50_000, maxRetries: 0 });
}

function estimateOrchestratorUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: { inputUsdPerMTok: number; outputUsdPerMTok: number },
): number {
  const usd =
    (inputTokens * pricing.inputUsdPerMTok + outputTokens * pricing.outputUsdPerMTok) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

interface ParseAttempt<T> {
  ok: boolean;
  data?: T;
  issues?: string;
}

function parseAndValidate<T>(text: string, schema: z.ZodType<T>): ParseAttempt<T> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, issues: 'response was not valid JSON' };
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    return { ok: false, issues };
  }
  return { ok: true, data: parsed.data };
}

async function callWithRepair<T>(opts: {
  system: string;
  userMessage: string;
  jsonSchema: JsonSchema;
  zodSchema: z.ZodType<T>;
  label: string;
}): Promise<{ data: T; usage: OrchestratorUsage }> {
  const client = getClient();
  // Resolve the orchestrator model + its pricing once (env-driven, allowlisted;
  // throws on an unknown ANTHROPIC_ORCHESTRATOR_MODEL — fail fast, no fallback).
  const orchestrator = resolveOrchestratorModel();
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: opts.userMessage }];

  let inputTokens = 0;
  let outputTokens = 0;
  let lastIssues = 'unknown validation failure';

  // Total wall-clock budget for orchestration so a SLOW model (Sonnet/Opus) plus
  // the repair retry still fits the 60s hobby function slice. The per-attempt
  // timeout shrinks to whatever budget remains; if a repair would have under
  // ORCH_MIN_ATTEMPT_MS left, we fail with the last issues instead of starting a
  // call that the slice would kill mid-flight (stranding the run until the deadline).
  const ORCH_BUDGET_MS = 55_000;
  const ORCH_MIN_ATTEMPT_MS = 12_000;
  const startedAt = Date.now();

  for (let attempt = 0; attempt < 2; attempt++) {
    const remaining = ORCH_BUDGET_MS - (Date.now() - startedAt);
    if (attempt === 1 && remaining < ORCH_MIN_ATTEMPT_MS) break; // not enough budget to repair
    const attemptTimeout = Math.min(50_000, Math.max(ORCH_MIN_ATTEMPT_MS, remaining));
    const response = await client.messages.create(
      {
        model: orchestrator.model,
        max_tokens: orchestrator.maxTokens,
        system: opts.system,
        // Copy: the request must capture this attempt's turns, not a live
        // reference that a later repair push would mutate.
        messages: [...messages],
        output_config: { format: { type: 'json_schema', schema: opts.jsonSchema } },
      },
      { timeout: attemptTimeout },
    );

    inputTokens += response.usage?.input_tokens ?? 0;
    outputTokens += response.usage?.output_tokens ?? 0;

    const text =
      response.content?.find((b): b is Anthropic.TextBlock => b.type === 'text')?.text ?? '';
    const result = parseAndValidate(text, opts.zodSchema);
    if (result.ok && result.data !== undefined) {
      return {
        data: result.data,
        usage: {
          inputTokens,
          outputTokens,
          estimatedUsd: estimateOrchestratorUsd(inputTokens, outputTokens, orchestrator),
        },
      };
    }

    lastIssues = result.issues ?? lastIssues;
    if (attempt === 1) break; // no repair turn after the final attempt
    // One repair turn: echo the bad output back with the validation issues.
    messages.push(
      { role: 'assistant', content: text || '(empty response)' },
      {
        role: 'user',
        content:
          `Your previous response failed validation: ${lastIssues}. ` +
          'Return ONLY corrected JSON that satisfies the schema and every rule in the system prompt. No commentary.',
      },
    );
  }

  throw new OrchestratorError(
    'invalid_model_output',
    `${opts.label}: model output failed validation after repair retry (${lastIssues})`,
  );
}

/** Clamp customer-facing copy to its hard UI limit, with an ellipsis if cut. */
function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
}

function assertViews(views: string[]): void {
  if (views.length === 0) throw new OrchestratorError('invalid_input', 'views must be non-empty');
  if (new Set(views).size !== views.length) {
    throw new OrchestratorError('invalid_input', 'views must be unique');
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function compileBrief(input: CompileBriefInput): Promise<OrchestratorResult> {
  assertViews(input.views);
  const views = orderViews(input.views);

  const { data, usage } = await callWithRepair({
    system: ORCHESTRATOR_SYSTEM_PROMPT,
    userMessage: buildCompileUserMessage(input),
    jsonSchema: compileJsonSchema(views),
    zodSchema: compileResultZod(views),
    label: 'compileBrief',
  });

  // Stable order regardless of how the model ordered the array.
  const byKey = new Map(data.directions.map((d) => [d.key, d]));
  const directions: ConceptDirection[] = DIRECTION_KEYS.map((key) => {
    const d = byKey.get(key)!;
    return {
      key,
      // Hard UI limits enforced by truncation (the schema subset can't, and a
      // verbose model can overshoot) — ellipsis on the last char so it reads clean.
      title: truncate(d.title, 40),
      summary: truncate(d.summary, 140),
      gradient: d.gradient,
      viewPrompts: d.viewPrompts,
    };
  });

  return { directions, promptVersion: ORCHESTRATOR_PROMPT_VERSION, usage };
}

export async function compileIteration(input: CompileIterationInput): Promise<IterationResult> {
  assertViews(input.views);
  const views = orderViews(input.views);

  const { data, usage } = await callWithRepair({
    system: ITERATION_SYSTEM_PROMPT,
    userMessage: buildIterationUserMessage(input),
    jsonSchema: iterationJsonSchema(views),
    zodSchema: iterationResultZod(views),
    label: 'compileIteration',
  });

  // De-dupe and order canonically; zod already guaranteed the subset property.
  const affectedViews = orderViews([...new Set(data.affectedViews)]);

  return {
    affectedViews,
    editPrompt: data.editPrompt,
    title: data.title,
    promptVersion: ORCHESTRATOR_PROMPT_VERSION,
    usage,
  };
}
