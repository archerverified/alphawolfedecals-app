// Goal 18 D1 — gradient-DIRECTION eval (real Haiku, 2-3 briefs). Asserts the
// orchestrator emits a STRUCTURED gradient descriptor whose front/rear ends match
// the brief, so the deterministic gradient guide (run-pipeline) pins the briefed
// direction. The image model ignores directional TEXT (proven real-fal) — this
// guards the DATA the guide is built from. Never runs in CI: needs RUN_AI_EVAL=1
// and a real ANTHROPIC_API_KEY.
//
//   RUN_AI_EVAL=1 ANTHROPIC_API_KEY=sk-... \
//     pnpm --filter @alphawolf/web exec vitest run tests/ai-orchestrator-gradient-direction.eval.test.ts
//
// @vitest-environment node

import { describe, expect, it } from 'vitest';

import type { BriefData } from '../lib/brief/schema';

const enabled = process.env.RUN_AI_EVAL === '1' && Boolean(process.env.ANTHROPIC_API_KEY?.trim());

const vehicle = { year: 2024, make: 'BMW', model: 'X3', bodyType: 'suv' };
const views = ['front', 'driver', 'back', 'passenger'];
const ZONE = 'aa000001-0000-4000-8000-0000000000aa';

function luminance(hex: string): number {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return NaN;
  const n = parseInt(m[1]!, 16);
  return 0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
}

// Both directional briefs state "darkest at the front" — so the descriptor's
// front end MUST be the darker hex and the rear the brighter one.
const DIRECTIONAL: Array<{ name: string; brief: BriefData }> = [
  {
    name: 'gloss black → cyan (front darkest)',
    brief: {
      colors: { picks: [{ hex: '#000000' }, { hex: '#00AEEF' }] },
      style: {
        presets: ['Aggressive'],
        prompt:
          'A bold cohesive GRADIENT wrap that flows gloss black into cyan across the entire vehicle, ' +
          'glossy, continuous across every panel.',
      },
      zoneNotes: {
        [ZONE]: 'gradient darkest gloss black at the front, brightest cyan at the rear',
      },
    },
  },
  {
    name: 'gunmetal grey → electric purple (front darkest)',
    brief: {
      colors: { picks: [{ hex: '#2B2F33' }, { hex: '#7B2FF7' }] },
      style: {
        presets: ['Aggressive'],
        prompt:
          'A bold cohesive gradient wrap flowing from satin gunmetal grey at the front into electric ' +
          'purple at the rear, glossy and premium, consistent across every panel.',
      },
      zoneNotes: { [ZONE]: 'gradient darkest grey at the front, brightest purple at the rear' },
    },
  },
];

describe.runIf(enabled)('gradient-direction eval (real Haiku, ~$0.02)', () => {
  for (const b of DIRECTIONAL) {
    it(`emits a directional descriptor with the FRONT darker than the REAR — "${b.name}"`, async () => {
      const { compileBrief } = await import('../lib/ai/orchestrator');
      const { resolveOrchestratorModel } = await import('@alphawolf/db');
      const result = await compileBrief({ briefData: b.brief, vehicle, views });
      console.info(`\n[MODEL=${resolveOrchestratorModel().model}] "${b.name}"`);
      for (const dir of result.directions) {
        console.info(
          `  ${dir.key}: gradient=${JSON.stringify(dir.gradient)} | driver="${(dir.viewPrompts.driver ?? '').slice(0, 90)}..."`,
        );
      }
      for (const dir of result.directions) {
        const g = dir.gradient;
        expect(g, `${b.name}/${dir.key}: gradient present`).toBeTruthy();
        expect(g.directional, `${b.name}/${dir.key}: directional`).toBe(true);
        expect(g.frontHex, `${b.name}/${dir.key}: frontHex valid`).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(g.rearHex, `${b.name}/${dir.key}: rearHex valid`).toMatch(/^#[0-9a-fA-F]{6}$/);
        // The brief says darkest at the FRONT → front luminance < rear luminance.
        expect(
          luminance(g.frontHex),
          `${b.name}/${dir.key}: front (${g.frontHex}) should be darker than rear (${g.rearHex})`,
        ).toBeLessThan(luminance(g.rearHex));
      }
      console.info(`[gradient-direction eval] "${b.name}" OK — $${result.usage.estimatedUsd}`);
    }, 120_000);
  }

  it('marks a SOLID (non-directional) brief as directional:false', async () => {
    const { compileBrief } = await import('../lib/ai/orchestrator');
    const brief: BriefData = {
      colors: { picks: [{ hex: '#B0121A', role: 'primary' }] },
      style: {
        presets: ['Clean'],
        prompt: 'a single solid deep red gloss wrap, one colour all over',
      },
    };
    const result = await compileBrief({ briefData: brief, vehicle, views });
    for (const dir of result.directions) {
      expect(dir.gradient.directional, `${dir.key}: solid brief is not directional`).toBe(false);
    }
  }, 120_000);
});

describe.runIf(!enabled)('gradient-direction eval (skipped)', () => {
  it('is gated behind RUN_AI_EVAL=1 + ANTHROPIC_API_KEY', () => {
    expect(enabled).toBe(false);
  });
});
