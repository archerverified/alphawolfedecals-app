// Goal 21 T5: defense filter for the spec-pack print path.
// Asserts that loadFinalViews (via loadSpecPackData) excludes photo renders
// (render_target='photo') from the spec pack hero and per-view pages.
//
// Mocking pattern: mirrors generation-actions.test.ts (vi.hoisted + vi.mock
// on @alphawolf/db). loadSpecPackData is imported AFTER the mocks are wired.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as DbModule from '@alphawolf/db';

// All mocks wired via vi.hoisted so they are defined before any top-level
// import resolves (vitest hoists vi.mock calls, but not the referenced vars).
const h = vi.hoisted(() => ({
  listRunsForProjectMock: vi.fn(),
  getProjectMock: vi.fn(),
  getBriefMock: vi.fn(),
  listBriefSnapshotsMock: vi.fn(),
  getPublishedDetailMock: vi.fn(),
  getAssetMock: vi.fn(),
  downloadAssetObjectMock: vi.fn(),
  signedAssetReadUrlMock: vi.fn(),
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@alphawolf/db', async (importOriginal) => {
  const actual = await importOriginal<typeof DbModule>();
  return {
    ...actual,
    generation: {
      listRunsForProject: h.listRunsForProjectMock,
    },
    projects: {
      getProject: h.getProjectMock,
      getAsset: h.getAssetMock,
    },
    briefs: {
      getBrief: h.getBriefMock,
      listBriefSnapshots: h.listBriefSnapshotsMock,
    },
    vehicles: {
      getPublishedDetail: h.getPublishedDetailMock,
    },
    storage: {
      downloadAssetObject: h.downloadAssetObjectMock,
      signedAssetReadUrl: h.signedAssetReadUrlMock,
    },
  };
});

// Imported after mocks so the module picks up the mocked deps.
import { loadSpecPackData } from '@/lib/export/load-spec-pack-data';

// Minimal view image row. renderTarget='template' is the normal case.
function templateImage(view: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `img-${view}`,
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
    ...overrides,
  };
}

function photoImage() {
  return templateImage('photo', {
    id: 'img-photo',
    storagePath: 'generations/proj-1/run-final/bolder-photo.png',
    previewPath: 'generations/proj-1/run-final/bolder-photo-preview.png',
    renderTarget: 'photo' as const,
  });
}

function finalRun(images: ReturnType<typeof templateImage>[]) {
  return {
    id: 'run-final',
    projectId: 'proj-1',
    userId: 'user-1',
    kind: 'final',
    status: 'complete',
    briefVersion: 4,
    model: 'flux2_pro_edit',
    provider: 'fal',
    conceptKey: 'bolder',
    directions: null,
    createdAt: new Date('2026-06-20T00:00:00Z'),
    images,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  h.getProjectMock.mockResolvedValue({
    id: 'proj-1',
    vehicleId: 'veh-1',
    name: 'Test Project',
    status: 'active',
  });
  h.getBriefMock.mockResolvedValue(null);
  h.listBriefSnapshotsMock.mockResolvedValue([]);
  h.getPublishedDetailMock.mockResolvedValue({
    id: 'veh-1',
    year: 2024,
    make: 'Ford',
    model: 'Transit',
    trim: null,
    lengthMm: 5531,
    widthMm: 2032,
    heightMm: 2630,
    thumbPngUrl: null,
    panels: [
      { id: 'p1', name: 'Driver Side', view: 'driver', svgPath: 'M 0 0 L 10 0 L 10 5 L 0 5 Z' },
      { id: 'p2', name: 'Front Fascia', view: 'front', svgPath: 'M 0 0 L 10 0 L 10 5 L 0 5 Z' },
    ],
  });
  // downloadAssetObject returns a small but valid-ish buffer (compose-views
  // may attempt a sharp decode, but our test does not assert on the final
  // composed bytes so any non-empty buffer is fine here).
  h.downloadAssetObjectMock.mockResolvedValue(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]));
  h.getAssetMock.mockResolvedValue(null); // no logo for this test
});

describe('loadSpecPackData - photo render excluded from spec pack (Goal 21 T5)', () => {
  it('excludes a photo render from the per-view pages and hero even when present in the final run', async () => {
    // A final run that has both template renders (driver + front) AND a photo render.
    h.listRunsForProjectMock.mockResolvedValue([
      finalRun([
        templateImage('driver'),
        templateImage('front'),
        photoImage(), // must be excluded
      ]),
    ]);

    const result = await loadSpecPackData(
      'user-1',
      { name: 'Test User', email: 'test@example.test' },
      'proj-1',
    );

    expect(result).not.toBeNull();
    const views = result!.vehicle.views ?? [];

    // The 'photo' view must never appear in the spec pack views.
    const viewNames = views.map((v) => v.view);
    expect(viewNames).not.toContain('photo');

    // Template views ARE present (driver and front made it through).
    expect(viewNames).toContain('driver');
    expect(viewNames).toContain('front');
  });

  it('produces a non-null spec pack when ONLY template renders are present (baseline)', async () => {
    h.listRunsForProjectMock.mockResolvedValue([
      finalRun([templateImage('driver'), templateImage('front')]),
    ]);

    const result = await loadSpecPackData(
      'user-1',
      { name: 'Test User', email: 'test@example.test' },
      'proj-1',
    );

    expect(result).not.toBeNull();
    const views = result!.vehicle.views ?? [];
    // VIEW_ORDER sorts 'front' before 'driver'.
    expect(views.map((v) => v.view)).toEqual(['front', 'driver']);
  });

  it('returns null views when the ONLY final run images are photo renders', async () => {
    // If every image in the final run is render_target='photo', the renderable
    // set is empty, and loadFinalViews returns null. The spec pack still renders
    // (from the vehicle thumb), but no AI view grid appears.
    h.listRunsForProjectMock.mockResolvedValue([finalRun([photoImage()])]);

    const result = await loadSpecPackData(
      'user-1',
      { name: 'Test User', email: 'test@example.test' },
      'proj-1',
    );

    // loadSpecPackData itself still returns a SpecPackData (vehicle exists).
    expect(result).not.toBeNull();
    // No views from AI since the only render was a photo render.
    expect(result!.vehicle.views).toBeUndefined();
  });
});
