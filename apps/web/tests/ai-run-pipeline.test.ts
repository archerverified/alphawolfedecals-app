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
        jobs: Array<{
          conceptKey: string;
          view: string;
          prompt?: string;
          renderTarget?: 'template' | 'photo';
        }>,
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
            // T1 default mirrors the real repo (recordJobs defaults to 'template').
            renderTarget: j.renderTarget ?? 'template',
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

  const fakeProjects = { getProject: vi.fn(), getAsset: vi.fn() };
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
import {
  advanceRun,
  anchorViewFor,
  coherenceDirective,
  parseRunDirections,
  resolveRunViews,
  sortViews,
} from '@/lib/ai/run-pipeline';

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
  // Default: no uploaded vehicle photo (resolveCustomerPhotoKey returns null).
  // Photo-path tests override getBriefSnapshot (photos) + getAsset per case.
  h.fakeProjects.getAsset.mockResolvedValue(null);
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

describe('cross-view coherence (Goal 17) — anchor-then-derive + approved-draft conditioning', () => {
  const MV = ['front', 'driver', 'back']; // anchor resolves to 'driver'

  function multiViewVehicle(views: string[]) {
    return {
      id: 'veh-1',
      year: 2024,
      make: 'BMW',
      model: 'X3',
      bodyType: 'suv',
      panels: views.map((v, i) => ({ id: `p${i}`, view: v, name: `${v} panel` })),
    };
  }

  function submitsByView(spy: { mock: { calls: unknown[][] } }) {
    // The conditioning structure image is always views/veh-1/<view>.png at imageUrls[0].
    const out: Record<string, { imageUrls: string[]; prompt: string; seed?: number }> = {};
    for (const call of spy.mock.calls) {
      const req = call[0] as { imageUrls?: string[]; prompt: string; seed?: number };
      const first = req.imageUrls?.[0] ?? '';
      const m = first.match(/views\/veh-1\/(\w+)\.png/);
      if (m) out[m[1]!] = { imageUrls: req.imageUrls ?? [], prompt: req.prompt, seed: req.seed };
    }
    return out;
  }

  it('initial: anchor (driver) renders alone; derived views condition on [structure, signed(anchor)] + share one seed', async () => {
    h.fakeVehicles.getPublishedDetail.mockResolvedValue(multiViewVehicle(MV));
    h.compileBriefMock.mockResolvedValue({
      directions: [directionFixture('literal', MV)],
      promptVersion: 'v4',
      usage: { inputTokens: 1000, outputTokens: 800, estimatedUsd: 0.005 },
    });
    const submitSpy = vi.spyOn(mockProvider, 'submit');
    const runId = seedRun({ model: 'nano_banana_edit' });

    const snapshot = await advanceUntilTerminal(runId, 20);
    expect(snapshot.status).toBe('complete');

    const byView = submitsByView(submitSpy);
    // Anchor (driver) — structure-only conditioning, no coherence directive.
    expect(byView.driver!.imageUrls).toEqual(['https://templates.test/views/veh-1/driver.png']);
    expect(byView.driver!.prompt).not.toContain('COHERENCE');
    // Derived views — [own structure, signed(anchor render)] + coherence directive.
    for (const v of ['front', 'back']) {
      expect(byView[v]!.imageUrls).toEqual([
        `https://templates.test/views/veh-1/${v}.png`,
        'https://signed.test/generations/proj-1/run-1/literal-driver.png',
      ]);
      expect(byView[v]!.prompt).toContain('COHERENCE');
    }
    // Shared per-concept seed: every view of the concept rendered from one seed.
    const seeds = new Set(Object.values(byView).map((s) => s.seed));
    expect(seeds.size).toBe(1);
  });

  it('initial: anchor failure cascade-fails the concept derived views — never submits them, run refunds', async () => {
    h.fakeVehicles.getPublishedDetail.mockResolvedValue(multiViewVehicle(MV));
    h.compileBriefMock.mockResolvedValue({
      directions: [directionFixture('literal', MV)],
      promptVersion: 'v4',
      usage: { inputTokens: 1000, outputTokens: 800, estimatedUsd: 0.005 },
    });
    // The anchor (driver) render fails at the provider; derived views must never submit.
    vi.spyOn(mockProvider, 'check').mockImplementation(async (modelKey, requestId) => {
      const req = h.state.jobs.find((j) => j.providerRequestId === requestId);
      if (req?.view === 'driver') return { status: 'failed', error: 'anchor render exploded' };
      return realCheck(modelKey, requestId);
    });
    const submitSpy = vi.spyOn(mockProvider, 'submit');
    const runId = seedRun({ model: 'nano_banana_edit' });

    const snapshot = await advanceUntilTerminal(runId, 20);
    expect(snapshot.status).toBe('failed');
    expect(h.state.refunds).toContain(runId);
    // ONLY the anchor was ever submitted; derived views were cascade-failed pre-submit.
    const submittedViews = submitSpy.mock.calls
      .map((c) => (c[0] as { imageUrls?: string[] }).imageUrls?.[0] ?? '')
      .map((u) => u.match(/views\/veh-1\/(\w+)\.png/)?.[1])
      .filter(Boolean);
    expect(submittedViews).toEqual(['driver']);
  });

  it('final: each view conditions on [structure, signed(APPROVED-DRAFT render)] + coherence — closes the draft→final gap', async () => {
    const parentId = seedRun({
      id: 'parent-1',
      status: 'complete',
      kind: 'initial',
      directions: {
        promptVersion: 'v4',
        orchestratorCostUsd: 0.005,
        directions: [directionFixture('literal', MV)],
      },
      completedAt: new Date(),
    });
    // The customer-approved draft renders live on the parent run.
    MV.forEach((v, i) =>
      h.state.images.push({
        id: `pimg-${i}`,
        runId: parentId,
        jobId: `pj-${i}`,
        conceptKey: 'literal',
        view: v,
        storagePath: `generations/proj-1/parent-1/literal-${v}.png`,
        previewPath: null,
        width: 1024,
        height: 768,
        provider: 'mock',
        model: 'nano_banana_edit',
        costUsd: 0,
        provenance: {},
        createdAt: new Date(),
      }),
    );
    h.fakeVehicles.getPublishedDetail.mockResolvedValue(multiViewVehicle(MV));
    const submitSpy = vi.spyOn(mockProvider, 'submit');
    const runId = seedRun({
      id: 'final-1',
      kind: 'final',
      parentRunId: parentId,
      conceptKey: 'literal',
      model: 'flux2_pro_edit',
    });

    const snapshot = await advanceUntilTerminal(runId, 20);
    expect(snapshot.status).toBe('complete');

    const byView = submitsByView(submitSpy);
    for (const v of MV) {
      expect(byView[v]!.imageUrls).toEqual([
        `https://templates.test/views/veh-1/${v}.png`,
        `https://signed.test/generations/proj-1/parent-1/literal-${v}.png`,
      ]);
      expect(byView[v]!.prompt).toContain('COHERENCE');
    }
  });

  it('final (Goal 18): a directional-gradient concept adds the gradient GUIDE as a 3rd conditioning image + DIRECTION LOCK', async () => {
    // Vehicle panels carry real svgPaths so the guide builder can derive the
    // image-space front→rear axis (driver: front on the RIGHT, rear on the LEFT).
    const geoVehicle = {
      id: 'veh-1',
      year: 2024,
      make: 'BMW',
      model: 'X3',
      bodyType: 'suv',
      panels: [
        {
          id: 'pf',
          view: 'front',
          name: 'Hood Front',
          svgPath: 'M100 100 L900 100 L900 500 L100 500 Z',
        },
        {
          id: 'pd1',
          view: 'driver',
          name: 'Rear Quarter',
          svgPath: 'M706 190 L830 185 L830 345 L706 345 Z',
        },
        {
          id: 'pd2',
          view: 'driver',
          name: 'Front Door',
          svgPath: 'M995 182 L1345 185 L1345 340 L995 340 Z',
        },
        {
          id: 'pd3',
          view: 'driver',
          name: 'Nose & Front Bumper',
          svgPath: 'M1490 195 L1700 215 L1700 350 L1490 340 Z',
        },
        {
          id: 'pb',
          view: 'back',
          name: 'Tailgate',
          svgPath: 'M100 100 L900 100 L900 500 L100 500 Z',
        },
      ],
    };
    const conceptWithGradient = {
      ...directionFixture('literal', MV),
      gradient: { directional: true, frontHex: '#000000', rearHex: '#00AEEF' },
    };
    const parentId = seedRun({
      id: 'parent-1',
      status: 'complete',
      kind: 'initial',
      directions: {
        promptVersion: 'v5',
        orchestratorCostUsd: 0.005,
        directions: [conceptWithGradient],
      },
      completedAt: new Date(),
    });
    MV.forEach((v, i) =>
      h.state.images.push({
        id: `pimg-${i}`,
        runId: parentId,
        jobId: `pj-${i}`,
        conceptKey: 'literal',
        view: v,
        storagePath: `generations/proj-1/parent-1/literal-${v}.png`,
        previewPath: null,
        width: 1024,
        height: 768,
        provider: 'mock',
        model: 'nano_banana_edit',
        costUsd: 0,
        provenance: {},
        createdAt: new Date(),
      }),
    );
    h.fakeVehicles.getPublishedDetail.mockResolvedValue(geoVehicle);
    const submitSpy = vi.spyOn(mockProvider, 'submit');
    const runId = seedRun({
      id: 'final-1',
      kind: 'final',
      parentRunId: parentId,
      conceptKey: 'literal',
      model: 'flux2_pro_edit',
    });

    const snapshot = await advanceUntilTerminal(runId, 20);
    expect(snapshot.status).toBe('complete');

    const byView = submitsByView(submitSpy);
    // Driver view: [structure, approved-draft donor, gradient guide] + DIRECTION LOCK.
    expect(byView.driver!.imageUrls).toEqual([
      'https://templates.test/views/veh-1/driver.png',
      'https://signed.test/generations/proj-1/parent-1/literal-driver.png',
      'https://signed.test/generations/proj-1/final-1/_guide-literal-driver.png',
    ]);
    expect(byView.driver!.prompt).toContain('DIRECTION LOCK');
    expect(byView.driver!.prompt).not.toContain('COHERENCE');
    // A real guide PNG was built + uploaded for every view under the run prefix.
    const guideUploads = h.state.uploads.filter((u) => u.key.includes('/_guide-literal-'));
    expect(guideUploads.map((u) => u.key).sort()).toEqual([
      'generations/proj-1/final-1/_guide-literal-back.png',
      'generations/proj-1/final-1/_guide-literal-driver.png',
      'generations/proj-1/final-1/_guide-literal-front.png',
    ]);
    expect(guideUploads.every((u) => u.contentType === 'image/png' && u.bytes > 0)).toBe(true);
  });

  it('a transient signed-URL failure on a derived view never strands the job — a later slice retries to completion', async () => {
    h.fakeVehicles.getPublishedDetail.mockResolvedValue(multiViewVehicle(MV));
    h.compileBriefMock.mockResolvedValue({
      directions: [directionFixture('literal', MV)],
      promptVersion: 'v4',
      usage: { inputTokens: 1000, outputTokens: 800, estimatedUsd: 0.005 },
    });
    // Fail the FIRST anchor-donor CONDITIONING sign (a non-preview key) once.
    // signedAssetReadUrl is also used for preview URLs (buildSnapshot swallows
    // those), so target the conditioning path specifically. Conditioning is
    // resolved BEFORE claimJob, so the job stays 'pending' (never stuck
    // 'submitting') and a later slice retries cleanly — the run still completes.
    let injected = false;
    h.fakeStorage.signedAssetReadUrl.mockImplementation(async (key: string) => {
      if (!injected && !key.includes('-preview') && key.includes('-driver')) {
        injected = true;
        throw new Error('transient storage error');
      }
      return `https://signed.test/${key}`;
    });
    const runId = seedRun({ model: 'nano_banana_edit' });

    const snapshot = await advanceUntilTerminal(runId, 24);
    expect(snapshot.status).toBe('complete');
    expect(h.state.jobs.every((j) => j.status === 'complete')).toBe(true);
    expect(injected).toBe(true); // the failure path was actually exercised
    // Restore the default impl (mockImplementation persists past clearAllMocks).
    h.fakeStorage.signedAssetReadUrl.mockImplementation(
      async (key: string) => `https://signed.test/${key}`,
    );
  });

  it('final: a missing lineage donor falls back to structure-only AND emits final_donor_missing', async () => {
    const parentId = seedRun({
      id: 'parent-1',
      status: 'complete',
      kind: 'initial',
      directions: {
        promptVersion: 'v4',
        orchestratorCostUsd: 0.005,
        directions: [directionFixture('literal', MV)],
      },
      completedAt: new Date(),
    });
    // Only front + driver have approved draft renders; 'back' has none → its final
    // view must degrade to structure-only, but that degradation must be OBSERVABLE.
    ['front', 'driver'].forEach((v, i) =>
      h.state.images.push({
        id: `pimg-${i}`,
        runId: parentId,
        jobId: `pj-${i}`,
        conceptKey: 'literal',
        view: v,
        storagePath: `generations/proj-1/parent-1/literal-${v}.png`,
        previewPath: null,
        width: 1024,
        height: 768,
        provider: 'mock',
        model: 'nano_banana_edit',
        costUsd: 0,
        provenance: {},
        createdAt: new Date(),
      }),
    );
    h.fakeVehicles.getPublishedDetail.mockResolvedValue(multiViewVehicle(MV));
    const submitSpy = vi.spyOn(mockProvider, 'submit');
    const runId = seedRun({
      id: 'final-1',
      kind: 'final',
      parentRunId: parentId,
      conceptKey: 'literal',
      model: 'flux2_pro_edit',
    });

    const snapshot = await advanceUntilTerminal(runId, 20);
    expect(snapshot.status).toBe('complete');
    const byView = submitsByView(submitSpy);
    // 'back' has no donor → structure-only fallback.
    expect(byView.back!.imageUrls).toEqual(['https://templates.test/views/veh-1/back.png']);
    // front/driver have donors → two-image conditioning.
    expect(byView.front!.imageUrls).toHaveLength(2);
    // The degraded export view is observable.
    expect(events()).toContain('final_donor_missing');
  });
});

describe('on-photo concept renders (Goal 21 T3): isolated from the coherence path', () => {
  const PHOTO_KEY = 'project-assets/proj-1/photo-1.jpg';

  // A brief snapshot whose data carries one uploaded vehicle photo, and the
  // owned asset row that resolveCustomerPhotoKey maps it to.
  function withPhotoBrief() {
    h.fakeBriefs.getBriefSnapshot.mockResolvedValue({
      briefId: 'brief-1',
      version: 1,
      data: { photos: [{ assetId: '11111111-1111-1111-1111-111111111111' }] },
      label: 'generation_run',
      createdAt: new Date(),
    });
    h.fakeProjects.getAsset.mockResolvedValue({
      assetId: '11111111-1111-1111-1111-111111111111',
      projectId: 'proj-1',
      mimeType: 'image/jpeg',
      sourceUrl: PHOTO_KEY,
      parsedUrl: null,
    });
  }

  // Photo submits are NOT matched by submitsByView (their imageUrls[0] is the
  // signed photo URL, not a template view), so match them by the photo model.
  function photoSubmits(spy: { mock: { calls: unknown[][] } }) {
    return spy.mock.calls
      .map((c) => c[0] as { modelKey: string; imageUrls?: string[]; prompt: string })
      .filter((req) => req.modelKey === 'nano_banana_edit');
  }

  it('initial WITH a photo: template jobs PLUS 3 photo jobs (view=photo, renderTarget=photo)', async () => {
    withPhotoBrief();
    const runId = seedRun();
    const s1 = await advanceRun(USER, runId);
    expect(s1?.status).toBe('rendering');

    // 3 template jobs (3 directions × 1 view) + 3 photo jobs (one per direction).
    const tmpl = h.state.jobs.filter((j) => j.renderTarget === 'template');
    const photo = h.state.jobs.filter((j) => j.renderTarget === 'photo');
    expect(tmpl).toHaveLength(3);
    expect(photo).toHaveLength(3);
    for (const j of photo) {
      expect(j.view).toBe('photo');
      expect(j.conceptKey).toMatch(/^(literal|bolder|minimal)$/);
    }
    // Distinct concepts, one photo job each.
    expect(new Set(photo.map((j) => j.conceptKey)).size).toBe(3);
  });

  it('initial WITHOUT a photo: only template jobs (no photo fan-out)', async () => {
    // Default getAsset → null, default snapshot has no photos.
    const runId = seedRun();
    await advanceRun(USER, runId);
    expect(h.state.jobs.every((j) => j.renderTarget === 'template')).toBe(true);
    expect(h.state.jobs.filter((j) => j.view === 'photo')).toHaveLength(0);
    expect(h.state.jobs).toHaveLength(3);
  });

  it('final WITH a photo: adds exactly ONE photo job for the chosen concept', async () => {
    withPhotoBrief();
    const parentId = seedRun({
      id: 'parent-1',
      status: 'complete',
      directions: {
        promptVersion: 'v1',
        orchestratorCostUsd: 0.005,
        directions: ['literal', 'bolder', 'minimal'].map((k) => directionFixture(k, ['driver'])),
      },
      completedAt: new Date(),
    });
    const runId = seedRun({
      id: 'final-1',
      kind: 'final',
      parentRunId: parentId,
      conceptKey: 'minimal',
      model: 'flux2_pro_edit',
    });
    await advanceRun(USER, runId);

    const photo = h.state.jobs.filter((j) => j.runId === runId && j.renderTarget === 'photo');
    expect(photo).toHaveLength(1);
    expect(photo[0]!.view).toBe('photo');
    expect(photo[0]!.conceptKey).toBe('minimal');
  });

  it('final WITHOUT a photo: no photo job', async () => {
    const parentId = seedRun({
      id: 'parent-1',
      status: 'complete',
      directions: {
        promptVersion: 'v1',
        orchestratorCostUsd: 0.005,
        directions: ['literal', 'bolder', 'minimal'].map((k) => directionFixture(k, ['driver'])),
      },
      completedAt: new Date(),
    });
    const runId = seedRun({
      id: 'final-1',
      kind: 'final',
      parentRunId: parentId,
      conceptKey: 'minimal',
      model: 'flux2_pro_edit',
    });
    await advanceRun(USER, runId);
    expect(h.state.jobs.filter((j) => j.runId === runId && j.view === 'photo')).toHaveLength(0);
  });

  it('iteration: NEVER fans out a photo job (out of scope)', async () => {
    withPhotoBrief();
    const parentId = seedRun({
      id: 'parent-1',
      status: 'complete',
      directions: {
        promptVersion: 'v1',
        orchestratorCostUsd: 0.005,
        directions: ['literal', 'bolder', 'minimal'].map((k) =>
          directionFixture(k, ['front', 'driver']),
        ),
      },
      completedAt: new Date(),
    });
    h.compileIterationMock.mockResolvedValue({
      affectedViews: ['front'],
      editPrompt: 'change the hood to matte black, keep everything else the same',
      title: 'Matte hood',
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
    await advanceRun(USER, runId);
    expect(h.state.jobs.filter((j) => j.runId === runId && j.view === 'photo')).toHaveLength(0);
  });

  it('partition: a view=photo job never becomes the anchor and never gates a template job; template jobs still condition imageUrls[0] on the template view', async () => {
    const MV = ['front', 'driver', 'back']; // anchor resolves to 'driver'
    withPhotoBrief();
    h.fakeVehicles.getPublishedDetail.mockResolvedValue({
      id: 'veh-1',
      year: 2024,
      make: 'BMW',
      model: 'X3',
      bodyType: 'suv',
      panels: MV.map((v, i) => ({ id: `p${i}`, view: v, name: `${v} panel` })),
    });
    h.compileBriefMock.mockResolvedValue({
      directions: [directionFixture('literal', MV)],
      promptVersion: 'v4',
      usage: { inputTokens: 1000, outputTokens: 800, estimatedUsd: 0.005 },
    });
    const submitSpy = vi.spyOn(mockProvider, 'submit');
    const runId = seedRun({ model: 'nano_banana_edit' });

    const snapshot = await advanceUntilTerminal(runId, 24);
    expect(snapshot.status).toBe('complete');

    // The anchor (driver) only ever conditions on its own template structure
    // render, so a photo render never leaks into the anchor donor slot.
    const tmplSubmits = submitSpy.mock.calls
      .map((c) => c[0] as { imageUrls?: string[] })
      .map((r) => r.imageUrls?.[0] ?? '');
    const driverCall = tmplSubmits.find((u) => u.includes('views/veh-1/driver.png'));
    expect(driverCall).toBe('https://templates.test/views/veh-1/driver.png');

    // No template submit ever conditions on a photo render (filename has -photo).
    for (const call of submitSpy.mock.calls) {
      const req = call[0] as { imageUrls?: string[] };
      const isPhotoConditioned = (req.imageUrls ?? []).some((u) => u.includes('-photo'));
      // Photo jobs DO use the photo as imageUrls[0]; template anchor/derived
      // never reference a photo render as a coherence donor.
      if (isPhotoConditioned) {
        expect((req as { imageUrls?: string[] }).imageUrls![0]).toContain(PHOTO_KEY);
      }
    }

    // Derived template views (front/back) condition on the DRIVER anchor render,
    // never on a photo render: coherence machinery saw template jobs only.
    const derived = submitSpy.mock.calls
      .map((c) => c[0] as { imageUrls?: string[] })
      .filter((r) => (r.imageUrls?.length ?? 0) === 2)
      .filter((r) => /views\/veh-1\/(front|back)\.png/.test(r.imageUrls![0]!));
    expect(derived.length).toBe(2);
    for (const r of derived) {
      expect(r.imageUrls![1]).toBe(
        'https://signed.test/generations/proj-1/run-1/literal-driver.png',
      );
    }

    // All 4 image rows present: 3 template views + 1 photo. The photo image
    // carries view='photo' and render_target='photo'.
    const imgs = h.state.images.filter((i) => i.runId === runId);
    const photoImgs = imgs.filter((i) => i.renderTarget === 'photo');
    expect(photoImgs).toHaveLength(1);
    expect(photoImgs[0]!.view).toBe('photo');
    expect(imgs.filter((i) => i.renderTarget === 'template')).toHaveLength(3);
  });

  it('a photo job submits with imageUrls=[signed photo url] + the photo model, harvests render_target=photo, watermarked on a non-final run', async () => {
    withPhotoBrief();
    const submitSpy = vi.spyOn(mockProvider, 'submit');
    const runId = seedRun(); // initial, model flux_depth_dev; photo jobs use the photo model

    const snapshot = await advanceUntilTerminal(runId, 24);
    expect(snapshot.status).toBe('complete');

    const photoCalls = photoSubmits(submitSpy);
    expect(photoCalls).toHaveLength(3);
    for (const req of photoCalls) {
      // Conditioned on the customer's signed photo URL, nothing else.
      expect(req.imageUrls).toEqual([`https://signed.test/${PHOTO_KEY}`]);
      // The on-photo prompt, not a template view prompt.
      expect(req.prompt).toContain('supplied photo');
    }

    // Harvested photo images: render_target='photo', the photo model + its fal id.
    const photoImgs = h.state.images.filter((i) => i.runId === runId && i.renderTarget === 'photo');
    expect(photoImgs).toHaveLength(3);
    for (const img of photoImgs) {
      expect(img.view).toBe('photo');
      expect(img.model).toBe('nano_banana_edit');
      expect((img.provenance as { model?: string }).model).toBe('fal-ai/nano-banana/edit');
      // Watermarked preview on a non-final (initial) run.
      expect(String(img.previewPath)).toContain('-preview.png');
      expect(img.previewPath).not.toBe(img.storagePath);
    }
    // Photo originals + watermark previews stored under <concept>-photo.
    const keys = h.state.uploads.map((u) => u.key);
    expect(keys).toContain('generations/proj-1/run-1/literal-photo.png');
    expect(keys).toContain('generations/proj-1/run-1/literal-photo-preview.png');

    // Template images keep render_target='template' + the RUN model.
    const tmplImgs = h.state.images.filter(
      (i) => i.runId === runId && i.renderTarget === 'template',
    );
    expect(tmplImgs).toHaveLength(3);
    for (const img of tmplImgs) expect(img.model).toBe('flux_depth_dev');
  });

  it('final photo render is NOT watermarked (paid artwork, preview IS the image)', async () => {
    withPhotoBrief();
    const parentId = seedRun({
      id: 'parent-1',
      status: 'complete',
      directions: {
        promptVersion: 'v1',
        orchestratorCostUsd: 0.005,
        directions: [directionFixture('minimal', ['driver'])],
      },
      completedAt: new Date(),
    });
    const runId = seedRun({
      id: 'final-1',
      kind: 'final',
      parentRunId: parentId,
      conceptKey: 'minimal',
      model: 'flux2_pro_edit',
    });

    const snapshot = await advanceUntilTerminal(runId, 24);
    expect(snapshot.status).toBe('complete');

    const photoImg = h.state.images.find((i) => i.runId === runId && i.renderTarget === 'photo')!;
    expect(photoImg.view).toBe('photo');
    expect(photoImg.previewPath).toBe(photoImg.storagePath);
    expect(String(photoImg.storagePath)).not.toContain('-preview');
    expect(h.state.uploads.filter((u) => u.key.includes('photo-preview'))).toHaveLength(0);
  });

  it('a transient photo-key resolve failure never fails the photo job: a later slice retries to completion', async () => {
    withPhotoBrief();
    // Let orchestrate's resolution succeed (call 1, the fan-out), then throw
    // ONCE on a render-slice resolution, then recover. The photo job must stay
    // open (not failed) and the run must still complete.
    const presentAsset = {
      assetId: '11111111-1111-1111-1111-111111111111',
      projectId: 'proj-1',
      mimeType: 'image/jpeg',
      sourceUrl: PHOTO_KEY,
      parsedUrl: null,
    };
    let calls = 0;
    let injected = false;
    h.fakeProjects.getAsset.mockImplementation(async () => {
      calls += 1;
      if (calls === 2) {
        injected = true;
        throw new Error('transient asset read error');
      }
      return presentAsset;
    });
    const runId = seedRun();
    const snapshot = await advanceUntilTerminal(runId, 24);
    expect(injected).toBe(true); // the transient path was exercised
    expect(snapshot.status).toBe('complete');
    expect(h.state.jobs.every((j) => j.status === 'complete')).toBe(true);
    // A real photo image was harvested (the job was never wrongly failed).
    expect(h.state.images.some((i) => i.runId === runId && i.renderTarget === 'photo')).toBe(true);
  });

  it('a photo deleted mid-run (clean null at render time) fails only the photo job and refunds the run', async () => {
    withPhotoBrief();
    // The photo exists at ORCHESTRATE (so a photo job is created) but is gone by
    // the time the render slice resolves the key (clean null). The defensive
    // guard fails just the photo job; settle then refunds the run.
    const presentAsset = {
      assetId: '11111111-1111-1111-1111-111111111111',
      projectId: 'proj-1',
      mimeType: 'image/jpeg',
      sourceUrl: PHOTO_KEY,
      parsedUrl: null,
    };
    let calls = 0;
    h.fakeProjects.getAsset.mockImplementation(async () => {
      calls += 1;
      return calls === 1 ? presentAsset : null; // present at orchestrate, gone at render
    });
    const runId = seedRun();
    const snapshot = await advanceUntilTerminal(runId, 24);
    // The photo job was created (1) then failed (clean null at render time) → the
    // run cannot fully complete, so settle fails + refunds it.
    expect(snapshot.status).toBe('failed');
    const photoJob = h.state.jobs.find((j) => j.view === 'photo')!;
    expect(photoJob.status).toBe('failed');
    expect(String(photoJob.error)).toContain('no longer available');
    expect(h.state.refunds).toContain(runId);
  });

  it('settle: the run completes only AFTER both template and photo jobs are complete', async () => {
    withPhotoBrief();
    // Hold the photo job pending at the provider until the driver loop releases
    // it: while it is open, the run must NOT settle complete.
    let releasePhoto: (() => void) | null = null;
    const realCheckBound = mockProvider.check.bind(mockProvider);
    vi.spyOn(mockProvider, 'check').mockImplementation(async (modelKey, requestId) => {
      const job = h.state.jobs.find((j) => j.providerRequestId === requestId);
      if (job?.view === 'photo' && releasePhoto !== null) {
        return { status: 'pending' as const };
      }
      return realCheckBound(modelKey, requestId);
    });
    releasePhoto = () => {};

    const runId = seedRun();
    // Drive a few slices: template jobs complete, photo stays pending → run open.
    for (let i = 0; i < 6; i++) {
      const snap = await advanceRun(USER, runId);
      if (snap?.status !== 'rendering') break;
    }
    const mid = h.state.runs.get(runId)!;
    expect(mid.status).toBe('rendering'); // photo not done → run not settled
    const photoJob = h.state.jobs.find((j) => j.view === 'photo')!;
    expect(photoJob.status).not.toBe('complete');

    // Release the photo: now harvest completes it and the run settles.
    releasePhoto = null;
    const snapshot = await advanceUntilTerminal(runId, 24);
    expect(snapshot.status).toBe('complete');
    expect(h.state.jobs.every((j) => j.status === 'complete')).toBe(true);
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

describe('anchorViewFor — the canonical view every other view derives from', () => {
  it('prefers a side view (driver) — the largest canvas showing the full front→rear design', () => {
    expect(anchorViewFor(['front', 'driver', 'back', 'passenger'])).toBe('driver');
  });

  it('falls back to passenger when driver is absent (still a full-length side)', () => {
    expect(anchorViewFor(['front', 'back', 'passenger', 'top'])).toBe('passenger');
  });

  it('falls back through front, then back, then top by preference', () => {
    expect(anchorViewFor(['front', 'back', 'top'])).toBe('front');
    expect(anchorViewFor(['back', 'top'])).toBe('back');
    expect(anchorViewFor(['top'])).toBe('top');
  });

  it('returns the first given view when none match the preference list', () => {
    expect(anchorViewFor(['mystery', 'front'])).toBe('front');
    expect(anchorViewFor(['mystery'])).toBe('mystery');
  });
});

describe('coherenceDirective — anchors a derived/final view to one shared design via the reference image', () => {
  it('draft (fusion model): keep THIS view geometry, adopt ONLY colour/gradient/finish from the reference', () => {
    const d = coherenceDirective('initial');
    expect(d).toMatch(/reference/i);
    expect(d).toMatch(/colou?r|gradient|finish/i);
    // It must forbid geometry/camera contamination — the nano-banana fusion risk.
    expect(d).toMatch(/keep|same|exact|preserve/i);
    expect(d).toMatch(/geometry|shape|angle|panel|camera/i);
  });

  it('final (reference-edit model): reproduce the approved design at export quality, preserve geometry', () => {
    const d = coherenceDirective('final');
    expect(d).toMatch(/approved|reference|image\s*2|@image2/i);
    expect(d).toMatch(/export|quality|premium|high/i);
    expect(d).toMatch(/geometry|composition|panel|shape|camera/i);
  });

  it('never reintroduces text/logos (the composited-logo invariant)', () => {
    expect(coherenceDirective('initial')).toMatch(/no text|never.*text|without.*text|no logos?/i);
    expect(coherenceDirective('final')).toMatch(/no text|never.*text|without.*text|no logos?/i);
  });
});
