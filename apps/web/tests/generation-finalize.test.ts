// Goal 21 T5: defense filter for the editor-canvas path.
// Asserts that finalizeFinalRunAction excludes photo renders
// (render_target='photo') from both asset registration and canvas insertion.
//
// Mocking pattern: mirrors generation-actions.test.ts (vi.hoisted + vi.mock).
// insertIntoCanvas is the inner function under test; we drive it through
// finalizeFinalRunAction with controlled listImages responses.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DbModule from '@alphawolf/db';
import type * as CanvasModule from '@alphawolf/canvas';

const h = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  getRunMock: vi.fn(),
  getProjectMock: vi.fn(),
  listImagesMock: vi.fn(),
  listAssetsMock: vi.fn(),
  createAssetMock: vi.fn(),
  setAssetParseResultMock: vi.fn(),
  getPublishedDetailMock: vi.fn(),
  getBriefMock: vi.fn(),
  getWorkingVersionMock: vi.fn(),
  saveWorkingCanvasMock: vi.fn(),
  signedAssetReadUrlMock: vi.fn(),
  getAssetMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock('@/lib/admin/guard', () => ({ requireUser: h.requireUserMock }));
vi.mock('@/lib/notifications/posthog-server', () => ({ captureServerEvent: h.captureMock }));

vi.mock('@alphawolf/db', async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>();
  return {
    ...actual,
    generation: {
      getRun: h.getRunMock,
      listImages: h.listImagesMock,
    },
    projects: {
      getProject: h.getProjectMock,
      listAssets: h.listAssetsMock,
      createAsset: h.createAssetMock,
      setAssetParseResult: h.setAssetParseResultMock,
      getAsset: h.getAssetMock,
      getWorkingVersion: h.getWorkingVersionMock,
      saveWorkingCanvas: h.saveWorkingCanvasMock,
    },
    vehicles: {
      getPublishedDetail: h.getPublishedDetailMock,
    },
    briefs: {
      getBrief: h.getBriefMock,
    },
    storage: {
      signedAssetReadUrl: h.signedAssetReadUrlMock,
    },
  };
});

// The canvas module is used for serialization of the working document. Use the
// real implementation so the document round-trips cleanly, but supply a minimal
// valid working-version from getWorkingVersionMock.
vi.mock('@alphawolf/canvas', async (importOriginal) => {
  const actual = await importOriginal<typeof CanvasModule>();
  return actual;
});

import { finalizeFinalRunAction } from '@/lib/actions/generation-finalize';
import { serializeDocument } from '@alphawolf/canvas';
import type { CanvasDocument } from '@alphawolf/canvas';

// Produce a minimal valid serialized canvas for getWorkingVersionMock.
function emptyCanvas(vehicleId = 'veh-1'): unknown {
  const doc: CanvasDocument = {
    schemaVersion: 1,
    vehicleId,
    panels: {},
    elements: {},
    selection: [],
    seq: 0,
  };
  return serializeDocument(doc);
}

function templateImage(view: string, id = `img-${view}`) {
  return {
    id,
    conceptKey: 'bolder',
    view,
    storagePath: `generations/proj-1/run-final/bolder-${view}.png`,
    previewPath: `generations/proj-1/run-final/bolder-${view}-preview.png`,
    width: 1600,
    height: 1200,
    renderTarget: 'template' as const,
    provenance: null,
    costUsd: 0.039,
    modelKey: 'flux2_pro_edit',
  };
}

function photoImage() {
  return {
    id: 'img-photo',
    conceptKey: 'bolder',
    view: 'photo',
    storagePath: 'generations/proj-1/run-final/bolder-photo.png',
    previewPath: 'generations/proj-1/run-final/bolder-photo-preview.png',
    width: 1600,
    height: 1200,
    renderTarget: 'photo' as const,
    provenance: null,
    costUsd: 0.039,
    modelKey: 'nano_banana_edit',
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  h.requireUserMock.mockResolvedValue({ id: 'user-1', email: 'a@b.co' });

  h.getRunMock.mockResolvedValue({
    id: 'run-final',
    projectId: 'proj-1',
    userId: 'user-1',
    kind: 'final',
    status: 'complete',
    conceptKey: 'bolder',
  });

  h.getProjectMock.mockResolvedValue({
    id: 'proj-1',
    vehicleId: 'veh-1',
    name: 'Test Project',
    status: 'active',
  });

  h.getPublishedDetailMock.mockResolvedValue({
    id: 'veh-1',
    panels: [
      {
        id: 'p-driver',
        name: 'Driver Side',
        view: 'driver',
        svgPath: 'M 0 0 L 100 0 L 100 50 L 0 50 Z',
        printableAreaMm2: 5000,
      },
    ],
  });

  h.getBriefMock.mockResolvedValue(null); // no logo in this test
  h.listAssetsMock.mockResolvedValue([]);
  h.createAssetMock.mockResolvedValue({ assetId: 'asset-new' });
  h.setAssetParseResultMock.mockResolvedValue(undefined);
  h.getAssetMock.mockResolvedValue(null);
  h.signedAssetReadUrlMock.mockImplementation(async (key: string) => `https://signed.test/${key}`);

  h.getWorkingVersionMock.mockResolvedValue({
    id: 'wv-1',
    rev: 1,
    canvasState: emptyCanvas(),
  });
  h.saveWorkingCanvasMock.mockResolvedValue({ ok: true });

  h.captureMock.mockResolvedValue(undefined);
});

describe('finalizeFinalRunAction - photo render excluded from canvas (Goal 21 T5)', () => {
  it('does NOT register a photo render as a project asset', async () => {
    // Mix of one template render (driver) and one photo render.
    h.listImagesMock.mockResolvedValue([templateImage('driver'), photoImage()]);

    const result = await finalizeFinalRunAction('proj-1', 'run-final');
    expect(result).toMatchObject({ ok: true });

    // createAsset called exactly ONCE (for the driver render, not the photo).
    expect(h.createAssetMock).toHaveBeenCalledTimes(1);
    // The registered asset is the driver render's storage path.
    expect(h.createAssetMock).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        sourceUrl: expect.stringContaining('driver'),
      }),
    );
    // The photo storage path must not have been registered.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paths = (h.createAssetMock.mock.calls as any[][]).map(
      (c) => (c[1] as { sourceUrl?: string })?.sourceUrl ?? '',
    );
    expect(paths.some((p: string) => p.includes('photo'))).toBe(false);
  });

  it('does NOT insert a photo render as a canvas layer', async () => {
    // Mix of one template render and one photo render.
    h.listImagesMock.mockResolvedValue([templateImage('driver'), photoImage()]);

    await finalizeFinalRunAction('proj-1', 'run-final');

    // Inspect the canvas state that was saved.
    expect(h.saveWorkingCanvasMock).toHaveBeenCalled();
    const savedState = h.saveWorkingCanvasMock.mock.calls[0]?.[1]?.canvasState as
      | Record<string, unknown>
      | undefined;

    if (savedState) {
      // The serialized canvas must not reference the photo storage path or view.
      const json = JSON.stringify(savedState);
      expect(json).not.toContain('bolder-photo');
      expect(json).not.toContain('"view":"photo"');
    }
  });

  it('succeeds when ONLY template renders are present (baseline behavior unchanged)', async () => {
    h.listImagesMock.mockResolvedValue([templateImage('driver')]);

    const result = await finalizeFinalRunAction('proj-1', 'run-final');
    expect(result).toMatchObject({ ok: true, assetsRegistered: 1, canvasUpdated: true });
  });

  it('reports no renders when the only final run images are photo renders', async () => {
    // After the template filter, images is empty. The action returns the
    // friendly "no renders yet" error rather than crashing.
    h.listImagesMock.mockResolvedValue([photoImage()]);

    const result = await finalizeFinalRunAction('proj-1', 'run-final');
    expect(result).toMatchObject({ ok: false, message: expect.stringMatching(/no renders yet/i) });

    // No asset was registered and no canvas write was attempted.
    expect(h.createAssetMock).not.toHaveBeenCalled();
    expect(h.saveWorkingCanvasMock).not.toHaveBeenCalled();
  });
});
