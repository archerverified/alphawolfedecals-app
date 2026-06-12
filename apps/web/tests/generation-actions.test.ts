// Goal 7 D5 — generation server-action tests: gate ORDER (rate limit → spend
// cap → startRun's monthly+credits), friendly typed failures, event emission.
// All offline: guard, repos and the pipeline are mocked.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DbModule from '@alphawolf/db';
import type * as PipelineModule from '@/lib/ai/run-pipeline';

const h = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  getProjectMock: vi.fn(),
  getBriefMock: vi.fn(),
  snapshotBriefMock: vi.fn(),
  getPublishedDetailMock: vi.fn(),
  getPlanGateContextMock: vi.fn(),
  recordFailureMock: vi.fn(),
  spendTodayMock: vi.fn(),
  startRunMock: vi.fn(),
  getRunMock: vi.fn(),
  getRunContextMock: vi.fn(),
  listRunsForProjectMock: vi.fn(),
  advanceRunMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock('@/lib/admin/guard', () => ({ requireUser: h.requireUserMock }));
vi.mock('@/lib/notifications/posthog-server', () => ({ captureServerEvent: h.captureMock }));
vi.mock('@/lib/ai/run-pipeline', async (importOriginal) => {
  const actual = await importOriginal<typeof PipelineModule>();
  return { ...actual, advanceRun: h.advanceRunMock };
});
vi.mock('@alphawolf/db', async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>();
  return {
    ...actual,
    projects: { getProject: h.getProjectMock },
    briefs: { getBrief: h.getBriefMock, snapshotBrief: h.snapshotBriefMock },
    vehicles: { getPublishedDetail: h.getPublishedDetailMock },
    credits: { getPlanGateContext: h.getPlanGateContextMock },
    rateLimit: { recordFailure: h.recordFailureMock },
    generation: {
      spendToday: h.spendTodayMock,
      startRun: h.startRunMock,
      getRun: h.getRunMock,
      getRunContext: h.getRunContextMock,
      listRunsForProject: h.listRunsForProjectMock,
    },
    storage: {
      signedAssetReadUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
      templatePublicUrl: (key: string) => `https://templates.test/${key}`,
    },
  };
});

import { AI_CONFIG, CREDIT_CONFIG } from '@alphawolf/db';

import {
  advanceGenerationAction,
  getGenerationContextAction,
  startFinalAction,
  startGenerationRunAction,
  startIterationAction,
} from '@/lib/actions/generation';

const TOKEN = 'client-token-1234';

// 1 driver view on the draft model: 0.04/MP × 1MP × 3 directions = $0.12.
const INITIAL_ESTIMATE = 0.12;

function completedParent(overrides: Record<string, unknown> = {}) {
  return {
    id: 'parent-1',
    projectId: 'proj-1',
    userId: 'user-1',
    kind: 'initial',
    status: 'complete',
    briefVersion: 4,
    directions: {
      promptVersion: 'v1',
      orchestratorCostUsd: 0.005,
      directions: [
        {
          key: 'bolder',
          title: 'Bolder',
          summary: 'Bolder summary',
          viewPrompts: { front: 'front prompt', driver: 'driver prompt' },
        },
      ],
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.AI_PROVIDER;

  h.requireUserMock.mockResolvedValue({ id: 'user-1', email: 'a@b.co' });
  h.getProjectMock.mockResolvedValue({ id: 'proj-1', vehicleId: 'veh-1' });
  h.getBriefMock.mockResolvedValue({ id: 'brief-1', projectId: 'proj-1', data: {}, rev: 3 });
  h.snapshotBriefMock.mockResolvedValue({ ok: true, version: 4 });
  h.getPublishedDetailMock.mockResolvedValue({
    id: 'veh-1',
    panels: [{ id: 'p1', view: 'driver', name: 'Driver side' }],
  });
  h.getPlanGateContextMock.mockResolvedValue({ plan: 'free', usedVehicleIds: [] });
  h.recordFailureMock.mockResolvedValue({ allowed: true, lockedUntil: null, remaining: 10 });
  h.spendTodayMock.mockResolvedValue(0);
  h.startRunMock.mockResolvedValue({ ok: true, run: { id: 'run-1' }, deduped: false });
  h.getRunMock.mockResolvedValue(completedParent());
});

describe('startGenerationRunAction — gate ORDER', () => {
  it('GATE 1 first: a rate-limited account is refused before any spend read', async () => {
    h.recordFailureMock.mockResolvedValue({
      allowed: false,
      lockedUntil: new Date(),
      remaining: 0,
    });

    const res = await startGenerationRunAction('proj-1', TOKEN);
    expect(res).toMatchObject({ ok: false, code: 'rate_limited' });
    if (!res.ok) expect(res.message).toMatch(/limit/i);

    expect(h.recordFailureMock).toHaveBeenCalledWith({
      key: 'account:user-1:generation',
      windowMs: 24 * 60 * 60 * 1000,
      threshold: AI_CONFIG.customerRunsPerDay,
      lockoutMs: 24 * 60 * 60 * 1000,
    });
    expect(h.spendTodayMock).not.toHaveBeenCalled();
    expect(h.startRunMock).not.toHaveBeenCalled();
    // F8: a refused attempt must not leave an orphan brief-snapshot version.
    expect(h.snapshotBriefMock).not.toHaveBeenCalled();
  });

  it('GATE 2 second: the global daily spend cap refuses + emits ai_spend_cap_hit', async () => {
    h.spendTodayMock.mockResolvedValue(AI_CONFIG.dailySpendCapUsd - 0.01);

    const res = await startGenerationRunAction('proj-1', TOKEN);
    expect(res).toMatchObject({ ok: false, code: 'spend_cap' });

    expect(h.recordFailureMock).toHaveBeenCalled(); // gate 1 ran first
    expect(h.captureMock).toHaveBeenCalledWith(
      'ai_spend_cap_hit',
      'user-1',
      expect.objectContaining({
        capUsd: AI_CONFIG.dailySpendCapUsd,
        estimatedRunUsd: INITIAL_ESTIMATE,
      }),
    );
    expect(h.startRunMock).not.toHaveBeenCalled();
    // F8: gates run BEFORE the snapshot — no orphan snapshot on refusal.
    expect(h.snapshotBriefMock).not.toHaveBeenCalled();
  });

  it('GATE 3 last: insufficient credits comes back as a friendly typed result', async () => {
    h.startRunMock.mockResolvedValue({ ok: false, reason: 'insufficient_credits' });

    const res = await startGenerationRunAction('proj-1', TOKEN);
    expect(res).toEqual({
      ok: false,
      code: 'insufficient_credits',
      message: "You're out of credits for now.",
    });
    expect(h.spendTodayMock).toHaveBeenCalled(); // gates 1+2 ran first
  });

  it('maps the other startRun refusals to friendly codes', async () => {
    const cases = [
      ['monthly_runs', 'monthly_runs'],
      ['active_run_exists', 'active_run'],
      ['final_already_exists', 'final_exists'],
      ['project_not_found', 'not_found'],
    ] as const;
    for (const [reason, code] of cases) {
      h.startRunMock.mockResolvedValue({ ok: false, reason });
      const res = await startGenerationRunAction('proj-1', TOKEN);
      expect(res).toMatchObject({ ok: false, code });
      if (!res.ok) expect(res.message).not.toMatch(/error|exception|sql|rls/i);
    }
  });

  it('happy path: snapshots the brief, starts the run with config values, emits the event', async () => {
    const res = await startGenerationRunAction('proj-1', TOKEN);
    expect(res).toEqual({ ok: true, runId: 'run-1', deduped: false });

    expect(h.snapshotBriefMock).toHaveBeenCalledWith('user-1', 'brief-1', 'generation_run');
    expect(h.startRunMock).toHaveBeenCalledWith('user-1', {
      projectId: 'proj-1',
      kind: 'initial',
      briefVersion: 4,
      clientToken: TOKEN,
      estimatedCostUsd: INITIAL_ESTIMATE,
      creditCost: CREDIT_CONFIG.conceptGenerationCost,
      provider: 'mock',
      model: AI_CONFIG.defaults.draft,
      deadlineAt: expect.any(Date),
      monthlyRunLimit: 3,
    });
    expect(h.captureMock).toHaveBeenCalledWith(
      'generation_run_started',
      'user-1',
      expect.objectContaining({ runId: 'run-1', views: 1 }),
    );
  });

  it('a deduped replay (double click) returns the existing run WITHOUT a second event', async () => {
    h.startRunMock.mockResolvedValue({ ok: true, run: { id: 'run-1' }, deduped: true });
    const res = await startGenerationRunAction('proj-1', TOKEN);
    expect(res).toEqual({ ok: true, runId: 'run-1', deduped: true });
    expect(h.captureMock).not.toHaveBeenCalledWith(
      'generation_run_started',
      expect.anything(),
      expect.anything(),
    );
  });

  it('rejects a bogus client token and a foreign project before any gate', async () => {
    expect(await startGenerationRunAction('proj-1', '')).toMatchObject({
      ok: false,
      code: 'invalid',
    });
    h.getProjectMock.mockResolvedValue(null);
    expect(await startGenerationRunAction('proj-x', TOKEN)).toMatchObject({
      ok: false,
      code: 'not_found',
    });
    expect(h.recordFailureMock).not.toHaveBeenCalled();
    expect(h.startRunMock).not.toHaveBeenCalled();
  });
});

describe('startIterationAction', () => {
  it('starts an iteration against the parent concept (1 credit, iteration model)', async () => {
    h.startRunMock.mockResolvedValue({ ok: true, run: { id: 'iter-1' }, deduped: false });

    const res = await startIterationAction('proj-1', 'parent-1', 'bolder', 'matte hood', TOKEN);
    expect(res).toEqual({ ok: true, runId: 'iter-1', deduped: false });

    expect(h.startRunMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        kind: 'iteration',
        parentRunId: 'parent-1',
        conceptKey: 'bolder',
        instruction: 'matte hood',
        briefVersion: 4,
        creditCost: CREDIT_CONFIG.iterationCost,
        model: AI_CONFIG.defaults.iteration,
        // Pessimistic: ALL concept views (2) on the iteration model.
        estimatedCostUsd: 0.05,
      }),
    );
    expect(h.captureMock).toHaveBeenCalledWith(
      'iteration_started',
      'user-1',
      expect.objectContaining({ parentRunId: 'parent-1', conceptKey: 'bolder' }),
    );
  });

  it('refuses an unknown concept, a foreign parent, and an empty instruction', async () => {
    expect(
      await startIterationAction('proj-1', 'parent-1', 'nope', 'x'.repeat(10), TOKEN),
    ).toMatchObject({ ok: false, code: 'invalid' });

    h.getRunMock.mockResolvedValue(completedParent({ projectId: 'other-project' }));
    expect(
      await startIterationAction('proj-1', 'parent-1', 'bolder', 'matte hood', TOKEN),
    ).toMatchObject({ ok: false, code: 'not_found' });

    expect(await startIterationAction('proj-1', 'parent-1', 'bolder', '   ', TOKEN)).toMatchObject({
      ok: false,
      code: 'invalid',
    });
    expect(h.startRunMock).not.toHaveBeenCalled();
  });

  it('refuses to iterate on a non-complete parent', async () => {
    h.getRunMock.mockResolvedValue(completedParent({ status: 'rendering' }));
    expect(
      await startIterationAction('proj-1', 'parent-1', 'bolder', 'matte hood', TOKEN),
    ).toMatchObject({ ok: false, code: 'invalid' });
  });
});

describe('startFinalAction', () => {
  it('is FREE (0 credits) and uses the final model at final-image estimates', async () => {
    h.startRunMock.mockResolvedValue({ ok: true, run: { id: 'final-1' }, deduped: false });

    const res = await startFinalAction('proj-1', 'parent-1', 'bolder', TOKEN);
    expect(res).toEqual({ ok: true, runId: 'final-1', deduped: false });

    expect(h.startRunMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        kind: 'final',
        creditCost: 0,
        model: AI_CONFIG.defaults.final,
        // flux2_pro_metered at 1600×1200 (2MP) + 1 input: 0.03 + 0.015×2 = 0.06 × 2 views.
        estimatedCostUsd: 0.12,
      }),
    );
    expect(h.captureMock).toHaveBeenCalledWith(
      'final_started',
      'user-1',
      expect.objectContaining({ conceptKey: 'bolder' }),
    );
  });

  it('still rides the spend cap (real dollars even at 0 credits)', async () => {
    h.spendTodayMock.mockResolvedValue(AI_CONFIG.dailySpendCapUsd);
    const res = await startFinalAction('proj-1', 'parent-1', 'bolder', TOKEN);
    expect(res).toMatchObject({ ok: false, code: 'spend_cap' });
    expect(h.startRunMock).not.toHaveBeenCalled();
  });
});

describe('advanceGenerationAction + getGenerationContextAction', () => {
  it('advance: requires auth, delegates to advanceRun, 404s unknown runs', async () => {
    h.advanceRunMock.mockResolvedValue({ runId: 'run-1', status: 'rendering', jobs: [] });
    expect(await advanceGenerationAction('run-1')).toEqual({
      ok: true,
      run: { runId: 'run-1', status: 'rendering', jobs: [] },
    });
    expect(h.advanceRunMock).toHaveBeenCalledWith('user-1', 'run-1');

    h.advanceRunMock.mockResolvedValue(null);
    expect(await advanceGenerationAction('run-x')).toMatchObject({ ok: false, code: 'not_found' });
  });

  it('context: balance + monthly usage + gallery with SIGNED preview urls only', async () => {
    h.getRunContextMock.mockResolvedValue({ balance: 3, runsThisMonth: 1, activeRunId: null });
    h.listRunsForProjectMock.mockResolvedValue([
      {
        ...completedParent(),
        conceptKey: null,
        createdAt: new Date('2026-06-12T00:00:00Z'),
        images: [
          {
            conceptKey: 'bolder',
            view: 'front',
            previewPath: 'generations/proj-1/parent-1/bolder-front-preview.png',
            storagePath: 'generations/proj-1/parent-1/bolder-front.png',
          },
        ],
      },
    ]);

    const res = await getGenerationContextAction('proj-1');
    expect(res).toMatchObject({ ok: true, balance: 3, runsThisMonth: 1, monthlyRunLimit: 3 });
    if (res.ok) {
      expect(res.runs).toHaveLength(1);
      expect(res.runs[0]!.directions).toEqual([
        { key: 'bolder', title: 'Bolder', summary: 'Bolder summary' },
      ]);
      expect(res.runs[0]!.images).toEqual([
        {
          conceptKey: 'bolder',
          view: 'front',
          previewUrl: 'https://signed.test/generations/proj-1/parent-1/bolder-front-preview.png',
        },
      ]);
      // Original storage paths never reach the client payload.
      expect(JSON.stringify(res)).not.toContain('bolder-front.png');
    }
  });
});
