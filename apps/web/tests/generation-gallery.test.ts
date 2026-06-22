// Unit tests for the generation studio's pure derivation helpers (Goal 7 D5).

import { describe, expect, it } from 'vitest';

import {
  deriveConcepts,
  progressCopy,
  sortViewKeys,
  viewLabel,
  type GalleryRun,
} from '@/lib/generation/gallery';

function run(partial: Partial<GalleryRun> & Pick<GalleryRun, 'runId' | 'kind'>): GalleryRun {
  return {
    status: 'complete',
    conceptKey: null,
    createdAt: '2026-06-12T00:00:00.000Z',
    directions: [],
    images: [],
    ...partial,
  };
}

const INITIAL = run({
  runId: 'r-initial',
  kind: 'initial',
  createdAt: '2026-06-12T00:00:00.000Z',
  directions: [
    { key: 'literal', title: 'Straight ahead', summary: 'Just what you asked for.' },
    { key: 'bolder', title: 'Turned up', summary: 'Bigger shapes, more motion.' },
    { key: 'minimal', title: 'Stripped back', summary: 'Cleaner, calmer.' },
  ],
  images: [
    { conceptKey: 'literal', view: 'driver', previewUrl: 'u/lit-driver-v1' },
    { conceptKey: 'literal', view: 'back', previewUrl: 'u/lit-back-v1' },
    { conceptKey: 'bolder', view: 'driver', previewUrl: 'u/bold-driver-v1' },
    { conceptKey: 'minimal', view: 'driver', previewUrl: 'u/min-driver-v1' },
  ],
});

describe('deriveConcepts', () => {
  it('returns empty when no complete initial run exists', () => {
    expect(deriveConcepts([])).toEqual([]);
    expect(deriveConcepts([run({ runId: 'x', kind: 'initial', status: 'rendering' })])).toEqual([]);
  });

  it('builds 3 cards from the initial run with per-view previews', () => {
    const cards = deriveConcepts([INITIAL]);
    expect(cards.map((c) => c.key)).toEqual(['literal', 'bolder', 'minimal']);
    expect(cards[0]).toMatchObject({
      title: 'Straight ahead',
      latestRunId: 'r-initial',
      views: { driver: 'u/lit-driver-v1', back: 'u/lit-back-v1' },
      finalViews: null,
    });
  });

  it('overlays a later complete iteration onto its concept only', () => {
    const iteration = run({
      runId: 'r-iter',
      kind: 'iteration',
      conceptKey: 'literal',
      createdAt: '2026-06-12T01:00:00.000Z',
      directions: [{ key: 'literal', title: 'Brighter take', summary: 'same' }],
      images: [{ conceptKey: 'literal', view: 'driver', previewUrl: 'u/lit-driver-v2' }],
    });
    // Context action returns newest-first.
    const cards = deriveConcepts([iteration, INITIAL]);
    const literal = cards.find((c) => c.key === 'literal')!;
    expect(literal.views.driver).toBe('u/lit-driver-v2'); // overridden
    expect(literal.views.back).toBe('u/lit-back-v1'); // untouched view survives
    expect(literal.latestRunId).toBe('r-iter'); // next refine parents here
    expect(literal.title).toBe('Brighter take');
    expect(cards.find((c) => c.key === 'bolder')!.views.driver).toBe('u/bold-driver-v1');
  });

  it('ignores failed and in-flight runs', () => {
    const failed = run({
      runId: 'r-fail',
      kind: 'iteration',
      conceptKey: 'literal',
      status: 'failed',
      createdAt: '2026-06-12T01:00:00.000Z',
      images: [{ conceptKey: 'literal', view: 'driver', previewUrl: 'u/should-not-show' }],
    });
    const cards = deriveConcepts([failed, INITIAL]);
    expect(cards.find((c) => c.key === 'literal')!.views.driver).toBe('u/lit-driver-v1');
  });

  it('attaches final renders without touching the watermarked previews', () => {
    const final = run({
      runId: 'r-final',
      kind: 'final',
      conceptKey: 'minimal',
      createdAt: '2026-06-12T02:00:00.000Z',
      images: [
        { conceptKey: 'minimal', view: 'driver', previewUrl: 'u/min-driver-final' },
        { conceptKey: 'minimal', view: 'back', previewUrl: 'u/min-back-final' },
      ],
    });
    const cards = deriveConcepts([final, INITIAL]);
    const minimal = cards.find((c) => c.key === 'minimal')!;
    expect(minimal.finalRunId).toBe('r-final');
    expect(minimal.finalViews).toEqual({
      driver: 'u/min-driver-final',
      back: 'u/min-back-final',
    });
    expect(minimal.views.driver).toBe('u/min-driver-v1');
  });

  it('routes an initial photo render to photoView, never into the view set', () => {
    const initialWithPhoto = run({
      ...INITIAL,
      images: [
        ...INITIAL.images,
        {
          conceptKey: 'literal',
          view: 'photo',
          previewUrl: 'u/lit-photo-v1',
          renderTarget: 'photo',
        },
      ],
    });
    const cards = deriveConcepts([initialWithPhoto]);
    const literal = cards.find((c) => c.key === 'literal')!;
    expect(literal.photoView).toBe('u/lit-photo-v1');
    expect(literal.finalPhotoView).toBeNull();
    // The on-photo render must never leak into the 4-view switcher set.
    expect(Object.keys(literal.views)).not.toContain('photo');
    expect(literal.views).toEqual({ driver: 'u/lit-driver-v1', back: 'u/lit-back-v1' });
    // Concepts without a photo job stay null.
    expect(cards.find((c) => c.key === 'bolder')!.photoView).toBeNull();
  });

  it('routes a final photo render to finalPhotoView, never into finalViews', () => {
    const final = run({
      runId: 'r-final',
      kind: 'final',
      conceptKey: 'minimal',
      createdAt: '2026-06-12T02:00:00.000Z',
      images: [
        { conceptKey: 'minimal', view: 'driver', previewUrl: 'u/min-driver-final' },
        {
          conceptKey: 'minimal',
          view: 'photo',
          previewUrl: 'u/min-photo-final',
          renderTarget: 'photo',
        },
      ],
    });
    const cards = deriveConcepts([final, INITIAL]);
    const minimal = cards.find((c) => c.key === 'minimal')!;
    expect(minimal.finalPhotoView).toBe('u/min-photo-final');
    expect(Object.keys(minimal.finalViews ?? {})).not.toContain('photo');
    expect(minimal.finalViews).toEqual({ driver: 'u/min-driver-final' });
  });

  it('routes a photo render by view sentinel even without renderTarget', () => {
    // Defensive fallback: a snapshot that predates the discriminator still
    // partitions the on-photo image out of the view set via view==='photo'.
    const initialWithPhoto = run({
      ...INITIAL,
      images: [
        ...INITIAL.images,
        { conceptKey: 'bolder', view: 'photo', previewUrl: 'u/bold-photo-v1' },
      ],
    });
    const cards = deriveConcepts([initialWithPhoto]);
    const bolder = cards.find((c) => c.key === 'bolder')!;
    expect(bolder.photoView).toBe('u/bold-photo-v1');
    expect(Object.keys(bolder.views)).not.toContain('photo');
  });
});

describe('progressCopy', () => {
  it('describes each stage in customer voice', () => {
    expect(progressCopy({ kind: 'initial', status: 'queued', jobs: [] })).toMatch(/Sketching/);
    expect(
      progressCopy({
        kind: 'initial',
        status: 'rendering',
        jobs: [{ status: 'complete' }, { status: 'submitted' }, { status: 'pending' }],
      }),
    ).toContain('1 of 3');
    expect(progressCopy({ kind: 'iteration', status: 'orchestrating', jobs: [] })).toMatch(
      /tweak/i,
    );
    expect(progressCopy({ kind: 'final', status: 'rendering', jobs: [] })).toMatch(/full quality/i);
    expect(progressCopy({ kind: 'initial', status: 'failed', jobs: [] })).toMatch(/credit/i);
  });
});

describe('view helpers', () => {
  it('labels and orders views canonically', () => {
    expect(viewLabel('driver')).toBe('Driver side');
    expect(viewLabel('mystery')).toBe('mystery');
    expect(sortViewKeys(['top', 'front', 'driver'])).toEqual(['front', 'driver', 'top']);
  });
});
