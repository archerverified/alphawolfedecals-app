// Goal 7 D3 — orchestrator unit tests. ALL offline: the Anthropic SDK is
// vi.mock'd, no key, no spend. The integration test (one real Haiku call)
// lives in ai-orchestrator.integration.test.ts behind an env gate.

import { createHash } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_CONFIG } from '@alphawolf/db';

import type { BriefData } from '../lib/brief/schema';

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }));

vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create: createMock };
  },
}));

import {
  compileBrief,
  compileIteration,
  DIRECTION_KEYS,
  ITERATION_CHIPS,
  ORCHESTRATOR_PROMPT_VERSION,
  OrchestratorError,
} from '../lib/ai/orchestrator';
import {
  ITERATION_SYSTEM_PROMPT,
  ORCHESTRATOR_SYSTEM_PROMPT,
} from '../lib/ai/orchestrator/prompts';

const LOGO_FILE_NAME = 'alpha-wolf-logo.png';
const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const briefWithLogo: BriefData = {
  logo: { assetId: UUID_A, fileName: LOGO_FILE_NAME, zonePanelIds: [UUID_B] },
  colors: {
    picks: [
      {
        hex: '#00AEEF',
        role: 'primary',
        brand: '3M',
        name: 'Bright Blue',
        sku: '2080-G77',
        finish: 'gloss',
      },
      { hex: '#111111', role: 'accent' },
    ],
  },
  style: { presets: ['Aggressive'], prompt: 'fast, modern, construction-tough' },
  zoneNotes: { [UUID_B]: 'keep the rocker panels simple' },
  materials: { tier: 'premium_cast' },
  extras: { chromeDelete: true },
  photos: [{ assetId: UUID_A, note: 'roof rack installed' }],
  aiNotes: 'we are a construction company, keep it professional',
};

const vehicle = { year: 2024, make: 'Ford', model: 'Transit', bodyType: 'van' };
const views = ['front', 'driver', 'back', 'passenger'];

function validCompilePayload(forViews: string[]) {
  return {
    directions: DIRECTION_KEYS.map((key) => ({
      key,
      title: `${key} concept`,
      summary: `A ${key} take on the brief.`,
      viewPrompts: Object.fromEntries(
        forViews.map((v) => [v, `Wrap design for the ${v} view following body panels, no text.`]),
      ),
    })),
  };
}

function modelResponse(payload: unknown, usage = { input_tokens: 1000, output_tokens: 500 }) {
  return {
    content: [
      { type: 'text', text: typeof payload === 'string' ? payload : JSON.stringify(payload) },
    ],
    usage,
    stop_reason: 'end_turn',
  };
}

let savedKey: string | undefined;

beforeEach(() => {
  savedKey = process.env.ANTHROPIC_API_KEY;
  process.env.ANTHROPIC_API_KEY = 'test-not-a-real-key';
});

afterEach(() => {
  if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
  else process.env.ANTHROPIC_API_KEY = savedKey;
  createMock.mockReset();
});

describe('compileBrief', () => {
  it('returns 3 validated directions in stable order with versioned provenance', async () => {
    // Model returns them shuffled — the result must still be literal/bolder/minimal.
    const payload = validCompilePayload(views);
    payload.directions.reverse();
    createMock.mockResolvedValue(modelResponse(payload));

    const result = await compileBrief({ briefData: briefWithLogo, vehicle, views });

    expect(result.directions.map((d) => d.key)).toEqual(['literal', 'bolder', 'minimal']);
    expect(Object.keys(result.directions[0]!.viewPrompts).sort()).toEqual([...views].sort());
    expect(result.promptVersion).toBe(ORCHESTRATOR_PROMPT_VERSION);
    expect(result.promptVersion).toBe('v1');
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('sends a structured-outputs request with the orchestrator config', async () => {
    createMock.mockResolvedValue(modelResponse(validCompilePayload(views)));
    await compileBrief({ briefData: briefWithLogo, vehicle, views });

    const params = createMock.mock.calls[0]![0];
    expect(params.model).toBe(AI_CONFIG.orchestrator.model);
    expect(params.max_tokens).toBe(AI_CONFIG.orchestrator.maxTokens);
    expect(params.output_config.format.type).toBe('json_schema');
    const schema = params.output_config.format.schema;
    expect(schema.properties.directions).toBeDefined();
    // Every object level must carry additionalProperties:false (API requirement).
    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties.directions.items.additionalProperties).toBe(false);
    expect(schema.properties.directions.items.properties.viewPrompts.required).toEqual(
      expect.arrayContaining(views),
    );
  });

  it('LOGO RULE: the request reserves clear space and never asks to render the logo', async () => {
    createMock.mockResolvedValue(modelResponse(validCompilePayload(views)));
    await compileBrief({
      briefData: briefWithLogo,
      vehicle,
      views,
      logoZones: ['Hood', 'Driver Front Door'],
      panelsByView: {
        front: ['Hood', 'Front Bumper'],
        driver: ['Driver Front Door', 'Driver Slider'],
      },
    });

    const params = createMock.mock.calls[0]![0];
    const system: string = params.system;
    const user: string = params.messages[0].content;

    // System prompt: clear-space + no-text + geometry rules are all present.
    expect(system).toContain('NEVER RENDERED BY THE IMAGE MODEL');
    expect(system).toContain('CLEAR SPACE');
    expect(system).toContain('NO TEXT OF ANY KIND');
    expect(system).toMatch(/body panels and geometry/i);
    expect(system).toMatch(/plain light studio background/i);

    // User message: zones are named, the clear-space directive is explicit,
    // and there is NO instruction to render/describe the logo.
    expect(user).toContain('Hood');
    expect(user).toContain('Driver Front Door');
    expect(user).toContain('Do NOT render or describe the logo');
    expect(user).toContain('clear space');
    expect(user).not.toContain(LOGO_FILE_NAME);

    // Brief content informs the prompt: colors with SKU, style, zone notes, extras.
    expect(user).toContain('#00AEEF');
    expect(user).toContain('SKU 2080-G77');
    expect(user).toContain('Aggressive');
    expect(user).toContain('keep the rocker panels simple');
    expect(user).toContain('Chrome delete');
    expect(user).toContain('roof rack installed');
  });

  it('retries ONCE with a repair message on malformed JSON, then throws OrchestratorError', async () => {
    createMock.mockResolvedValue(modelResponse('this is not json {'));

    await expect(compileBrief({ briefData: briefWithLogo, vehicle, views })).rejects.toThrowError(
      OrchestratorError,
    );
    expect(createMock).toHaveBeenCalledTimes(2);

    // The second call carries the repair turn: bad output echoed + fix request.
    const retryMessages = createMock.mock.calls[1]![0].messages;
    expect(retryMessages).toHaveLength(3);
    expect(retryMessages[1].role).toBe('assistant');
    expect(retryMessages[2].content).toContain('failed validation');
  });

  it('recovers when the repair retry returns valid JSON, summing usage across both calls', async () => {
    createMock
      .mockResolvedValueOnce(modelResponse('{"directions": "nope"}'))
      .mockResolvedValueOnce(modelResponse(validCompilePayload(views)));

    const result = await compileBrief({ briefData: briefWithLogo, vehicle, views });
    expect(result.directions).toHaveLength(3);
    expect(result.usage.inputTokens).toBe(2000);
    expect(result.usage.outputTokens).toBe(1000);
  });

  it('rejects schema-shaped output that breaks the rubric (zod is the boundary)', async () => {
    // 3 directions but "literal" twice — passes JSON.parse, must fail zod.
    const payload = validCompilePayload(views);
    payload.directions[1]!.key = 'literal' as (typeof DIRECTION_KEYS)[number];
    createMock.mockResolvedValue(modelResponse(payload));

    await expect(compileBrief({ briefData: briefWithLogo, vehicle, views })).rejects.toThrowError(
      /failed validation after repair retry/,
    );
    expect(createMock).toHaveBeenCalledTimes(2);
  });

  it('computes usage cost from AI_CONFIG orchestrator pricing', async () => {
    createMock.mockResolvedValue(
      modelResponse(validCompilePayload(views), { input_tokens: 1234, output_tokens: 567 }),
    );
    const result = await compileBrief({ briefData: briefWithLogo, vehicle, views });

    const expected =
      (1234 * AI_CONFIG.orchestrator.inputUsdPerMTok +
        567 * AI_CONFIG.orchestrator.outputUsdPerMTok) /
      1_000_000;
    expect(result.usage).toEqual({
      inputTokens: 1234,
      outputTokens: 567,
      estimatedUsd: Math.round(expected * 1e6) / 1e6,
    });
  });

  it('throws a typed error without calling the API when ANTHROPIC_API_KEY is absent', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const err = await compileBrief({ briefData: briefWithLogo, vehicle, views }).catch((e) => e);
    expect(err).toBeInstanceOf(OrchestratorError);
    expect((err as OrchestratorError).code).toBe('missing_api_key');
    expect(createMock).not.toHaveBeenCalled();
  });

  it('rejects empty or duplicate view lists before spending tokens', async () => {
    await expect(
      compileBrief({ briefData: briefWithLogo, vehicle, views: [] }),
    ).rejects.toThrowError(OrchestratorError);
    await expect(
      compileBrief({ briefData: briefWithLogo, vehicle, views: ['front', 'front'] }),
    ).rejects.toThrowError(OrchestratorError);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe('compileIteration', () => {
  const iterationInput = {
    conceptSummary: 'A bold blue construction wrap.',
    viewPrompts: {
      front: 'Blue hood with dark accents, no text.',
      driver: 'Blue side sweep across the doors, no text.',
      back: 'Solid blue rear with dark bumper, no text.',
      passenger: 'Mirror of the driver side, no text.',
      top: 'Solid blue roof, no text.',
    },
    instruction: 'hood matte black',
    views: ['front', 'driver', 'back', 'passenger', 'top'],
  };

  it('returns only the affected views (deduped, canonical order) with the edit prompt', async () => {
    createMock.mockResolvedValue(
      modelResponse({
        affectedViews: ['top', 'front', 'front'],
        editPrompt: 'change the hood to matte black, keep everything else exactly the same',
        title: 'Matte black hood',
      }),
    );

    const result = await compileIteration(iterationInput);
    expect(result.affectedViews).toEqual(['front', 'top']);
    expect(result.editPrompt).toContain('matte black');
    expect(result.title).toBe('Matte black hood');
    expect(result.promptVersion).toBe('v1');

    // Request carried the current prompts + instruction; no-text rule in system.
    const params = createMock.mock.calls[0]![0];
    expect(params.system).toContain('NO TEXT');
    expect(params.messages[0].content).toContain('hood matte black');
    expect(params.messages[0].content).toContain('Blue side sweep across the doors');
  });

  it('rejects affectedViews outside the provided view set after the repair retry', async () => {
    createMock.mockResolvedValue(
      modelResponse({ affectedViews: ['hood'], editPrompt: 'x', title: 'x' }),
    );
    await expect(compileIteration(iterationInput)).rejects.toThrowError(OrchestratorError);
    expect(createMock).toHaveBeenCalledTimes(2);
  });
});

describe('prompt provenance', () => {
  it('pins the prompt text to ORCHESTRATOR_PROMPT_VERSION (edit a prompt? bump the version AND this hash)', () => {
    // Run provenance records the version string; this pin makes a silent
    // prompt edit (text changed, version not bumped) fail loudly in CI.
    const hash = createHash('sha256')
      .update(ORCHESTRATOR_SYSTEM_PROMPT)
      .update('::')
      .update(ITERATION_SYSTEM_PROMPT)
      .digest('hex');
    expect(`${ORCHESTRATOR_PROMPT_VERSION}:${hash}`).toBe(
      'v1:c072246ae6c0f3c846519852b52f6ba920064e69d1731e86c18d38e3fea901d5',
    );
  });
});

describe('ITERATION_CHIPS', () => {
  it('ships the six customer-voice chips with non-empty instructions', () => {
    expect(ITERATION_CHIPS.map((c) => c.label)).toEqual([
      'More aggressive',
      'Less busy',
      'Brighter colors',
      'Darker look',
      'Swap accent color',
      'More contrast',
    ]);
    for (const chip of ITERATION_CHIPS) {
      expect(chip.instruction.length).toBeGreaterThan(20);
    }
  });
});
