// Printer registry + effective-width derivation (Goal 22 / D1, D7).
//
// The print engine ALWAYS tiles to the EFFECTIVE printable width, never the
// nominal media width: a roll-fed printer's grit rollers consume 1 to 2 inches
// off each side of the nominal media, so a "54 inch" Roland prints ~52 to 53 in
// of usable image. Tiling to the nominal width would print panels the machine
// physically cannot lay down, i.e. short. See the owner constraints in
// prompts/24 and the spike decision doc.
//
// Pure module - unit-tested in tests/print-printers.test.ts. No I/O, no DB.

export interface PrinterSpec {
  /** Stable storage key (never rename - shop profiles persist it). */
  key: string;
  label: string;
  /** Nominal media width in inches (the spec-sheet number). */
  nominalWidthIn: number;
  /** Inches the grit rollers consume off the usable image width. */
  rollerMarginIn: number;
}

// Default roller margin applied when deriving an effective width from a manual
// nominal (unknown printer). Conservative: the owner reports 1 to 2 in on the
// Roland, so 1.5 is a safe mid-point that never over-promises usable width.
export const DEFAULT_ROLLER_MARGIN_IN = 1.5;

// The smallest grit-roller margin physically possible. An effective-width override
// must sit at least this far below the nominal media: a roll-fed printer can never
// image to the very edge under the rollers, so honouring effective == nominal (or
// within this floor) would tile panels the machine cannot lay down, i.e. short.
export const MIN_EFFECTIVE_MARGIN_IN = 0.5;

// Known machines. roland_vg3 is the owner's printer (TrueVIS VG3-540, 54 in).
export const PRINTERS: Record<string, PrinterSpec> = {
  roland_vg3: {
    key: 'roland_vg3',
    label: 'Roland TrueVIS VG3-540 (54 in)',
    nominalWidthIn: 54,
    rollerMarginIn: 1.5,
  },
  roland_vg3_640: {
    key: 'roland_vg3_640',
    label: 'Roland TrueVIS VG3-640 (64 in)',
    nominalWidthIn: 64,
    rollerMarginIn: 1.5,
  },
  generic_54: {
    key: 'generic_54',
    label: 'Generic 54 in eco-solvent',
    nominalWidthIn: 54,
    rollerMarginIn: 1.5,
  },
  generic_64: {
    key: 'generic_64',
    label: 'Generic 64 in eco-solvent',
    nominalWidthIn: 64,
    rollerMarginIn: 1.5,
  },
};

export function listPrinters(): PrinterSpec[] {
  return Object.values(PRINTERS);
}

export function getPrinter(key: string | null | undefined): PrinterSpec | null {
  if (!key) return null;
  return PRINTERS[key] ?? null;
}

export type EffectiveWidthSource = 'override' | 'derived' | 'manual';

export interface EffectiveWidth {
  effectiveWidthIn: number;
  nominalWidthIn: number;
  source: EffectiveWidthSource;
}

function positive(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/**
 * Resolve the effective printable width (inches) for a shop profile.
 * Resolution order, all guarded to never yield a non-positive width:
 *   1. A valid manual `effectiveOverrideIn` in (0, nominal - MIN_EFFECTIVE_MARGIN]
 *      wins (source 'override'). An override with no roller margin is rejected.
 *   2. A known `printerKey` derives nominal - rollerMargin (source 'derived').
 *   3. A manual `nominalWidthIn` derives nominal - DEFAULT_ROLLER_MARGIN (source 'manual').
 *   4. Otherwise null - the engine must refuse to panel rather than guess a width.
 */
export function deriveEffectiveWidthIn(input: {
  printerKey?: string | null;
  nominalWidthIn?: number | null;
  effectiveOverrideIn?: number | null;
}): EffectiveWidth | null {
  const printer = getPrinter(input.printerKey);
  const nominal = printer ? printer.nominalWidthIn : input.nominalWidthIn;
  if (!positive(nominal)) return null;

  // An override is only honoured if it is positive AND leaves at least the minimum
  // grit-roller margin below the nominal media. An effective at (or within the
  // floor of) the nominal would tile panels the rollers cannot lay down, i.e.
  // short, so we ignore it and fall through to deriving from the roller margin.
  if (
    positive(input.effectiveOverrideIn) &&
    input.effectiveOverrideIn <= nominal - MIN_EFFECTIVE_MARGIN_IN
  ) {
    return {
      effectiveWidthIn: input.effectiveOverrideIn,
      nominalWidthIn: nominal,
      source: 'override',
    };
  }

  const margin = printer ? printer.rollerMarginIn : DEFAULT_ROLLER_MARGIN_IN;
  const effective = nominal - margin;
  if (!positive(effective)) return null; // refuse rather than print short

  return {
    effectiveWidthIn: effective,
    nominalWidthIn: nominal,
    source: printer ? 'derived' : 'manual',
  };
}
