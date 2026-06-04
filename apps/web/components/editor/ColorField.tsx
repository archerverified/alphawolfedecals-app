'use client';

// Color control for the editor inspector (Goal 3a PR3). Presentational: it never
// touches the document store — the parent commits each change as one undoable
// `updateElements` Command. Built from existing shadcn primitives (Popover, Input,
// Button) rather than a new dependency, per ADR-0013 (no new server-external deps).
//
// Three input affordances, all funnelling through `onCommit`:
//   1. preset swatches (common vinyl-wrap colors) — one click = one commit
//   2. the OS color picker (<input type="color">) — commits on `change` (dialog close)
//   3. a hex text field — commits on Enter / blur when the value parses
// `allowNone` adds a "None" choice (shape fill/stroke are nullable in the schema).

import { useEffect, useState } from 'react';
import { Check, Ban } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { Input } from '@alphawolf/ui/components/ui/input';
import { Label } from '@alphawolf/ui/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@alphawolf/ui/components/ui/popover';

// A compact vinyl-wrap palette: neutrals + the brand-ish accents customers reach
// for most. Kept small so the grid stays scannable; the OS picker covers the rest.
const PRESETS = [
  '#000000',
  '#ffffff',
  '#71717a',
  '#ef4444',
  '#f97316',
  '#f59e0b',
  '#eab308',
  '#22c55e',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#a855f7',
  '#0ea5e9',
] as const;

const HEX_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/**
 * Interpret a hex text-field value. Returns the normalized (lowercased) hex to
 * commit, `null` when the field is blank and `allowNone`, or `{ ok: false }` when
 * it doesn't parse (caller reverts). Pure + exported so it's unit-testable without
 * driving the Radix popover in jsdom.
 */
export function parseHexInput(
  raw: string,
  allowNone: boolean,
): { ok: true; value: string | null } | { ok: false } {
  const v = raw.trim();
  if (v === '') return allowNone ? { ok: true, value: null } : { ok: false };
  return HEX_RE.test(v) ? { ok: true, value: v.toLowerCase() } : { ok: false };
}

/** Expand `#abc` → `#aabbcc` so the OS <input type="color"> accepts it. */
function toLongHex(value: string | null): string {
  if (!value) return '#000000';
  const v = value.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return HEX_RE.test(v) ? v : '#000000';
}

interface Props {
  label: string;
  /** Current color (hex) or null when unset / "none". */
  value: string | null;
  /** Commit a new color, or null when the user picks "None". */
  onCommit: (next: string | null) => void;
  /** Show a "None" option (shape fill/stroke can be null). */
  allowNone?: boolean;
  testId?: string;
}

export function ColorField({ label, value, onCommit, allowNone = false, testId }: Props) {
  // Local draft for the hex text field so typing doesn't commit on every keystroke.
  const [draft, setDraft] = useState(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);

  const commitDraft = () => {
    const parsed = parseHexInput(draft, allowNone);
    if (parsed.ok) onCommit(parsed.value);
    else setDraft(value ?? ''); // reject: revert to the last good value
  };

  const isNone = value == null;

  return (
    <div className="flex items-center justify-between gap-2">
      <Label className="text-xs text-zinc-600">{label}</Label>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-testid={testId}
            className="h-8 gap-2 px-2"
            aria-label={`${label}: ${isNone ? 'none' : value}`}
          >
            <span
              className="size-4 rounded-sm border border-zinc-300"
              style={
                isNone
                  ? {
                      // Checkerboard = "no color".
                      backgroundImage:
                        'linear-gradient(45deg,#d4d4d8 25%,transparent 25%,transparent 75%,#d4d4d8 75%),linear-gradient(45deg,#d4d4d8 25%,transparent 25%,transparent 75%,#d4d4d8 75%)',
                      backgroundSize: '6px 6px',
                      backgroundPosition: '0 0,3px 3px',
                    }
                  : { backgroundColor: value }
              }
            />
            <span className="font-mono text-xs uppercase">{isNone ? 'None' : value}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-56" align="end">
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-8 gap-1.5" role="group" aria-label={`${label} presets`}>
              {PRESETS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => onCommit(c)}
                  className="relative flex size-5 items-center justify-center rounded-sm border border-zinc-300 outline-none focus-visible:ring-2 focus-visible:ring-zinc-400"
                  style={{ backgroundColor: c }}
                >
                  {value?.toLowerCase() === c ? (
                    <Check className="size-3 text-white mix-blend-difference" />
                  ) : null}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="color"
                aria-label={`${label} custom color`}
                value={toLongHex(value)}
                onChange={(e) => onCommit(e.target.value)}
                className="h-8 w-9 cursor-pointer rounded-sm border border-zinc-300 bg-transparent p-0.5"
              />
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitDraft}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    commitDraft();
                  }
                }}
                placeholder="#000000"
                aria-label={`${label} hex value`}
                className="h-8 font-mono text-xs"
              />
              {allowNone ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Clear ${label}`}
                  title="None"
                  onClick={() => onCommit(null)}
                  className="size-8 shrink-0"
                >
                  <Ban className="size-4" />
                </Button>
              ) : null}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
