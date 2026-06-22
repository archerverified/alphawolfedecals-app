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
  getBriefSnapshotMock: vi.fn(),
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
    briefs: {
      getBrief: h.getBriefMock,
      getBriefSnapshot: h.getBriefSnapshotMock,
      snapshotBrief: h.snapshotBriefMock,
    },
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

import { AI_CONFIG, AI_MODELS, CREDIT_CONFIG, estimateImageCostUsd } from '@alphawolf/db';

import {
  advanceGenerationAction,
  getGenerationContextAction,
  startFinalAction,
  startGenerationRunAction,
  startIterationAction,
} from '@/lib/actions/generation';
import { estimateRunCostUsd } from '@/lib/generation/cost';

const TOKEN = 'client-token-1234';

// 1 driver view on the CONFIGURED draft model × 3 directions — derived, not
// hardcoded, so a bake-off changing the default (e.g. #151's nano-banana
// switch, which broke the hardcoded 0.12 on the merge with main) can't break
// this test again.
const INITIAL_ESTIMATE = Number(
  (
    estimateImageCostUsd(
      AI_MODELS[AI_CONFIG.defaults.draft].pricing,
      AI_CONFIG.draftImage.width,
      AI_CONFIG.draftImage.height,
      1,
    ) * 3
  ).toFixed(4),
);

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
  // Default snapshot: no photos (data: {}), matching the live-brief default above.
  h.getBriefSnapshotMock.mockResolvedValue({
    briefId: 'brief-1',
    version: 4,
    data: {},
    label: null,
    createdAt: new Date(),
  });
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
        // Goal 18: every final view conditions on up to 3 input images — the
        // structure render, the Goal-17 approved-draft donor, AND the directional
        // gradient guide. flux2_pro_metered at 1600×1200 (2MP) + 3 inputs:
        // 0.03 + 0.015×(2-1+3) = 0.09 × 2 views = 0.18. The pre-estimate counts the
        // worst case so the daily spend cap stays a true upper bound.
        estimatedCostUsd: 0.18,
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

// ---------------------------------------------------------------------------
// Goal 21 T4: estimateRunCostUsd photo-render cost accounting
// ---------------------------------------------------------------------------

describe('estimateRunCostUsd - photo render cost terms (Goal 21 T4)', () => {
  // Compute the per-image cost for one nano photo render at draft dims.
  function nanoPhotoCostDraft(): number {
    return estimateImageCostUsd(
      AI_MODELS[AI_CONFIG.defaults.photo].pricing,
      AI_CONFIG.draftImage.width,
      AI_CONFIG.draftImage.height,
    );
  }

  // Compute the per-image cost for one nano photo render at final dims.
  function nanoPhotoCostFinal(): number {
    return estimateImageCostUsd(
      AI_MODELS[AI_CONFIG.defaults.photo].pricing,
      AI_CONFIG.finalImage.width,
      AI_CONFIG.finalImage.height,
    );
  }

  it('initial estimate with photoRenders:3 equals no-photo estimate + 3 nano draft renders', () => {
    const views = 1;
    const withoutPhoto = estimateRunCostUsd(AI_CONFIG.defaults.draft, 'initial', views);
    const withPhoto = estimateRunCostUsd(AI_CONFIG.defaults.draft, 'initial', views, {
      photoRenders: 3,
    });
    const expected = Number((withoutPhoto + 3 * nanoPhotoCostDraft()).toFixed(4));
    expect(withPhoto).toBeCloseTo(expected, 4);
  });

  it('initial estimate with photoRenders:0 equals no-photo estimate (unchanged behavior)', () => {
    const views = 2;
    const withoutPhoto = estimateRunCostUsd(AI_CONFIG.defaults.draft, 'initial', views);
    const withZero = estimateRunCostUsd(AI_CONFIG.defaults.draft, 'initial', views, {
      photoRenders: 0,
    });
    const withOmitted = estimateRunCostUsd(AI_CONFIG.defaults.draft, 'initial', views);
    expect(withZero).toBe(withoutPhoto);
    expect(withOmitted).toBe(withoutPhoto);
  });

  it('final estimate with photoRenders:1 adds exactly one nano render at final dims', () => {
    const views = 2;
    const withoutPhoto = estimateRunCostUsd(AI_CONFIG.defaults.final, 'final', views);
    const withPhoto = estimateRunCostUsd(AI_CONFIG.defaults.final, 'final', views, {
      photoRenders: 1,
    });
    const expected = Number((withoutPhoto + nanoPhotoCostFinal()).toFixed(4));
    expect(withPhoto).toBeCloseTo(expected, 4);
  });

  it('final estimate with photoRenders:0 or omitted equals the no-photo estimate', () => {
    const views = 1;
    const baseline = estimateRunCostUsd(AI_CONFIG.defaults.final, 'final', views);
    expect(estimateRunCostUsd(AI_CONFIG.defaults.final, 'final', views, { photoRenders: 0 })).toBe(
      baseline,
    );
    expect(estimateRunCostUsd(AI_CONFIG.defaults.final, 'final', views, {})).toBe(baseline);
  });
});

describe('startGenerationRunAction - photo cost included in estimate (Goal 21 T4)', () => {
  it('brief with photos: estimate includes 3 photo renders in the spend gate', async () => {
    // A brief that has one uploaded photo (assetId must be a UUID per the brief schema).
    h.getBriefMock.mockResolvedValue({
      id: 'brief-1',
      projectId: 'proj-1',
      data: { photos: [{ assetId: '00000000-0000-0000-0000-000000000001' }] },
      rev: 3,
    });

    const withoutPhoto = estimateRunCostUsd(AI_CONFIG.defaults.draft, 'initial', 1);
    const photoCost =
      3 *
      estimateImageCostUsd(
        AI_MODELS[AI_CONFIG.defaults.photo].pricing,
        AI_CONFIG.draftImage.width,
        AI_CONFIG.draftImage.height,
      );
    const expectedEstimate = Number((withoutPhoto + photoCost).toFixed(4));

    await startGenerationRunAction('proj-1', TOKEN);
    expect(h.startRunMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ estimatedCostUsd: expectedEstimate }),
    );
  });

  it('brief without photos: estimate equals template-only cost (no photo term)', async () => {
    // Default brief mock has no photos (data: {}).
    const expectedEstimate = INITIAL_ESTIMATE;
    await startGenerationRunAction('proj-1', TOKEN);
    expect(h.startRunMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ estimatedCostUsd: expectedEstimate }),
    );
  });
});

describe('startFinalAction - photo cost included in estimate (Goal 21 T4)', () => {
  it('brief with photos: estimate includes 1 photo render at final dims in the spend gate', async () => {
    // Drive hasFinalPhoto through the SNAPSHOT path (matching orchestrate-final),
    // not the live brief. getBriefMock returns a row with empty data so the live
    // brief has NO photos; the snapshot at the parent run's briefVersion carries
    // the photo, proving the action reads the snapshot, not the live brief.
    h.getBriefMock.mockResolvedValue({ id: 'brief-1', projectId: 'proj-1', data: {}, rev: 3 });
    // assetId must be a UUID per the brief schema.
    h.getBriefSnapshotMock.mockResolvedValue({
      briefId: 'brief-1',
      version: 4,
      data: { photos: [{ assetId: '00000000-0000-0000-0000-000000000001' }] },
      label: null,
      createdAt: new Date(),
    });
    h.startRunMock.mockResolvedValue({ ok: true, run: { id: 'final-1' }, deduped: false });

    // Parent has 2 views (front + driver) to match the completedParent fixture.
    const withoutPhoto = estimateRunCostUsd(AI_CONFIG.defaults.final, 'final', 2);
    const photoCost = estimateImageCostUsd(
      AI_MODELS[AI_CONFIG.defaults.photo].pricing,
      AI_CONFIG.finalImage.width,
      AI_CONFIG.finalImage.height,
    );
    const expectedEstimate = Number((withoutPhoto + photoCost).toFixed(4));

    await startFinalAction('proj-1', 'parent-1', 'bolder', TOKEN);

    // Confirm the snapshot was fetched at the parent run's briefVersion (4).
    expect(h.getBriefSnapshotMock).toHaveBeenCalledWith('user-1', 'brief-1', 4);
    expect(h.startRunMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ estimatedCostUsd: expectedEstimate }),
    );
  });

  it('brief without photos: estimate equals template-only cost (no photo term)', async () => {
    // Default snapshot mock has no photos (data: {}). Confirms that a snapshot
    // with no photos does not add a photo cost term.
    h.startRunMock.mockResolvedValue({ ok: true, run: { id: 'final-1' }, deduped: false });

    // 0.18 is the existing fixture value (2 views, flux2_pro_edit, 3 input images).
    await startFinalAction('proj-1', 'parent-1', 'bolder', TOKEN);
    expect(h.startRunMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ estimatedCostUsd: 0.18 }),
    );
  });

  it('missing snapshot falls back to 0 photo renders (does not throw)', async () => {
    // Simulates a snapshot that has been purged or was never written.
    h.getBriefSnapshotMock.mockResolvedValue(null);
    h.startRunMock.mockResolvedValue({ ok: true, run: { id: 'final-1' }, deduped: false });

    const res = await startFinalAction('proj-1', 'parent-1', 'bolder', TOKEN);
    expect(res).toEqual({ ok: true, runId: 'final-1', deduped: false });

    // With no snapshot, hasFinalPhoto=false so estimate = template-only (0.18).
    expect(h.startRunMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ estimatedCostUsd: 0.18 }),
    );
  });
});
