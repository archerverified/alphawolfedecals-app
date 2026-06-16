// Goal 15 D1 — base-color EVAL: real Haiku, 2-3 distinct briefs, asserts each
// concept honors the brief's stated base color (the fix for the Goal-13 headline
// bug). Never runs in CI: requires BOTH RUN_AI_EVAL=1 and a real ANTHROPIC_API_KEY.
//
//   RUN_AI_EVAL=1 ANTHROPIC_API_KEY=sk-... \
//     pnpm --filter @alphawolf/web exec vitest run tests/ai-orchestrator-base-color.eval.test.ts
//
// @vitest-environment node

import { describe, expect, it } from 'vitest';

import type { BriefData } from '../lib/brief/schema';

const enabled = process.env.RUN_AI_EVAL === '1' && Boolean(process.env.ANTHROPIC_API_KEY?.trim());

const vehicle = { year: 2024, make: 'BMW', model: 'X3', bodyType: 'suv' };
const views = ['front', 'driver', 'back', 'passenger'];

// Each brief states a base color in the customer's own words AND lists it among
// (deliberately unroled) picks — the exact shape that broke in Goal 13.
const BRIEFS: Array<{
  name: string;
  colors: NonNullable<BriefData['colors']>;
  prompt: string;
  expectBase: RegExp; // the literal/driver prompt must describe this base
  forbidBase: RegExp; // ...and must NOT describe this (wrong) base
}> = [
  {
    name: 'gloss black base + cyan stripes',
    colors: { picks: [{ hex: '#000000' }, { hex: '#35B6E8' }, { hex: '#FFFFFF' }] },
    prompt:
      'clean aggressive look, gloss black base, cyan accent stripes, white script on the doors',
    expectBase: /black/i,
    forbidBase: /\b(white|pearl)\s+(base|body|wrap)|mostly white|crisp white/i,
  },
  {
    name: 'matte white base + orange accents',
    colors: { picks: [{ hex: '#FFFFFF' }, { hex: '#FF6A00' }, { hex: '#111111' }] },
    prompt: 'clean matte white base wrap with bright orange racing accents',
    expectBase: /white/i,
    forbidBase: /\bblack\s+(base|body|wrap)|mostly black/i,
  },
  {
    name: 'deep red base + black accents',
    colors: { picks: [{ hex: '#B0121A' }, { hex: '#1A1A1A' }] },
    prompt: 'deep red base, subtle gloss black accents, premium and fast',
    expectBase: /red|#?b0121a|crimson|maroon/i,
    forbidBase: /\bwhite\s+(base|body|wrap)|mostly white/i,
  },
];

describe.runIf(enabled)('base-color eval (real Haiku, ~$0.02)', () => {
  for (const b of BRIEFS) {
    it(`honors the "${b.name}" brief across all three concepts`, async () => {
      const { compileBrief } = await import('../lib/ai/orchestrator');
      const result = await compileBrief({
        briefData: { colors: b.colors, style: { presets: ['Aggressive'], prompt: b.prompt } },
        vehicle,
        views,
      });
      for (const dir of result.directions) {
        // The right base is asserted on the largest canvas (driver)...
        const driver = (dir.viewPrompts.driver ?? '').toLowerCase();
        expect(driver, `${b.name} / ${dir.key} / driver: ${driver}`).toMatch(b.expectBase);
        // ...and NO view may describe the WRONG base (a regression could land
        // on front/back alone — the continuous-design rule means every view
        // carries the same base).
        for (const view of views) {
          const vp = (dir.viewPrompts[view] ?? '').toLowerCase();
          expect(vp, `${b.name} / ${dir.key} / ${view}: ${vp}`).not.toMatch(b.forbidBase);
        }
      }
      console.info(`[base-color eval] "${b.name}" OK — $${result.usage.estimatedUsd}`);
    }, 120_000);
  }
});

describe.runIf(!enabled)('base-color eval (skipped)', () => {
  it('is gated behind RUN_AI_EVAL=1 + ANTHROPIC_API_KEY', () => {
    expect(enabled).toBe(false);
  });
});
