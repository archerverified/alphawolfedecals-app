// Shop print-profile input validation (Goal 22 / D1). Pure: zod shape + the
// effective-width derivation (printers.ts) + the never-short overlap guard. Kept
// out of the 'use server' action so it is unit-testable without auth/DB.

import { z } from 'zod';
import { deriveEffectiveWidthIn, getPrinter } from './printers';

export interface ValidatedProfile {
  printerKey: string | null;
  printerLabel: string | null;
  nominalWidthIn: number;
  effectiveWidthIn: number;
  defaultOverlapIn: number;
  bleedIn: number;
  mediaType: string | null;
}

export type ProfileValidation =
  | { ok: true; shopId: string; value: ValidatedProfile }
  | { ok: false; reason: 'invalid' | 'bad_width' };

const schema = z.object({
  shopId: z.string().uuid(),
  printerKey: z.string().min(1).max(64).nullable().optional(),
  nominalWidthIn: z.number().positive().max(200),
  effectiveOverrideIn: z.number().positive().max(200).nullable().optional(),
  defaultOverlapIn: z.number().min(0).max(12),
  bleedIn: z.number().min(0).max(12),
  mediaType: z.string().max(120).nullable().optional(),
});

export function validatePrintProfileInput(raw: unknown): ProfileValidation {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: 'invalid' };
  const input = parsed.data;

  const derived = deriveEffectiveWidthIn({
    printerKey: input.printerKey ?? null,
    nominalWidthIn: input.nominalWidthIn,
    effectiveOverrideIn: input.effectiveOverrideIn ?? null,
  });
  if (!derived) return { ok: false, reason: 'bad_width' };

  // Never short: a lapped overlap must sit strictly inside the media (it cannot
  // be as wide as, or wider than, the printable width or tiling is impossible).
  if (input.defaultOverlapIn >= derived.effectiveWidthIn) {
    return { ok: false, reason: 'bad_width' };
  }

  const printer = getPrinter(input.printerKey ?? null);
  return {
    ok: true,
    shopId: input.shopId,
    value: {
      printerKey: input.printerKey ?? null,
      printerLabel: printer?.label ?? null,
      nominalWidthIn: derived.nominalWidthIn,
      effectiveWidthIn: derived.effectiveWidthIn,
      defaultOverlapIn: input.defaultOverlapIn,
      bleedIn: input.bleedIn,
      mediaType: input.mediaType ?? null,
    },
  };
}
