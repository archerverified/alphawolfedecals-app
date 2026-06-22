// Unit tests for the pure helpers in repos/share.ts (Goal 9 / growth loops).
// No DB — these run in the default `unit` vitest project. The RLS + token-gating
// behaviour is proven separately in share-rls.integration.test.ts.

import { describe, expect, test } from 'vitest';

import { assembleConcepts, parseShareDirections, previewByConceptFrom } from '../src/repos/share';

describe('parseShareDirections', () => {
  test('extracts key/title/summary from a well-formed directions JSONB', () => {
    const parsed = parseShareDirections({
      promptVersion: 'v3',
      orchestratorCostUsd: 0.01,
      directions: [
        {
          key: 'bold',
          title: 'Bold Geometric',
          summary: 'Sharp angles',
          viewPrompts: { front: 'x' },
        },
        { key: 'clean', title: 'Clean Minimal', summary: 'Lots of white', viewPrompts: {} },
      ],
    });
    expect(parsed).toEqual([
      { key: 'bold', title: 'Bold Geometric', summary: 'Sharp angles' },
      { key: 'clean', title: 'Clean Minimal', summary: 'Lots of white' },
    ]);
  });

  test('never throws on garbage — returns [] for non-objects and bad shapes', () => {
    expect(parseShareDirections(null)).toEqual([]);
    expect(parseShareDirections('nope')).toEqual([]);
    expect(parseShareDirections(42)).toEqual([]);
    expect(parseShareDirections({})).toEqual([]);
    expect(parseShareDirections({ directions: 'not-an-array' })).toEqual([]);
  });

  test('skips malformed direction entries, keeps the valid ones', () => {
    const parsed = parseShareDirections({
      directions: [
        { key: 'ok', title: 'Good', summary: 'Fine' },
        { key: 'missing-title', summary: 'no title' },
        null,
        'string',
        { key: 1, title: 'numeric key', summary: 'x' },
      ],
    });
    expect(parsed).toEqual([{ key: 'ok', title: 'Good', summary: 'Fine' }]);
  });
});

describe('assembleConcepts — the public whitelist', () => {
  const directions = [
    { key: 'a', title: 'Alpha', summary: 'first' },
    { key: 'b', title: 'Bravo', summary: 'second' },
    { key: 'c', title: 'Charlie', summary: 'third' },
  ];

  test('attaches preview path + vote count, defaulting both', () => {
    const previews = new Map([['a', 'gen/proj/a-preview.png']]);
    const votes = new Map([
      ['a', 3],
      ['b', 1],
    ]);
    const concepts = assembleConcepts(directions, previews, votes);
    expect(concepts).toEqual([
      {
        conceptKey: 'a',
        title: 'Alpha',
        summary: 'first',
        previewPath: 'gen/proj/a-preview.png',
        votes: 3,
      },
      { conceptKey: 'b', title: 'Bravo', summary: 'second', previewPath: null, votes: 1 },
      { conceptKey: 'c', title: 'Charlie', summary: 'third', previewPath: null, votes: 0 },
    ]);
  });

  test('preserves the orchestrator direction order', () => {
    const concepts = assembleConcepts(directions, new Map(), new Map());
    expect(concepts.map((c) => c.conceptKey)).toEqual(['a', 'b', 'c']);
  });

  test('emits ONLY whitelisted keys — never PII or the unwatermarked storage_path', () => {
    const concepts = assembleConcepts(directions, new Map([['a', 'p.png']]), new Map([['a', 1]]));
    const allowed = new Set(['conceptKey', 'title', 'summary', 'previewPath', 'votes']);
    for (const concept of concepts) {
      for (const key of Object.keys(concept)) {
        expect(allowed.has(key)).toBe(true);
      }
      // Defensive: the leaky fields must be structurally absent.
      const asRecord = concept as Record<string, unknown>;
      expect(asRecord.storagePath).toBeUndefined();
      expect(asRecord.email).toBeUndefined();
      expect(asRecord.ownerUserId).toBeUndefined();
      expect(asRecord.voterToken).toBeUndefined();
    }
  });
});

describe('previewByConceptFrom — on-photo renders never reach the public share', () => {
  test('skips a render_target=photo image even when it sorts first', () => {
    const map = previewByConceptFrom([
      // view 'photo' sorts before 'driver'; without the guard this would win.
      { conceptKey: 'a', view: 'photo', previewPath: 'gen/a-photo.png', renderTarget: 'photo' },
      {
        conceptKey: 'a',
        view: 'driver',
        previewPath: 'gen/a-driver.png',
        renderTarget: 'template',
      },
    ]);
    expect(map.get('a')).toBe('gen/a-driver.png');
  });

  test('a concept with ONLY a photo render yields no public preview', () => {
    const map = previewByConceptFrom([
      { conceptKey: 'b', view: 'photo', previewPath: 'gen/b-photo.png', renderTarget: 'photo' },
    ]);
    expect(map.has('b')).toBe(false);
  });

  test('the PHOTO_VIEW sentinel is excluded even without an explicit renderTarget', () => {
    const map = previewByConceptFrom([
      { conceptKey: 'c', view: 'photo', previewPath: 'gen/c-photo.png' },
      { conceptKey: 'c', view: 'front', previewPath: 'gen/c-front.png' },
    ]);
    expect(map.get('c')).toBe('gen/c-front.png');
  });

  test('template renders pass through, first watermarked preview per concept wins', () => {
    const map = previewByConceptFrom([
      { conceptKey: 'd', view: 'back', previewPath: 'gen/d-back.png', renderTarget: 'template' },
      { conceptKey: 'd', view: 'front', previewPath: 'gen/d-front.png', renderTarget: 'template' },
    ]);
    expect(map.get('d')).toBe('gen/d-back.png');
  });
});
