// Tint law table + verdict invariants (Goal 5 / B2C-006).

import { describe, expect, it } from 'vitest';
import { TINT_LAWS, tintLawFor, tintVerdict } from '../lib/brief/tint-laws';

describe('TINT_LAWS', () => {
  it('covers all 50 states + DC with unique codes', () => {
    expect(TINT_LAWS).toHaveLength(51);
    expect(new Set(TINT_LAWS.map((s) => s.code)).size).toBe(51);
  });

  it('every rule is a sane VLT number, any, or none', () => {
    for (const s of TINT_LAWS) {
      for (const w of ['front', 'back', 'rear'] as const) {
        const rule = s[w];
        if (typeof rule === 'number') {
          expect(rule, `${s.code}.${w}`).toBeGreaterThanOrEqual(10);
          expect(rule, `${s.code}.${w}`).toBeLessThanOrEqual(70);
        } else {
          expect(['any', 'none']).toContain(rule);
        }
      }
    }
  });

  it('spot checks against the compiled sources', () => {
    expect(tintLawFor('GA')).toMatchObject({ front: 32, back: 32, rear: 32 });
    expect(tintLawFor('CA')).toMatchObject({ front: 70, back: 'any', rear: 'any' });
    expect(tintLawFor('NJ')).toMatchObject({ front: 'none' });
    expect(tintLawFor('LA')).toMatchObject({ front: 25, rear: 12 }); // Act 143 (2025)
    expect(tintLawFor('ND')).toMatchObject({ front: 35 }); // HB 1340 (2025)
    expect(tintLawFor('XX')).toBeNull();
  });
});

describe('tintVerdict', () => {
  it('illegal below the minimum, with the math in the note', () => {
    const v = tintVerdict('GA', 'front', 20);
    expect(v?.status).toBe('illegal');
    expect(v?.note).toContain('32');
  });

  it('close when legal but within 5 points of the line', () => {
    expect(tintVerdict('GA', 'front', 35)?.status).toBe('close');
    expect(tintVerdict('GA', 'front', 32)?.status).toBe('close');
  });

  it('legal with clear margin', () => {
    expect(tintVerdict('GA', 'front', 50)?.status).toBe('legal');
  });

  it('no-limit windows are always legal', () => {
    expect(tintVerdict('CA', 'rear', 5)?.status).toBe('legal');
  });

  it('tint-prohibited windows are always illegal', () => {
    expect(tintVerdict('NJ', 'front', 70)?.status).toBe('illegal');
  });

  it('unknown state → null (UI stays silent)', () => {
    expect(tintVerdict('XX', 'front', 35)).toBeNull();
  });
});
