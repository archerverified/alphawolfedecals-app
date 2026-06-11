// Tint law table + verdict invariants (Goal 5 / B2C-006).

import { describe, expect, it } from 'vitest';
import { IOWA_PENDING, TINT_LAWS, tintLawFor, tintVerdict } from '../lib/brief/tint-laws';

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
    // PR #127 review MUST-FIX: IL is 35/35/35 for sedans (625 ILCS 5/12-503);
    // 50/35/any was the SUV rule + mirrors exception — false-legal.
    expect(tintLawFor('IL')).toMatchObject({ front: 35, back: 35, rear: 35 });
  });

  it('dated tripwire: Iowa HF 766 lowers front to 50 on 2026-07-01', () => {
    // Intentionally wall-clock dependent: when this fails, update IA in the
    // table (and retire IOWA_PENDING). Loud staleness beats silent drift.
    const effective = new Date(IOWA_PENDING.effective + 'T00:00:00Z').getTime();
    const expected = Date.now() >= effective ? IOWA_PENDING.front : 70;
    expect(tintLawFor('IA')?.front).toBe(expected);
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
