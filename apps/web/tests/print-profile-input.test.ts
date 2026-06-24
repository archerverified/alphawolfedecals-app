// Shop print-profile input validation (Goal 22 / D1). Pure: zod shape + the
// effective-width derivation + the never-short overlap guard. The server action
// layers requireShopUser + RLS persistence on top of this.

import { describe, expect, it } from 'vitest';
import { validatePrintProfileInput } from '../lib/print/profile-input';

const base = {
  shopId: '22222222-2222-2222-2222-222222222222',
  printerKey: 'roland_vg3',
  nominalWidthIn: 54,
  defaultOverlapIn: 0.5,
  bleedIn: 0.25,
};

describe('validatePrintProfileInput', () => {
  it('accepts a Roland VG3 profile and derives 52.5 effective width', () => {
    const r = validatePrintProfileInput(base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.shopId).toBe(base.shopId);
    expect(r.value.effectiveWidthIn).toBeCloseTo(52.5, 5);
    expect(r.value.nominalWidthIn).toBe(54);
    expect(r.value.printerLabel).toMatch(/VG3/);
  });

  it('honours a manual effective override', () => {
    const r = validatePrintProfileInput({ ...base, effectiveOverrideIn: 53 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.effectiveWidthIn).toBe(53);
  });

  it('rejects an overlap >= the effective width (never short)', () => {
    // Schema-valid overlap (<=12) but wider than a narrow effective media (5 in):
    // tiling is impossible, so the never-short guard must reject it.
    const r = validatePrintProfileInput({ ...base, effectiveOverrideIn: 5, defaultOverlapIn: 8 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_width');
  });

  it('rejects when no usable width can be derived', () => {
    const r = validatePrintProfileInput({
      shopId: base.shopId,
      printerKey: null,
      nominalWidthIn: 1, // 1 - 1.5 margin < 0
      defaultOverlapIn: 0.5,
      bleedIn: 0.25,
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('bad_width');
  });

  it('rejects malformed input (not an object / bad types)', () => {
    expect(validatePrintProfileInput(null).ok).toBe(false);
    expect(validatePrintProfileInput({ ...base, bleedIn: -1 }).ok).toBe(false);
    expect(validatePrintProfileInput({ ...base, shopId: 'not-a-uuid' }).ok).toBe(false);
  });

  it('supports a manual (unknown-printer) machine via nominal width', () => {
    const r = validatePrintProfileInput({ ...base, printerKey: null, nominalWidthIn: 64 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.effectiveWidthIn).toBeCloseTo(62.5, 5);
      expect(r.value.printerKey).toBeNull();
      expect(r.value.printerLabel).toBeNull();
    }
  });
});
