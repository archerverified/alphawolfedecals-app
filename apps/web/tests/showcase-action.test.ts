// Goal 21 T8 — Owner-path unit tests for buildShowcaseAction.
//
// Closes the Task 6 reviewer's deferred owner-path coverage.
// All offline: deps are mocked (guard, @alphawolf/db repos, sharp compositor).
//
// Mocking pattern: matches generation-actions.test.ts
// (vi.hoisted + vi.mock before imports).

import { beforeEach, describe, expect, it, vi } from 'vitest';

import type * as DbModule from '@alphawolf/db';

// ---------------------------------------------------------------------------
// Hoisted mock state
// ---------------------------------------------------------------------------

const h = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  getProjectMock: vi.fn(),
  listRunsForProjectMock: vi.fn(),
  getBriefMock: vi.fn(),
  getPublishedDetailMock: vi.fn(),
  getAssetMock: vi.fn(),
  downloadAssetObjectMock: vi.fn(),
  uploadAssetObjectMock: vi.fn(),
  signedAssetReadUrlMock: vi.fn(),
  // Showcase compositor: avoid heavy sharp work on the happy path.
  composeShowcaseMock: vi.fn(),
  // composeView: called per template render view.
  composeViewMock: vi.fn(),
  defaultLogoZonePanelIdsMock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Module mocks (must come before the import under test)
// ---------------------------------------------------------------------------

vi.mock('@/lib/admin/guard', () => ({ requireUser: h.requireUserMock }));

vi.mock('@alphawolf/db', async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>();
  return {
    ...actual,
    projects: {
      getProject: h.getProjectMock,
      getAsset: h.getAssetMock,
    },
    generation: {
      listRunsForProject: h.listRunsForProjectMock,
    },
    briefs: {
      getBrief: h.getBriefMock,
    },
    vehicles: {
      getPublishedDetail: h.getPublishedDetailMock,
    },
    storage: {
      downloadAssetObject: h.downloadAssetObjectMock,
      uploadAssetObject: h.uploadAssetObjectMock,
      signedAssetReadUrl: h.signedAssetReadUrlMock,
    },
  };
});

vi.mock('@/lib/generation/showcase', () => ({
  composeShowcase: h.composeShowcaseMock,
}));

vi.mock('@/lib/export/compose-views', async () => ({
  composeView: h.composeViewMock,
  defaultLogoZonePanelIds: h.defaultLogoZonePanelIdsMock,
  // Re-export the type alias (value is unused at runtime).
}));

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

import { buildShowcaseAction } from '@/lib/actions/showcase';

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const PROJECT_ID = 'proj-abc-0001';
const RUN_ID = 'run-abc-0001';
const CONCEPT_KEY = 'literal';
const USER_ID = 'user-abc-0001';

function makeTemplateImage(view: string, overrides: Record<string, unknown> = {}) {
  return {
    conceptKey: CONCEPT_KEY,
    view,
    renderTarget: 'template' as const,
    storagePath: `generations/${PROJECT_ID}/${RUN_ID}/${CONCEPT_KEY}-${view}.png`,
    width: 1024,
    height: 768,
    ...overrides,
  };
}

function makePhotoImage(overrides: Record<string, unknown> = {}) {
  return {
    conceptKey: CONCEPT_KEY,
    view: 'photo',
    renderTarget: 'photo' as const,
    storagePath: `generations/${PROJECT_ID}/${RUN_ID}/${CONCEPT_KEY}-photo.png`,
    width: 1024,
    height: 768,
    ...overrides,
  };
}

function makeRun(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    kind: 'final',
    status: 'complete',
    conceptKey: CONCEPT_KEY,
    images: [makeTemplateImage('driver'), makePhotoImage()],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// beforeEach: configure happy-path defaults; individual tests override.
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();

  h.requireUserMock.mockResolvedValue({ id: USER_ID, email: 'test@example.com' });

  h.getProjectMock.mockResolvedValue({ id: PROJECT_ID, vehicleId: 'veh-x3-0001' });

  h.listRunsForProjectMock.mockResolvedValue([makeRun()]);

  h.getBriefMock.mockResolvedValue({
    id: 'brief-0001',
    projectId: PROJECT_ID,
    data: {},
    rev: 1,
  });

  h.getPublishedDetailMock.mockResolvedValue({
    id: 'veh-x3-0001',
    panels: [{ id: 'p-driver', view: 'driver', name: 'Driver side', svgPath: 'M0,0' }],
  });

  // downloadAssetObject: return a small buffer for any key.
  h.downloadAssetObjectMock.mockResolvedValue(Buffer.alloc(100));

  // composeView: return a minimal PNG buffer.
  h.composeViewMock.mockResolvedValue(Buffer.alloc(200));

  // defaultLogoZonePanelIds: return an empty array (no logo in the brief default).
  h.defaultLogoZonePanelIdsMock.mockReturnValue([]);

  // composeShowcase: return a mock PNG.
  h.composeShowcaseMock.mockResolvedValue(Buffer.alloc(300));

  // uploadAssetObject: no-op.
  h.uploadAssetObjectMock.mockResolvedValue(undefined);

  // signedAssetReadUrl: return a fake signed URL.
  h.signedAssetReadUrlMock.mockResolvedValue('https://signed.test/showcase/key.png');
});

// ---------------------------------------------------------------------------
// 1. Non-owner / missing project (getProject resolves null)
// ---------------------------------------------------------------------------

describe('buildShowcaseAction — not_found paths', () => {
  it('returns not_found when the project does not exist or does not belong to the user', async () => {
    h.getProjectMock.mockResolvedValue(null);

    const res = await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(res).toEqual({ ok: false, code: 'not_found' });
    // Never attempts to load runs for a non-existent project.
    expect(h.listRunsForProjectMock).not.toHaveBeenCalled();
  });

  it('returns not_found when auth fails (requireUser throws)', async () => {
    h.requireUserMock.mockRejectedValue(new Error('Unauthenticated'));

    const res = await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(res).toEqual({ ok: false, code: 'not_found' });
  });

  it('returns not_found when the run does not belong to the project', async () => {
    // Run ID in the response does not match RUN_ID.
    h.listRunsForProjectMock.mockResolvedValue([makeRun({ id: 'run-other' })]);

    const res = await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(res).toEqual({ ok: false, code: 'not_found' });
  });
});

// ---------------------------------------------------------------------------
// 2. not_ready: project exists but no complete template renders for the concept
// ---------------------------------------------------------------------------

describe('buildShowcaseAction — not_ready paths', () => {
  it('returns not_ready when the final run has no template images at all', async () => {
    h.listRunsForProjectMock.mockResolvedValue([makeRun({ images: [] })]);

    const res = await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(res).toEqual({ ok: false, code: 'not_ready' });
  });

  it('returns not_ready when all images are photo renders (no template renders)', async () => {
    h.listRunsForProjectMock.mockResolvedValue([makeRun({ images: [makePhotoImage()] })]);

    const res = await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(res).toEqual({ ok: false, code: 'not_ready' });
  });

  it('returns not_ready when template images exist but composeView fails for all views', async () => {
    // composeView throws for every view; composedViews ends up empty.
    h.composeViewMock.mockRejectedValue(new Error('sharp failed'));

    const res = await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(res).toEqual({ ok: false, code: 'not_ready' });
  });

  it('returns not_ready when the template render download is too large (>8 MB)', async () => {
    // A buffer larger than 8 MB is skipped inside the view loop.
    h.downloadAssetObjectMock.mockResolvedValue(Buffer.alloc(9 * 1024 * 1024));

    const res = await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(res).toEqual({ ok: false, code: 'not_ready' });
  });
});

// ---------------------------------------------------------------------------
// 3. Happy path: template renders present (with and without a photo hero)
// ---------------------------------------------------------------------------

describe('buildShowcaseAction — happy path', () => {
  it('uploads to showcase/<projectId>/... and returns { ok: true, url }', async () => {
    const res = await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(res).toEqual({ ok: true, url: 'https://signed.test/showcase/key.png' });

    // The cache key must be scoped to this project.
    expect(h.uploadAssetObjectMock).toHaveBeenCalledWith(
      expect.stringMatching(`^showcase/${PROJECT_ID}/`),
      expect.any(Buffer),
      'image/png',
    );

    // A signed URL must be returned for the cache key.
    expect(h.signedAssetReadUrlMock).toHaveBeenCalledWith(
      expect.stringMatching(`^showcase/${PROJECT_ID}/`),
    );
  });

  it('includes the on-photo hero in the showcase composite when present', async () => {
    // Default run fixture includes a photo image — verify composeShowcase is
    // called with a non-null heroPng.
    await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(h.composeShowcaseMock).toHaveBeenCalledWith(
      expect.objectContaining({
        // heroPng is a Uint8Array (converted from the download buffer).
        heroPng: expect.any(Uint8Array),
      }),
    );
  });

  it('composes the showcase with heroPng null when no photo render exists', async () => {
    // Run has no photo images.
    h.listRunsForProjectMock.mockResolvedValue([
      makeRun({ images: [makeTemplateImage('driver')] }),
    ]);

    const res = await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(res).toMatchObject({ ok: true });
    expect(h.composeShowcaseMock).toHaveBeenCalledWith(expect.objectContaining({ heroPng: null }));
  });

  it('picks the largest template render per view when duplicates exist', async () => {
    // Two driver-side renders at different sizes: the larger (1600x1200) wins.
    const smallDriver = makeTemplateImage('driver', { width: 512, height: 384 });
    const largeDriver = makeTemplateImage('driver', {
      width: 1600,
      height: 1200,
      storagePath: `generations/${PROJECT_ID}/${RUN_ID}/${CONCEPT_KEY}-driver-large.png`,
    });
    h.listRunsForProjectMock.mockResolvedValue([
      makeRun({ images: [smallDriver, largeDriver, makePhotoImage()] }),
    ]);

    const res = await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    expect(res).toMatchObject({ ok: true });
    // downloadAssetObject is called for the chosen render; confirm the larger key is used.
    expect(h.downloadAssetObjectMock).toHaveBeenCalledWith(largeDriver.storagePath);
    expect(h.downloadAssetObjectMock).not.toHaveBeenCalledWith(smallDriver.storagePath);
  });

  it('prefers a complete final run for the concept over the passed-in run', async () => {
    const initialRun = makeRun({
      id: RUN_ID,
      kind: 'initial',
      status: 'complete',
      images: [makeTemplateImage('driver')],
    });
    const finalRunId = 'run-final-0002';
    const finalRun = makeRun({
      id: finalRunId,
      kind: 'final',
      status: 'complete',
      images: [
        makeTemplateImage('driver', {
          storagePath: `generations/${PROJECT_ID}/${finalRunId}/${CONCEPT_KEY}-driver.png`,
        }),
      ],
    });

    // listRunsForProject returns both; targetRun = initialRun, but finalRun is preferred.
    h.listRunsForProjectMock.mockResolvedValue([initialRun, finalRun]);

    await buildShowcaseAction(PROJECT_ID, RUN_ID, CONCEPT_KEY);

    // The download key from the final run should be used, not the initial run.
    expect(h.downloadAssetObjectMock).toHaveBeenCalledWith(
      `generations/${PROJECT_ID}/${finalRunId}/${CONCEPT_KEY}-driver.png`,
    );
  });
});
