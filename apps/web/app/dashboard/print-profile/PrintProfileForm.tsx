'use client';

// Shop print-profile editor (Goal 22 / D1). Client form over
// saveShopPrintProfileAction. Picking a known printer fills the nominal width
// from the registry (read-only, the spec-sheet number); "Manual / other" lets
// the owner type a nominal for an unlisted machine. The effective width is
// auto-derived server-side (nominal minus the roller margin) unless an override
// is given, so the field is optional. Validation messages map the action's
// reasons to plain language for a shop owner, not a developer.

import { useState, useTransition } from 'react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { Loader2 } from 'lucide-react';
import { listPrinters } from '@/lib/print/printers';
import {
  saveShopPrintProfileAction,
  type SaveProfileResult,
} from '@/lib/actions/shop-print-profile';
import type { ShopPrintProfileRow } from '@alphawolf/db';

const MANUAL_KEY = 'manual';

const PRINTERS = listPrinters();

type Status = { kind: 'idle' } | { kind: 'saved' } | { kind: 'error'; message: string };

function errorFor(reason: Exclude<SaveProfileResult, { ok: true }>['reason']): string {
  switch (reason) {
    case 'bad_width':
      return 'Check the widths: effective must be positive and the overlap smaller than it.';
    case 'forbidden':
      return 'You do not have permission to change this shop. Try signing in again.';
    case 'invalid':
    default:
      return 'Please check the values.';
  }
}

// Parse a free-text number field. Returns null for blank so the action treats
// optional fields as "not set". Non-numeric falls through to the action's
// validation rather than guessing.
function parseOptional(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function parseRequired(raw: string): number {
  const n = Number(raw.trim());
  return Number.isFinite(n) ? n : NaN;
}

export function PrintProfileForm({
  shopId,
  initial,
}: {
  shopId: string;
  initial: ShopPrintProfileRow | null;
}) {
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // A saved profile with no printerKey was entered manually.
  const initialSelection = initial
    ? (initial.printerKey ?? MANUAL_KEY)
    : (PRINTERS[0]?.key ?? MANUAL_KEY);

  const [selection, setSelection] = useState<string>(initialSelection);
  const [nominalWidth, setNominalWidth] = useState<string>(
    initial ? String(initial.nominalWidthIn) : '',
  );
  const [effectiveOverride, setEffectiveOverride] = useState<string>(
    initial ? String(initial.effectiveWidthIn) : '',
  );
  const [overlap, setOverlap] = useState<string>(
    initial ? String(initial.defaultOverlapIn) : '0.5',
  );
  const [bleed, setBleed] = useState<string>(initial ? String(initial.bleedIn) : '0.25');
  const [mediaType, setMediaType] = useState<string>(initial?.mediaType ?? '');

  const isManual = selection === MANUAL_KEY;
  const selectedPrinter = PRINTERS.find((p) => p.key === selection) ?? null;

  function onSelectPrinter(value: string) {
    setSelection(value);
    setStatus({ kind: 'idle' });
    if (value !== MANUAL_KEY) {
      const printer = PRINTERS.find((p) => p.key === value);
      if (printer) setNominalWidth(String(printer.nominalWidthIn));
    }
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    setStatus({ kind: 'idle' });

    const raw = {
      shopId,
      printerKey: isManual ? null : selection,
      // For a known printer the registry nominal is authoritative; the field
      // shows it read-only. For manual the owner typed it.
      nominalWidthIn: isManual
        ? parseRequired(nominalWidth)
        : (selectedPrinter?.nominalWidthIn ?? parseRequired(nominalWidth)),
      effectiveOverrideIn: parseOptional(effectiveOverride),
      defaultOverlapIn: parseRequired(overlap),
      bleedIn: parseRequired(bleed),
      mediaType: mediaType.trim() === '' ? null : mediaType.trim(),
    };

    startTransition(async () => {
      try {
        const res = await saveShopPrintProfileAction(raw);
        if (res.ok) {
          setStatus({ kind: 'saved' });
        } else {
          setStatus({ kind: 'error', message: errorFor(res.reason) });
        }
      } catch {
        setStatus({ kind: 'error', message: 'Could not save. Please try again.' });
      }
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="max-w-xl rounded-lg border border-zinc-200 bg-white p-6"
      data-testid="print-profile-form"
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="printer" className="text-sm font-medium text-zinc-900">
            Printer
          </label>
          <select
            id="printer"
            value={selection}
            onChange={(e) => onSelectPrinter(e.target.value)}
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-xs focus:border-[#00AEEF] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]/30"
          >
            {PRINTERS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
            <option value={MANUAL_KEY}>Manual / other</option>
          </select>
          <p className="text-xs text-zinc-500">
            {isManual
              ? 'Enter the nominal media width for your machine below.'
              : 'Nominal width comes from the printer spec. Adjust the effective width below if your rollers eat more or less.'}
          </p>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="nominalWidth" className="text-sm font-medium text-zinc-900">
            Nominal media width (in)
          </label>
          <input
            id="nominalWidth"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={nominalWidth}
            onChange={(e) => setNominalWidth(e.target.value)}
            readOnly={!isManual}
            required={isManual}
            placeholder="e.g. 54"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-xs read-only:bg-zinc-50 read-only:text-zinc-500 focus:border-[#00AEEF] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]/30"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="effectiveOverride" className="text-sm font-medium text-zinc-900">
            Effective width override (in)
          </label>
          <input
            id="effectiveOverride"
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={effectiveOverride}
            onChange={(e) => setEffectiveOverride(e.target.value)}
            placeholder="Leave blank to auto-derive"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-xs focus:border-[#00AEEF] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]/30"
          />
          <p className="text-xs text-zinc-500">
            Optional. Blank means we subtract the roller margin from the nominal width for you.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="overlap" className="text-sm font-medium text-zinc-900">
              Default panel overlap (in)
            </label>
            <input
              id="overlap"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={overlap}
              onChange={(e) => setOverlap(e.target.value)}
              required
              className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-xs focus:border-[#00AEEF] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]/30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="bleed" className="text-sm font-medium text-zinc-900">
              Bleed (in)
            </label>
            <input
              id="bleed"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={bleed}
              onChange={(e) => setBleed(e.target.value)}
              required
              className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-xs focus:border-[#00AEEF] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]/30"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="mediaType" className="text-sm font-medium text-zinc-900">
            Media type
          </label>
          <input
            id="mediaType"
            type="text"
            value={mediaType}
            onChange={(e) => setMediaType(e.target.value)}
            placeholder="Optional, e.g. cast vinyl"
            className="h-9 rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 shadow-xs focus:border-[#00AEEF] focus:outline-none focus:ring-2 focus:ring-[#00AEEF]/30"
          />
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending} className="gap-1.5">
            {pending ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Saving
              </>
            ) : (
              'Save'
            )}
          </Button>
          {status.kind === 'saved' && (
            <span className="text-sm font-medium text-emerald-600" data-testid="profile-saved">
              Saved
            </span>
          )}
          {status.kind === 'error' && (
            <span
              className="text-sm font-medium text-red-600"
              role="alert"
              data-testid="profile-error"
            >
              {status.message}
            </span>
          )}
        </div>
      </div>
    </form>
  );
}
