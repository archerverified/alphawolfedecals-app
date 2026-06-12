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

import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { AI_CONFIG } from '@alphawolf/db';

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

export interface ConceptDirection {
  key: DirectionKey;
  /** Customer-facing, ≤40 chars. */
  title: string;
  /** Customer-facing, ≤140 chars. */
  summary: string;
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
      title: z.string().min(1).max(40),
      summary: z.string().min(1).max(140),
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
        description: 'Exactly three directions, keys literal, bolder, minimal in that order.',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'title', 'summary', 'viewPrompts'],
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
  return new Anthropic({ apiKey });
}

function estimateOrchestratorUsd(inputTokens: number, outputTokens: number): number {
  const { inputUsdPerMTok, outputUsdPerMTok } = AI_CONFIG.orchestrator;
  const usd = (inputTokens * inputUsdPerMTok + outputTokens * outputUsdPerMTok) / 1_000_000;
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
  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: opts.userMessage }];

  let inputTokens = 0;
  let outputTokens = 0;
  let lastIssues = 'unknown validation failure';

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await client.messages.create({
      model: AI_CONFIG.orchestrator.model,
      max_tokens: AI_CONFIG.orchestrator.maxTokens,
      system: opts.system,
      // Copy: the request must capture this attempt's turns, not a live
      // reference that a later repair push would mutate.
      messages: [...messages],
      output_config: { format: { type: 'json_schema', schema: opts.jsonSchema } },
    });

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
          estimatedUsd: estimateOrchestratorUsd(inputTokens, outputTokens),
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
    return { key, title: d.title, summary: d.summary, viewPrompts: d.viewPrompts };
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
