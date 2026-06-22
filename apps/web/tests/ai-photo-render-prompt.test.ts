// Goal 21 T2 - photo-render prompt builder unit tests. ALL offline: no fal
// calls, no spend. Tests assert the deterministic contract of buildPhotoRenderPrompt
// and PHOTO_PROMPT_VERSION independently from the orchestrator versioning surface.

import { describe, expect, it } from 'vitest';

import { buildPhotoRenderPrompt, PHOTO_PROMPT_VERSION } from '../lib/ai/orchestrator/prompts';

describe('PHOTO_PROMPT_VERSION', () => {
  it('is a non-empty string', () => {
    expect(typeof PHOTO_PROMPT_VERSION).toBe('string');
    expect(PHOTO_PROMPT_VERSION.length).toBeGreaterThan(0);
  });
});

describe('buildPhotoRenderPrompt', () => {
  const summary =
    'Gloss black base with bold cyan #00AEEF side stripes and matte accents on the hood.';

  it('includes the design summary verbatim', () => {
    const prompt = buildPhotoRenderPrompt({ summary });
    expect(prompt).toContain(summary);
  });

  it('forbids text rendering', () => {
    const prompt = buildPhotoRenderPrompt({ summary });
    // The prompt must explicitly mention that text/logos/numbers must not appear.
    expect(prompt.toLowerCase()).toMatch(/no text|render no text|no.*letters|no.*numbers/i);
  });

  it('forbids logo rendering', () => {
    const prompt = buildPhotoRenderPrompt({ summary });
    expect(prompt.toLowerCase()).toMatch(/logo|emblem|badge|brandmark/i);
    // Must forbid them, not encourage them.
    expect(prompt.toLowerCase()).toMatch(
      /no.*logo|render no.*logo|no.*emblem|no.*badge|no.*brandmark/i,
    );
  });

  it('mentions preserving the vehicle shape', () => {
    const prompt = buildPhotoRenderPrompt({ summary });
    expect(prompt.toLowerCase()).toMatch(/shape|proportion|body/i);
  });

  it('mentions preserving the photo background', () => {
    const prompt = buildPhotoRenderPrompt({ summary });
    expect(prompt.toLowerCase()).toMatch(/background/i);
  });

  it('mentions preserving the photo lighting', () => {
    const prompt = buildPhotoRenderPrompt({ summary });
    expect(prompt.toLowerCase()).toMatch(/lighting|shadow/i);
  });

  it('requires photorealistic output', () => {
    const prompt = buildPhotoRenderPrompt({ summary });
    expect(prompt.toLowerCase()).toMatch(/photorealistic|photograph/i);
  });

  it('contains no em-dash or en-dash characters', () => {
    const prompt = buildPhotoRenderPrompt({ summary });
    // U+2014 = em dash, U+2013 = en dash used as a dash.
    expect(prompt).not.toMatch(/[\u2014\u2013]/);
  });

  it('is deterministic: same input always produces the same output', () => {
    const a = buildPhotoRenderPrompt({ summary });
    const b = buildPhotoRenderPrompt({ summary });
    expect(a).toBe(b);
  });

  it('incorporates a different summary verbatim', () => {
    const otherSummary = 'Pearl white base with matte gunmetal hood wrap and chrome-delete trim.';
    const prompt = buildPhotoRenderPrompt({ summary: otherSummary });
    expect(prompt).toContain(otherSummary);
    expect(prompt).not.toContain(summary);
  });
});
