// Goal 7 D5 — advance-slice executor tests. ALL offline: the REAL mock
// provider renders (sharp data-URI PNGs), the orchestrator is vi.mock'd, and
// the generation repo is an in-memory state machine that mirrors the CAS
// semantics of packages/db/src/repos/generation.ts.

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DbModule from '@alphawolf/db';

const h = vi.hoisted(() => {
  const TERMINAL = ['complete', 'failed'];
  const state = {
    runs: new Map<string, Record<string, unknown>>(),
    jobs: [] as Array<Record<string, unknown> & { id: string }>,
    images: [] as Array<Record<string, unknown> & { id: string }>,
    uploads: [] as Array<{ key: string; contentType: string; bytes: number }>,
    refunds: [] as string[],
    jobSeq: 0,
  };

  const fakeGeneration = {
    getRun: vi.fn(async (_u: string, id: string) => {
      const r = state.runs.get(id);
      return r ? { ...r } : null;
    }),
    advanceStatus: vi.fn(
      async (_u: string, id: string, from: string, to: string, patch?: Record<string, unknown>) => {
        const r = state.runs.get(id);
        if (!r || r.status !== from) return false;
        Object.assign(r, { status: to }, patch ?? {});
        return true;
      },
    ),
    failRun: vi.fn(async (_u: string, id: string, error: string) => {
      const r = state.runs.get(id);
      if (!r || TERMINAL.includes(r.status as string)) return { failed: false, refunded: false };
      Object.assign(r, { status: 'failed', error, completedAt: new Date() });
      state.refunds.push(id);
      return { failed: true, refunded: true };
    }),
    recordJobs: vi.fn(
      async (
        _u: string,
        runId: string,
        jobs: Array<{ conceptKey: string; view: string; prompt?: string }>,
      ) => {
        let created = 0;
        for (const j of jobs) {
          const dup = state.jobs.some(
            (e) => e.runId === runId && e.conceptKey === j.conceptKey && e.view === j.view,
          );
          if (dup) continue;
          state.jobSeq += 1;
          state.jobs.push({
            id: `job-${state.jobSeq}`,
            runId,
            conceptKey: j.conceptKey,
            view: j.view,
            status: 'pending',
            providerRequestId: null,
            prompt: j.prompt ?? '',
            costUsd: 0,
            error: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });
          created += 1;
        }
        return created;
      },
    ),
    listJobs: vi.fn(async (_u: string, runId: string) =>
      state.jobs.filter((j) => j.runId === runId).map((j) => ({ ...j })),
    ),
    // F2 claim semantics mirrored from the real repo: claimJob CAS
    // pending→submitting (only the winner submits), markJobSubmitted CAS
    // submitting→submitted, releaseJobClaim CAS submitting→pending.
    claimJob: vi.fn(async (_u: string, jobId: string) => {
      const j = state.jobs.find((e) => e.id === jobId);
      if (!j || j.status !== 'pending' || j.providerRequestId !== null) return false;
      j.status = 'submitting';
      return true;
    }),
    releaseJobClaim: vi.fn(async (_u: string, jobId: string) => {
      const j = state.jobs.find((e) => e.id === jobId);
      if (!j || j.status !== 'submitting' || j.providerRequestId !== null) return false;
      j.status = 'pending';
      return true;
    }),
    markJobSubmitted: vi.fn(
      async (_u: string, jobId: string, providerRequestId: string, costUsd: number) => {
        const j = state.jobs.find((e) => e.id === jobId);
        if (!j || j.status !== 'submitting' || j.providerRequestId !== null) return false;
        Object.assign(j, { status: 'submitted', providerRequestId, costUsd });
        return true;
      },
    ),
    completeJob: vi.fn(async (_u: string, jobId: string, patch?: { costUsd?: number }) => {
      const j = state.jobs.find((e) => e.id === jobId);
      if (!j || TERMINAL.includes(j.status as string)) return false;
      Object.assign(j, {
        status: 'complete',
        ...(patch?.costUsd !== undefined ? { costUsd: patch.costUsd } : {}),
      });
      return true;
    }),
    failJob: vi.fn(async (_u: string, jobId: string, error: string) => {
      const j = state.jobs.find((e) => e.id === jobId);
      if (!j || TERMINAL.includes(j.status as string)) return false;
      Object.assign(j, { status: 'failed', error });
      return true;
    }),
    insertImage: vi.fn(async (_u: string, input: Record<string, unknown>) => {
      const row = {
        id: `img-${state.images.length + 1}`,
        previewPath: null,
        providerRequestId: null,
        ...input,
        createdAt: new Date(),
      };
      state.images.push(row);
      return row;
    }),
    listImages: vi.fn(async (_u: string, runId: string) =>
      state.images.filter((i) => i.runId === runId).map((i) => ({ ...i })),
    ),
    trueUpRunCost: vi.fn(async (_u: string, runId: string, extraCostUsd = 0) => {
      const total =
        state.jobs.filter((j) => j.runId === runId).reduce((s, j) => s + (j.costUsd as number), 0) +
        extraCostUsd;
      const r = state.runs.get(runId);
      if (r && TERMINAL.includes(r.status as string)) r.costUsd = total;
      return total;
    }),
  };

  const fakeProjects = { getProject: vi.fn() };
  const fakeVehicles = { getPublishedDetail: vi.fn() };
  const fakeBriefs = { getBrief: vi.fn(), getBriefSnapshot: vi.fn() };
  const fakeStorage = {
    templatePublicUrl: (key: string) => `https://templates.test/${key}`,
    uploadAssetObject: vi.fn(
      async (key: string, data: Buffer | Uint8Array, contentType: string) => {
        state.uploads.push({ key, contentType, bytes: (data as Buffer).length });
        return key;
      },
    ),
    signedAssetReadUrl: vi.fn(async (key: string) => `https://signed.test/${key}`),
  };

  return {
    state,
    fakeGeneration,
    fakeProjects,
    fakeVehicles,
    fakeBriefs,
    fakeStorage,
    compileBriefMock: vi.fn(),
    compileIterationMock: vi.fn(),
    captureMock: vi.fn(),
    sentryCaptureMock: vi.fn(),
  };
});

vi.mock('@alphawolf/db', async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>();
  return {
    ...actual,
    // Pure helpers (uniqueViolationTarget for the F3 harvest convergence)
    // stay REAL; only the stateful repo functions are faked.
    generation: { ...actual.generation, ...h.fakeGeneration },
    projects: h.fakeProjects,
    vehicles: h.fakeVehicles,
    briefs: h.fakeBriefs,
    storage: h.fakeStorage,
  };
});
vi.mock('@/lib/ai/orchestrator', () => ({
  compileBrief: h.compileBriefMock,
  compileIteration: h.compileIterationMock,
}));
vi.mock('@/lib/notifications/posthog-server', () => ({ captureServerEvent: h.captureMock }));
vi.mock('@sentry/nextjs', () => ({ captureException: h.sentryCaptureMock }));

import { mockProvider } from '@/lib/ai/mock';
import { advanceRun, parseRunDirections, resolveRunViews, sortViews } from '@/lib/ai/run-pipeline';

const USER = 'user-1';
const realCheck = mockProvider.check.bind(mockProvider);

function seedRun(overrides: Record<string, unknown> = {}): string {
  const id = (overrides.id as string) ?? 'run-1';
  h.state.runs.set(id, {
    id,
    projectId: 'proj-1',
    userId: USER,
    kind: 'initial',
    status: 'queued',
    briefVersion: 1,
    parentRunId: null,
    conceptKey: null,
    instruction: null,
    directions: null,
    provider: 'mock',
    model: 'flux_depth_dev',
    costUsd: 0.12,
    error: null,
    clientToken: 'click-once-0001',
    deadlineAt: new Date(Date.now() + 15 * 60_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    completedAt: null,
    ...overrides,
  });
  return id;
}

function directionFixture(key: string, views: string[]) {
  return {
    key,
    title: `${key} title`,
    summary: `${key} summary`,
    viewPrompts: Object.fromEntries(views.map((v) => [v, `${key} wrap design for the ${v} view`])),
  };
}

async function advanceUntilTerminal(runId: string, max = 12) {
  let snapshot = null;
  for (let i = 0; i < max; i++) {
    snapshot = await advanceRun(USER, runId);
    if (!snapshot) throw new Error('run vanished');
    if (snapshot.status === 'complete' || snapshot.status === 'failed') return snapshot;
  }
  throw new Error(`run not terminal after ${max} advances (status ${snapshot?.status})`);
}

function events(): string[] {
  return h.captureMock.mock.calls.map((c) => c[0] as string);
}

beforeEach(() => {
  h.state.runs.clear();
  h.state.jobs.length = 0;
  h.state.images.length = 0;
  h.state.uploads.length = 0;
  h.state.refunds.length = 0;
  h.state.jobSeq = 0;
  vi.clearAllMocks();
  vi.restoreAllMocks();
  delete process.env.AI_PROVIDER;

  h.fakeProjects.getProject.mockResolvedValue({ id: 'proj-1', vehicleId: 'veh-1' });
  h.fakeVehicles.getPublishedDetail.mockResolvedValue({
    id: 'veh-1',
    year: 2024,
    make: 'Ford',
    model: 'Transit',
    bodyType: 'van',
    panels: [{ id: 'p1', view: 'driver', name: 'Driver side' }],
  });
  h.fakeBriefs.getBrief.mockResolvedValue({ id: 'brief-1', projectId: 'proj-1', data: {}, rev: 1 });
  h.fakeBriefs.getBriefSnapshot.mockResolvedValue({
    briefId: 'brief-1',
    version: 1,
    data: {},
    label: 'generation_run',
    createdAt: new Date(),
  });
  h.compileBriefMock.mockResolvedValue({
    directions: ['literal', 'bolder', 'minimal'].map((k) => directionFixture(k, ['driver'])),
    promptVersion: 'v1',
    usage: { inputTokens: 1000, outputTokens: 800, estimatedUsd: 0.005 },
  });
});

describe('advanceRun — happy path (initial, real mock renders)', () => {
  it('drives queued → orchestrating → rendering → complete across poll slices', async () => {
    const submitSpy = vi.spyOn(mockProvider, 'submit');
    const runId = seedRun();

    // Slice 1: orchestration.
    const s1 = await advanceRun(USER, runId);
    expect(s1?.status).toBe('rendering');
    expect(s1?.directions).toEqual([
      { key: 'literal', title: 'literal title', summary: 'literal summary' },
      { key: 'bolder', title: 'bolder title', summary: 'bolder summary' },
      { key: 'minimal', title: 'minimal title', summary: 'minimal summary' },
    ]);
    expect(s1?.jobs).toHaveLength(3); // 3 directions × 1 view
    expect(h.compileBriefMock).toHaveBeenCalledTimes(1);

    // Slice 2: submits — request ids persisted BEFORE any polling.
    const s2 = await advanceRun(USER, runId);
    expect(s2?.status).toBe('rendering');
    expect(submitSpy).toHaveBeenCalledTimes(3);
    for (const job of h.state.jobs) {
      expect(job.status).toBe('submitted');
      expect(job.providerRequestId).toMatch(/^mock-/);
    }
    // Conditioning image: the pre-generated public view render.
    expect(submitSpy.mock.calls[0]![0].imageUrls).toEqual([
      'https://templates.test/views/veh-1/driver.png',
    ]);

    // Slice 3: harvests + settles.
    const s3 = await advanceUntilTerminal(runId);
    expect(s3.status).toBe('complete');
    expect(s3.jobs.every((j) => j.status === 'complete')).toBe(true);
    expect(s3.images).toHaveLength(3);
    for (const img of s3.images ?? []) {
      expect(img.previewUrl).toContain('https://signed.test/generations/proj-1/run-1/');
      expect(img.previewUrl).toContain('-preview.png');
    }

    // Originals + watermarked previews stored, watermark preview is a PNG.
    const keys = h.state.uploads.map((u) => u.key);
    expect(keys).toContain('generations/proj-1/run-1/literal-driver.png');
    expect(keys).toContain('generations/proj-1/run-1/literal-driver-preview.png');
    expect(h.state.uploads).toHaveLength(6);

    // True-up: mock renders cost $0, orchestrator spend carried into the run.
    expect(h.fakeGeneration.trueUpRunCost).toHaveBeenCalledWith(USER, runId, 0.005);
    expect(h.state.runs.get(runId)!.costUsd).toBeCloseTo(0.005);
    expect(events()).toContain('generation_run_completed');
    expect(events()).not.toContain('generation_failed');

    // Provenance on the stored image rows.
    const img = h.state.images[0]!;
    expect(img.provenance).toMatchObject({
      provider: 'mock',
      model: 'fal-ai/flux-control-lora-depth',
      promptVersion: 'v1',
    });
  });

  it('never resubmits: extra polls after submit harvest by request id', async () => {
    const submitSpy = vi.spyOn(mockProvider, 'submit');
    const runId = seedRun();
    await advanceUntilTerminal(runId);
    // Extra polls on the terminal run change nothing.
    await advanceRun(USER, runId);
    await advanceRun(USER, runId);
    expect(submitSpy).toHaveBeenCalledTimes(3); // exactly one submit per job, ever
  });

  it('only ONE concurrent poll wins the orchestration CAS', async () => {
    const runId = seedRun();
    await Promise.all([advanceRun(USER, runId), advanceRun(USER, runId)]);
    expect(h.compileBriefMock).toHaveBeenCalledTimes(1);
  });

  it('CONCURRENT render slices never double-submit a job (F2 per-job claim)', async () => {
    // Deferred-promise provider: submits stay pending until the driver loop
    // below resolves them, so both slices overlap inside the submit window —
    // exactly the race the pending→submitting claim must win.
    const pendingSubmits: Array<() => void> = [];
    let n = 0;
    const submitSpy = vi.spyOn(mockProvider, 'submit').mockImplementation(
      () =>
        new Promise((resolve) => {
          n += 1;
          const requestId = `mock-race-${n}`;
          pendingSubmits.push(() => resolve({ requestId, estimatedCostUsd: 0 }));
        }),
    );

    const runId = seedRun();
    await advanceRun(USER, runId); // slice 1: orchestrate → 3 pending jobs

    let settled = false;
    const both = Promise.all([advanceRun(USER, runId), advanceRun(USER, runId)]).then((r) => {
      settled = true;
      return r;
    });
    // Drive the deferreds until both concurrent slices settle.
    while (!settled) {
      while (pendingSubmits.length > 0) pendingSubmits.shift()!();
      await new Promise((r) => setTimeout(r, 0));
    }
    await both;

    // EXACTLY one submit per job, ever — across both concurrent slices.
    expect(submitSpy).toHaveBeenCalledTimes(3);
    expect(h.state.jobs).toHaveLength(3);
    for (const job of h.state.jobs) {
      expect(job.status).toBe('submitted');
      expect(job.providerRequestId).toMatch(/^mock-race-/);
    }
    const ids = h.state.jobs.map((j) => j.providerRequestId);
    expect(new Set(ids).size).toBe(3); // no shared/duplicated submission
  });

  it('a DEFINITE submit rejection releases the claim and a later poll retries', async () => {
    const realSubmit = mockProvider.submit.bind(mockProvider);
    const submitSpy = vi
      .spyOn(mockProvider, 'submit')
      .mockRejectedValueOnce(new Error('422 prompt rejected by provider'))
      .mockImplementation(realSubmit);

    const runId = seedRun();
    const snapshot = await advanceUntilTerminal(runId);

    // The rejected job went submitting→pending and was re-claimed + submitted
    // on a later slice: one extra submit call, run still completes.
    expect(snapshot.status).toBe('complete');
    expect(submitSpy).toHaveBeenCalledTimes(4);
    expect(h.state.jobs.every((j) => j.status === 'complete')).toBe(true);
  });

  it('an AMBIGUOUS submit failure (timeout) fails the job — never re-claims', async () => {
    const realSubmit = mockProvider.submit.bind(mockProvider);
    const submitSpy = vi
      .spyOn(mockProvider, 'submit')
      .mockRejectedValueOnce(new Error('fetch failed: ETIMEDOUT'))
      .mockImplementation(realSubmit);

    const runId = seedRun();
    const snapshot = await advanceUntilTerminal(runId);

    // The submission may exist provider-side, so the job is failed instead of
    // released (a re-submit could double-spend) and the paid run refunds.
    expect(snapshot.status).toBe('failed');
    expect(submitSpy).toHaveBeenCalledTimes(3); // NO fourth (re-)submit
    const failedJob = h.state.jobs.find((j) => j.status === 'failed')!;
    expect(failedJob.error).toContain('submit ambiguous');
    expect(h.state.refunds).toContain(runId);
  });
});

describe('advanceRun — failure paths', () => {
  it('all jobs failed → run failed + credits refunded + loud telemetry', async () => {
    vi.spyOn(mockProvider, 'check').mockResolvedValue({
      status: 'failed',
      error: 'render exploded',
    });
    const runId = seedRun();
    const snapshot = await advanceUntilTerminal(runId);

    expect(snapshot.status).toBe('failed');
    expect(snapshot.jobs.every((j) => j.status === 'failed')).toBe(true);
    expect(h.state.refunds).toContain(runId);
    expect(events()).toContain('generation_failed');
    expect(h.sentryCaptureMock).toHaveBeenCalled();
    expect(h.state.runs.get(runId)!.error).toBe('all render jobs failed');
    // F7: the RAW error stays server-side; the snapshot carries friendly copy.
    expect(snapshot.error).not.toContain('render jobs failed');
    expect(snapshot.error).toMatch(/went wrong .* try again/i);
  });

  it('a PARTIAL failure also fails + refunds (no half-delivered paid run)', async () => {
    let firstFailedId: string | null = null;
    vi.spyOn(mockProvider, 'check').mockImplementation(async (modelKey, requestId) => {
      if (firstFailedId === null) firstFailedId = requestId;
      if (requestId === firstFailedId) return { status: 'failed', error: 'one bad render' };
      return realCheck(modelKey, requestId);
    });
    const runId = seedRun();
    const snapshot = await advanceUntilTerminal(runId);

    expect(snapshot.status).toBe('failed');
    expect(h.state.runs.get(runId)!.error).toBe('1 of 3 render jobs failed');
    expect(h.state.refunds).toContain(runId);
  });

  it('a run past its deadline fails + refunds WITHOUT touching the provider', async () => {
    const submitSpy = vi.spyOn(mockProvider, 'submit');
    const runId = seedRun({ deadlineAt: new Date(Date.now() - 1000) });
    const snapshot = await advanceRun(USER, runId);

    expect(snapshot?.status).toBe('failed');
    expect(h.state.refunds).toContain(runId);
    expect(submitSpy).not.toHaveBeenCalled();
    expect(events()).toContain('generation_failed');
    expect(h.state.runs.get(runId)!.error).toContain('deadline');
    // F7: timeout runs get the friendly "took longer than expected" copy.
    expect(snapshot?.error).toMatch(/took longer than expected/i);
    expect(snapshot?.error).not.toContain('deadline');
  });

  it('orchestrator failure fails + refunds instead of hanging the poll', async () => {
    h.compileBriefMock.mockRejectedValue(new Error('model output failed validation'));
    const runId = seedRun();
    const snapshot = await advanceRun(USER, runId);

    expect(snapshot?.status).toBe('failed');
    expect(h.state.refunds).toContain(runId);
    expect(events()).toContain('generation_failed');
  });

  it('returns null for an unknown run (RLS-invisible or missing)', async () => {
    expect(await advanceRun(USER, 'nope')).toBeNull();
  });
});

describe('advanceRun — iteration and final kinds', () => {
  function seedCompleteParent(views: string[]): string {
    const id = seedRun({
      id: 'parent-1',
      status: 'complete',
      directions: {
        promptVersion: 'v1',
        orchestratorCostUsd: 0.005,
        directions: ['literal', 'bolder', 'minimal'].map((k) => directionFixture(k, views)),
      },
      completedAt: new Date(),
    });
    return id;
  }

  it('iteration renders ONLY the affected views with the edit prompt', async () => {
    const parentId = seedCompleteParent(['front', 'driver']);
    h.compileIterationMock.mockResolvedValue({
      affectedViews: ['front'],
      editPrompt: 'change the hood to matte black, keep everything else exactly the same',
      title: 'Matte black hood',
      promptVersion: 'v1',
      usage: { inputTokens: 500, outputTokens: 200, estimatedUsd: 0.002 },
    });
    const runId = seedRun({
      id: 'iter-1',
      kind: 'iteration',
      parentRunId: parentId,
      conceptKey: 'bolder',
      instruction: 'matte black hood',
      model: 'kontext_dev',
    });

    const snapshot = await advanceUntilTerminal(runId);
    expect(snapshot.status).toBe('complete');
    expect(snapshot.jobs).toEqual([{ conceptKey: 'bolder', view: 'front', status: 'complete' }]);
    expect(h.compileIterationMock).toHaveBeenCalledWith(
      expect.objectContaining({ instruction: 'matte black hood', views: ['front', 'driver'] }),
    );
    // Carried-forward prompt map covers EVERY view (edited one updated).
    const dirs = parseRunDirections(h.state.runs.get(runId)!.directions);
    expect(dirs?.directions[0]?.viewPrompts).toEqual({
      front: 'change the hood to matte black, keep everything else exactly the same',
      driver: 'bolder wrap design for the driver view',
    });
  });

  it('final re-renders every view of the chosen concept, unwatermarked', async () => {
    const parentId = seedCompleteParent(['front', 'driver']);
    const runId = seedRun({
      id: 'final-1',
      kind: 'final',
      parentRunId: parentId,
      conceptKey: 'minimal',
      model: 'flux2_pro_edit',
    });

    const snapshot = await advanceUntilTerminal(runId);
    expect(snapshot.status).toBe('complete');
    expect(snapshot.jobs.map((j) => j.view).sort()).toEqual(['driver', 'front']);
    expect(h.compileBriefMock).not.toHaveBeenCalled();
    expect(h.compileIterationMock).not.toHaveBeenCalled();

    // NO watermark on finals: preview IS the original, no -preview.png upload.
    const finalImages = h.state.images.filter((i) => i.runId === runId);
    expect(finalImages).toHaveLength(2);
    for (const img of finalImages) {
      expect(img.previewPath).toBe(img.storagePath);
      expect(String(img.storagePath)).not.toContain('-preview');
    }
    expect(h.state.uploads.filter((u) => u.key.includes('-preview'))).toHaveLength(0);
  });
});

describe('view resolution helpers', () => {
  const panels = [
    { id: 'p1', view: 'front', name: 'Hood' },
    { id: 'p2', view: 'driver', name: 'Driver door' },
    { id: 'p3', view: 'driver', name: 'Driver quarter' },
    { id: 'p4', view: 'back', name: 'Tailgate' },
  ];

  it('full wrap → every template view, canonical order', () => {
    expect(resolveRunViews(panels, {})).toEqual(['front', 'driver', 'back']);
    expect(resolveRunViews(panels, null)).toEqual(['front', 'driver', 'back']);
  });

  it('partial wrap → only views containing an INCLUDED panel', () => {
    expect(resolveRunViews(panels, { zones: { includedPanelIds: ['p2', 'p3'] } })).toEqual([
      'driver',
    ]);
  });

  it('sortViews follows the shared VIEW_ORDER, unknowns last', () => {
    expect(sortViews(['top', 'back', 'front', 'mystery'])).toEqual([
      'front',
      'back',
      'top',
      'mystery',
    ]);
  });
});
