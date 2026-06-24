// Printer registry + effective-width derivation (Goal 22 / D1, D7).
// The engine ALWAYS tiles to the effective printable width (rollers eat 1-2 in
// off the nominal media), never the nominal width. A short print is catastrophic.

import { describe, expect, it } from 'vitest';
import { PRINTERS, getPrinter, listPrinters, deriveEffectiveWidthIn } from '../lib/print/printers';

describe('printer registry', () => {
  it('registers the owner Roland VG3 (54 in nominal)', () => {
    const vg3 = getPrinter('roland_vg3');
    expect(vg3).not.toBeNull();
    expect(vg3?.nominalWidthIn).toBe(54);
    expect(vg3?.rollerMarginIn).toBeGreaterThan(0);
  });

  it('listPrinters returns the catalogue with stable keys', () => {
    const keys = listPrinters().map((p) => p.key);
    expect(keys).toContain('roland_vg3');
    expect(new Set(keys).size).toBe(keys.length); // no dup keys
  });

  it('getPrinter is null for an unknown key', () => {
    expect(getPrinter('nope')).toBeNull();
  });
});

describe('deriveEffectiveWidthIn', () => {
  it('derives Roland VG3 effective = nominal - roller margin (52.5 in)', () => {
    const r = deriveEffectiveWidthIn({ printerKey: 'roland_vg3' });
    expect(r).not.toBeNull();
    expect(r?.nominalWidthIn).toBe(54);
    expect(r?.effectiveWidthIn).toBeCloseTo(52.5, 5);
    expect(r?.source).toBe('derived');
  });

  it('a manual effective override within (0, nominal] wins', () => {
    const r = deriveEffectiveWidthIn({ printerKey: 'roland_vg3', effectiveOverrideIn: 53 });
    expect(r?.effectiveWidthIn).toBe(53);
    expect(r?.source).toBe('override');
  });

  it('derives from a manual nominal width when the printer is unknown', () => {
    const r = deriveEffectiveWidthIn({ printerKey: null, nominalWidthIn: 64 });
    expect(r?.nominalWidthIn).toBe(64);
    expect(r?.effectiveWidthIn).toBeCloseTo(62.5, 5); // 64 - default 1.5 margin
    expect(r?.source).toBe('manual');
  });

  it('returns null when nothing usable is supplied', () => {
    expect(deriveEffectiveWidthIn({})).toBeNull();
    expect(deriveEffectiveWidthIn({ printerKey: null, nominalWidthIn: 0 })).toBeNull();
  });

  it('rejects a nonsensical override wider than the nominal media', () => {
    // An effective wider than the physical media is impossible; fall back to derived.
    const r = deriveEffectiveWidthIn({ printerKey: 'roland_vg3', effectiveOverrideIn: 99 });
    expect(r?.effectiveWidthIn).toBeCloseTo(52.5, 5);
    expect(r?.source).toBe('derived');
  });

  it('rejects an override that leaves no grit-roller margin (>= nominal - floor)', () => {
    // Effective == nominal (or within the roller floor of it) has no margin and
    // would tile panels under the rollers, i.e. short. Fall back to derived.
    const atNominal = deriveEffectiveWidthIn({ printerKey: 'roland_vg3', effectiveOverrideIn: 54 });
    expect(atNominal?.effectiveWidthIn).toBeCloseTo(52.5, 5);
    expect(atNominal?.source).toBe('derived');
    const tooClose = deriveEffectiveWidthIn({
      printerKey: 'roland_vg3',
      effectiveOverrideIn: 53.9,
    });
    expect(tooClose?.effectiveWidthIn).toBeCloseTo(52.5, 5);
    // A genuine override that keeps a margin is still honoured.
    const ok = deriveEffectiveWidthIn({ printerKey: 'roland_vg3', effectiveOverrideIn: 53 });
    expect(ok?.effectiveWidthIn).toBe(53);
    expect(ok?.source).toBe('override');
  });

  it('never yields a non-positive effective width', () => {
    const r = deriveEffectiveWidthIn({ printerKey: null, nominalWidthIn: 1 });
    // 1 - 1.5 would be negative; the deriver must refuse rather than print short.
    expect(r).toBeNull();
  });
});

describe('PRINTERS is a plain catalogue', () => {
  it('every entry has positive nominal + margin', () => {
    for (const p of Object.values(PRINTERS)) {
      expect(p.nominalWidthIn).toBeGreaterThan(0);
      expect(p.rollerMarginIn).toBeGreaterThanOrEqual(0);
      expect(p.rollerMarginIn).toBeLessThan(p.nominalWidthIn);
    }
  });
});
