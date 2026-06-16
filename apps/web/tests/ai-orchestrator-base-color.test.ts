// Goal 15 D1 — base-color contract (deterministic, CI-safe). The brief→concept
// boundary must establish ONE dominant base color and never silently default to
// the factory-white vehicle (the Goal-13 headline bug: a "gloss black base"
// brief came back "crisp white with blue accents"). These assert the user-message
// surface that carries that contract to the orchestrator model.

import { describe, expect, it } from 'vitest';

import type { BriefData } from '../lib/brief/schema';
import { buildCompileUserMessage } from '../lib/ai/orchestrator/prompts';

const vehicle = { year: 2024, make: 'BMW', model: 'X3', bodyType: 'suv' };
const views = ['front', 'driver', 'back', 'passenger'];

function msgFor(colors: BriefData['colors'], style?: BriefData['style']): string {
  return buildCompileUserMessage({ briefData: { colors, style }, vehicle, views });
}

describe('buildCompileUserMessage — base-color contract (D1)', () => {
  it('names the FIRST unroled pick as the base and forbids defaulting to white', () => {
    const msg = msgFor(
      { picks: [{ hex: '#000000' }, { hex: '#35B6E8' }, { hex: '#FFFFFF' }] },
      { prompt: 'clean aggressive look, gloss black base, cyan accent stripes' },
    );
    expect(msg).toContain('BASE COLOR: #000000');
    expect(msg).toMatch(/do NOT default to white/i);
    expect(msg).toMatch(/accents/i);
  });

  it("lets an explicit 'primary' role win over pick order", () => {
    const msg = msgFor({
      picks: [{ hex: '#000000' }, { hex: '#35B6E8', role: 'primary' }, { hex: '#FFFFFF' }],
    });
    expect(msg).toContain('BASE COLOR: #35B6E8');
  });

  it('marks logo-extracted colors as reference-only, never the wrap base', () => {
    const msg = msgFor({ picks: [{ hex: '#000000' }], extractedFromLogo: ['#ffffff', '#eeeeee'] });
    expect(msg).toMatch(/LOGO colors for reference only/i);
    expect(msg).toMatch(/do NOT treat them as the wrap's base color/i);
  });

  it('emits no base-color directive when the brief has no color picks', () => {
    const msg = msgFor(undefined, { presets: ['Clean'] });
    expect(msg).not.toContain('BASE COLOR:');
  });
});
