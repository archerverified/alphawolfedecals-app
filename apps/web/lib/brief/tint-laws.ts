// U.S. window-tint law table + verdict logic (Goal 5 / B2C-006).
//
// STATIC, VERSIONED DATA — passenger-car (sedan) rules only. Values are the
// MINIMUM visible light transmission (VLT %) each jurisdiction allows for that
// window; 'any' = no VLT limit; 'none' = aftermarket tint not permitted on
// that window (beyond an eyebrow strip where applicable).
//
// Compiled 2026-06-11 from secondary legal-summary sources (primary statutes
// are 51 separate codes — verifying each is the legal pass below):
// - https://www.recordinglaw.com/us-laws/window-tint-laws/ (2026 edition)
// - Cross-checked highlights: Louisiana Act 143 (2025) front 25%; North
//   Dakota HB 1340 (2025) 35%; Iowa HF 766 lowers front 70%→50% EFFECTIVE
//   2026-07-01 (table still carries 70 until then — see IOWA_PENDING note).
//
// ⚠️ LEGAL-PASS FLAG (launch item, Archer): tint statutes change and carry
// nuances this table intentionally omits (medical exemptions, reflectivity
// caps, SUV/van rear-window allowances, enforcement tolerances). The wizard
// copy ships with a "laws change — verify with your installer" disclaimer;
// final disclaimer wording + table audit needs the human legal pass before
// launch (PRD §8).
//
// CONVENTION: the conservative sedan baseline WITHOUT relying on the
// dual-outside-mirror exception many states offer for windows behind the
// driver (erring toward "stricter than the meter" is the safe direction for
// a pre-purchase hint). Where a statute makes 'any' the plain rule (e.g.
// Hawaii Act 129), 'any' is encoded. Reconciling per-state mirror exceptions
// is on the legal-pass list. Vans/SUVs (MPVs): most states allow ANY darkness
// behind the driver — sedan rules here are the conservative baseline.

export type VltRule = number | 'any' | 'none';

export interface StateTintLaw {
  /** USPS code. */
  code: string;
  name: string;
  /** Front side windows (driver/passenger). */
  front: VltRule;
  /** Rear side windows. */
  back: VltRule;
  /** Rear window. */
  rear: VltRule;
}

export const TINT_LAW_VERSION = '2026-06-11';

// Iowa HF 766: front drops to 50 on 2026-07-01 — update `front` then.
export const IOWA_PENDING = { effective: '2026-07-01', front: 50 };

export const TINT_LAWS: readonly StateTintLaw[] = [
  { code: 'AL', name: 'Alabama', front: 32, back: 32, rear: 32 },
  { code: 'AK', name: 'Alaska', front: 70, back: 40, rear: 40 },
  { code: 'AZ', name: 'Arizona', front: 33, back: 'any', rear: 'any' },
  { code: 'AR', name: 'Arkansas', front: 25, back: 25, rear: 10 },
  { code: 'CA', name: 'California', front: 70, back: 'any', rear: 'any' },
  { code: 'CO', name: 'Colorado', front: 27, back: 27, rear: 27 },
  { code: 'CT', name: 'Connecticut', front: 35, back: 35, rear: 'any' },
  { code: 'DE', name: 'Delaware', front: 'none', back: 'any', rear: 'any' },
  { code: 'DC', name: 'District of Columbia', front: 70, back: 50, rear: 50 },
  { code: 'FL', name: 'Florida', front: 28, back: 15, rear: 15 },
  { code: 'GA', name: 'Georgia', front: 32, back: 32, rear: 32 },
  { code: 'HI', name: 'Hawaii', front: 35, back: 'any', rear: 'any' },
  { code: 'ID', name: 'Idaho', front: 35, back: 20, rear: 35 },
  { code: 'IL', name: 'Illinois', front: 35, back: 35, rear: 35 },
  { code: 'IN', name: 'Indiana', front: 30, back: 30, rear: 30 },
  { code: 'IA', name: 'Iowa', front: 70, back: 'any', rear: 'any' },
  { code: 'KS', name: 'Kansas', front: 35, back: 35, rear: 35 },
  { code: 'KY', name: 'Kentucky', front: 35, back: 18, rear: 18 },
  { code: 'LA', name: 'Louisiana', front: 25, back: 25, rear: 12 },
  { code: 'ME', name: 'Maine', front: 35, back: 'any', rear: 'any' },
  { code: 'MD', name: 'Maryland', front: 35, back: 35, rear: 35 },
  { code: 'MA', name: 'Massachusetts', front: 35, back: 35, rear: 35 },
  { code: 'MI', name: 'Michigan', front: 'none', back: 'any', rear: 'any' },
  { code: 'MN', name: 'Minnesota', front: 50, back: 50, rear: 50 },
  { code: 'MS', name: 'Mississippi', front: 28, back: 28, rear: 28 },
  { code: 'MO', name: 'Missouri', front: 35, back: 'any', rear: 'any' },
  { code: 'MT', name: 'Montana', front: 24, back: 14, rear: 14 },
  { code: 'NE', name: 'Nebraska', front: 35, back: 20, rear: 20 },
  { code: 'NV', name: 'Nevada', front: 35, back: 'any', rear: 'any' },
  { code: 'NH', name: 'New Hampshire', front: 70, back: 35, rear: 35 },
  { code: 'NJ', name: 'New Jersey', front: 'none', back: 'any', rear: 'any' },
  { code: 'NM', name: 'New Mexico', front: 20, back: 20, rear: 20 },
  { code: 'NY', name: 'New York', front: 70, back: 70, rear: 70 },
  { code: 'NC', name: 'North Carolina', front: 35, back: 35, rear: 35 },
  { code: 'ND', name: 'North Dakota', front: 35, back: 35, rear: 35 },
  { code: 'OH', name: 'Ohio', front: 50, back: 'any', rear: 'any' },
  { code: 'OK', name: 'Oklahoma', front: 25, back: 25, rear: 25 },
  { code: 'OR', name: 'Oregon', front: 35, back: 35, rear: 35 },
  { code: 'PA', name: 'Pennsylvania', front: 70, back: 70, rear: 70 },
  { code: 'RI', name: 'Rhode Island', front: 70, back: 70, rear: 70 },
  { code: 'SC', name: 'South Carolina', front: 27, back: 27, rear: 27 },
  { code: 'SD', name: 'South Dakota', front: 35, back: 20, rear: 20 },
  { code: 'TN', name: 'Tennessee', front: 35, back: 35, rear: 35 },
  { code: 'TX', name: 'Texas', front: 25, back: 'any', rear: 25 },
  { code: 'UT', name: 'Utah', front: 35, back: 'any', rear: 'any' },
  { code: 'VT', name: 'Vermont', front: 'none', back: 'any', rear: 'any' },
  { code: 'VA', name: 'Virginia', front: 50, back: 35, rear: 35 },
  { code: 'WA', name: 'Washington', front: 24, back: 24, rear: 24 },
  { code: 'WV', name: 'West Virginia', front: 35, back: 35, rear: 35 },
  { code: 'WI', name: 'Wisconsin', front: 50, back: 35, rear: 35 },
  { code: 'WY', name: 'Wyoming', front: 28, back: 28, rear: 28 },
] as const;

export function tintLawFor(code: string): StateTintLaw | null {
  return TINT_LAWS.find((s) => s.code === code) ?? null;
}

export type TintWindow = 'front' | 'back' | 'rear';

export const TINT_WINDOWS: ReadonlyArray<{ key: TintWindow; label: string }> = [
  { key: 'front', label: 'Front side windows' },
  { key: 'back', label: 'Rear side windows' },
  { key: 'rear', label: 'Rear window' },
];

export type TintVerdict =
  | { status: 'legal'; note: string }
  | { status: 'close'; note: string }
  | { status: 'illegal'; note: string };

// "Close to the line" margin: meters and films both have tolerance; flag
// legal-but-tight selections instead of pretending precision.
const CLOSE_MARGIN = 5;

/**
 * Verdict for choosing a film of `vlt`% on `window` in `stateCode`.
 * Convention: the selected % IS the VLT (lower = darker), the industry's
 * "20% tint" usage. Glass itself filters some light too — another reason
 * the verdict language stays "check with your installer".
 */
export function tintVerdict(
  stateCode: string,
  windowKey: TintWindow,
  vlt: number,
): TintVerdict | null {
  const law = tintLawFor(stateCode);
  if (!law) return null;
  const rule = law[windowKey];
  if (rule === 'any') {
    return { status: 'legal', note: `${law.name}: no VLT limit on this window.` };
  }
  if (rule === 'none') {
    return {
      status: 'illegal',
      note: `${law.name}: aftermarket tint isn't allowed on this window (top strip only).`,
    };
  }
  if (vlt < rule) {
    return {
      status: 'illegal',
      note: `${law.name} requires ${rule}%+ VLT here — ${vlt}% is darker than allowed.`,
    };
  }
  if (vlt - rule < CLOSE_MARGIN) {
    return {
      status: 'close',
      note: `Right at ${law.name}'s ${rule}% minimum — film stacks on factory glass and may meter below it. Confirm with your installer.`,
    };
  }
  return { status: 'legal', note: `Meets ${law.name}'s ${rule}%+ VLT minimum.` };
}
