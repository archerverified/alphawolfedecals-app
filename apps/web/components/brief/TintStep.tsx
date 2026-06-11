'use client';

// Wizard step: window tint (Goal 5 / B2C-006). Per-window VLT % with a live
// darkness preview, plus the state-legality check — pick your U.S. state and
// every selection shows legal / close-to-the-line / not-legal from the static
// law table (lib/brief/tint-laws.ts). The inline check is the trust signal no
// competitor ships; the disclaimer keeps it honest.

import { CheckCircle2, CircleAlert, TriangleAlert } from 'lucide-react';
import { capture } from '@/lib/analytics';
import type { BriefData } from '@/lib/brief/schema';
import {
  TINT_LAWS,
  TINT_WINDOWS,
  tintVerdict,
  TINT_LAW_VERSION,
  type TintWindow,
} from '@/lib/brief/tint-laws';
import { StepShell } from './steps';

// Common shop options, darkest → lightest ("5%" = limo).
const VLT_CHOICES = [5, 15, 20, 25, 35, 50, 70] as const;

interface Props {
  projectId: string;
  data: BriefData;
  patch: (updater: (prev: BriefData) => BriefData) => void;
}

export function TintStep({ projectId, data, patch }: Props) {
  const stateCode = data.tint?.state ?? '';
  const perWindow = data.tint?.perWindow ?? {};

  const setState = (code: string) => {
    patch((prev) => ({
      ...prev,
      tint: { ...prev.tint, state: code || undefined },
    }));
    if (code) capture('brief_tint_state_selected', { projectId, state: code });
  };

  const setVlt = (window: TintWindow, vlt: number | null) => {
    patch((prev) => {
      const next = { ...(prev.tint?.perWindow ?? {}) };
      if (vlt === null) delete next[window];
      else next[window] = vlt;
      return { ...prev, tint: { ...prev.tint, perWindow: next } };
    });
  };

  return (
    <StepShell
      title="Window tint"
      hint="Optional. Pick a darkness per window — choose your state and we'll show what's street-legal there."
    >
      <div className="mb-5">
        <label className="mb-1 block text-sm font-medium" htmlFor="tint-state">
          Your state
        </label>
        <select
          id="tint-state"
          value={stateCode}
          onChange={(e) => setState(e.target.value)}
          data-testid="tint-state"
          className="w-full max-w-xs rounded-md border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        >
          <option value="">Choose a state (optional)</option>
          {TINT_LAWS.map((s) => (
            <option key={s.code} value={s.code}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      <ul className="flex flex-col gap-4">
        {TINT_WINDOWS.map((w) => {
          const selected = perWindow[w.key];
          const verdict =
            stateCode && typeof selected === 'number'
              ? tintVerdict(stateCode, w.key, selected)
              : null;
          return (
            <li key={w.key} className="rounded-md border border-zinc-200 bg-white p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{w.label}</span>
                {typeof selected === 'number' ? (
                  <button
                    type="button"
                    onClick={() => setVlt(w.key, null)}
                    className="text-xs text-zinc-400 underline hover:text-zinc-600"
                  >
                    clear
                  </button>
                ) : (
                  <span className="text-xs text-zinc-400">no tint</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {VLT_CHOICES.map((v) => {
                  const on = selected === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setVlt(w.key, on ? null : v)}
                      aria-pressed={on}
                      data-testid={`tint-${w.key}-${v}`}
                      className={
                        'flex flex-col items-center gap-1 rounded-md border px-2.5 py-1.5 transition-colors ' +
                        (on
                          ? 'border-zinc-900 ring-1 ring-zinc-900'
                          : 'border-zinc-200 hover:border-zinc-400')
                      }
                    >
                      {/* Live darkness swatch: lower VLT = darker glass. */}
                      <span
                        aria-hidden
                        className="h-5 w-8 rounded-sm border border-zinc-300"
                        style={{
                          background: `linear-gradient(180deg, rgba(160,200,230,1), rgba(190,210,225,1))`,
                          boxShadow: `inset 0 0 0 100px rgba(10,12,16,${(100 - v) / 100})`,
                        }}
                      />
                      <span className="text-xs">{v}%</span>
                    </button>
                  );
                })}
              </div>
              {verdict ? (
                <p
                  className={
                    'mt-2 flex items-start gap-1.5 text-xs ' +
                    (verdict.status === 'legal'
                      ? 'text-emerald-700'
                      : verdict.status === 'close'
                        ? 'text-amber-700'
                        : 'text-red-700')
                  }
                  data-testid={`tint-verdict-${w.key}`}
                  data-status={verdict.status}
                >
                  {verdict.status === 'legal' ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  ) : verdict.status === 'close' ? (
                    <CircleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  )}
                  {verdict.note}
                </p>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="mt-4 text-xs text-zinc-400">
        Passenger-car rules (table v{TINT_LAW_VERSION}). Vans and SUVs often allow darker glass
        behind the driver. Laws change — your installer confirms what&apos;s legal before any film
        goes on. {/* LEGAL-PASS FLAG: final disclaimer wording needs Archer's review (PRD §8). */}
      </p>
    </StepShell>
  );
}
