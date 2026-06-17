'use client';

// Wizard step: colors (Goal 5 / B2C-005). Three input modes, all optional:
// (a) plain picker, (b) one-tap extract from the uploaded logo, (c) the real
// film-brand SKU library (3M 2080 / Avery SW900 starter set) — SKU + finish
// ride the brief into the export pack so the shop quotes a real product, not
// a hex guess.

import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, Palette, Pipette, X } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { capture } from '@/lib/analytics';
import { extractLogoColorsAction } from '@/lib/actions/brief-colors';
import type { BriefData } from '@/lib/brief/schema';
import { searchFilmLibrary, type FilmColor } from '@/lib/brief/film-library';
import { StepShell } from './steps';

const MAX_PICKS = 8; // mirrors briefSchema colors.picks.max
const ROLES = ['primary', 'secondary', 'accent'] as const;

type Pick = NonNullable<NonNullable<BriefData['colors']>['picks']>[number];

interface Props {
  projectId: string;
  data: BriefData;
  patch: (updater: (prev: BriefData) => BriefData) => void;
}

export function ColorsStep({ projectId, data, patch }: Props) {
  const picks = data.colors?.picks ?? [];
  const extracted = data.colors?.extractedFromLogo ?? [];
  const logoAssetId = data.logo?.assetId;

  const [pickerHex, setPickerHex] = useState('#1f2937');
  const [query, setQuery] = useState('');
  const [extracting, setExtracting] = useState(false);

  const results = useMemo(() => searchFilmLibrary(query, 24), [query]);
  const full = picks.length >= MAX_PICKS;

  const addPick = useCallback(
    (pick: Pick, mode: 'picker' | 'extract' | 'film') => {
      // Decide from render-scope state, BEFORE patch: the updater must stay
      // pure (React may defer/re-run it), so side effects can't live inside
      // it (PR #126 review finding #1).
      if (picks.length >= MAX_PICKS) {
        toast.message(`${MAX_PICKS} colors is the max.`);
        return;
      }
      if (picks.some((p) => p.hex === pick.hex && p.sku === pick.sku)) {
        toast.message('Already in your colors.');
        return;
      }
      patch((prev) => {
        const cur = prev.colors?.picks ?? [];
        if (cur.length >= MAX_PICKS) return prev;
        if (cur.some((p) => p.hex === pick.hex && p.sku === pick.sku)) return prev;
        return { ...prev, colors: { ...prev.colors, picks: [...cur, pick] } };
      });
      capture('brief_color_added', { projectId, mode });
    },
    [patch, projectId, picks],
  );

  const removePick = (index: number) => {
    patch((prev) => ({
      ...prev,
      colors: {
        ...prev.colors,
        picks: (prev.colors?.picks ?? []).filter((_, i) => i !== index),
      },
    }));
  };

  const setRole = (index: number, role: string) => {
    patch((prev) => ({
      ...prev,
      colors: {
        ...prev.colors,
        picks: (prev.colors?.picks ?? []).map((p, i) =>
          i === index
            ? {
                ...p,
                role: (ROLES as readonly string[]).includes(role)
                  ? (role as Pick['role'])
                  : undefined,
              }
            : p,
        ),
      },
    }));
  };

  const extractFromLogo = useCallback(async () => {
    if (!logoAssetId) return;
    setExtracting(true);
    try {
      const res = await extractLogoColorsAction({ projectId, assetId: logoAssetId });
      if (!res.ok) {
        toast.error("Couldn't read colors from the logo.");
        return;
      }
      if (res.colors.length === 0) {
        toast.message('No solid colors found in the logo.');
        return;
      }
      patch((prev) => ({
        ...prev,
        colors: { ...prev.colors, extractedFromLogo: res.colors.slice(0, 8) },
      }));
      capture('brief_logo_colors_extracted', { projectId, count: res.colors.length });
    } catch {
      toast.error("Couldn't read colors from the logo.");
    } finally {
      setExtracting(false);
    }
  }, [logoAssetId, projectId, patch]);

  return (
    <StepShell
      title="Colors"
      hint="Optional. Pick anything — anchoring a color to a real film SKU means your shop can quote the exact product."
    >
      {/* Selected picks */}
      {picks.length > 0 ? (
        <ul className="mb-5 flex flex-col gap-2" data-testid="color-picks">
          {picks.map((p, i) => (
            <li
              key={`${p.hex}-${p.sku ?? ''}`}
              className="flex items-center gap-3 rounded-md border border-zinc-200 bg-white p-2"
            >
              <span
                className="size-8 shrink-0 rounded border border-zinc-200"
                style={{ backgroundColor: p.hex }}
                aria-hidden
              />
              <span className="min-w-0 flex-1 text-sm">
                <span className="font-mono">{p.hex}</span>
                {p.name ? <span className="text-zinc-500"> — {p.name}</span> : null}
                {p.sku ? (
                  <span className="block truncate text-xs text-zinc-500">
                    {p.brand} {p.sku}
                    {p.finish ? ` · ${p.finish}` : ''}
                  </span>
                ) : null}
              </span>
              <select
                value={p.role ?? ''}
                onChange={(e) => setRole(i, e.target.value)}
                aria-label={`Role for ${p.name ?? p.hex}`}
                className="rounded border border-zinc-200 p-1 text-xs text-zinc-600"
              >
                <option value="">role…</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => removePick(i)}
                aria-label={`Remove ${p.name ?? p.hex}`}
                className="rounded-full p-1 text-zinc-500 hover:text-zinc-700"
              >
                <X className="size-4" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-5 rounded-md border border-dashed border-zinc-300 p-4 text-center text-sm text-zinc-500">
          No colors yet — add from any of the three ways below.
        </p>
      )}

      {/* Mode a: picker */}
      <div className="mb-5 flex items-center gap-3">
        <input
          type="color"
          value={pickerHex}
          onChange={(e) => setPickerHex(e.target.value)}
          aria-label="Pick a color"
          data-testid="color-picker-input"
          className="h-9 w-12 cursor-pointer rounded border border-zinc-200"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={full}
          onClick={() => addPick({ hex: pickerHex }, 'picker')}
          data-testid="color-picker-add"
        >
          <Palette className="size-4" aria-hidden /> Add this color
        </Button>
      </div>

      {/* Mode b: extract from logo */}
      <div className="mb-5">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!logoAssetId || extracting}
            onClick={() => void extractFromLogo()}
            data-testid="color-extract"
          >
            {extracting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Pipette className="size-4" aria-hidden />
            )}
            Pull colors from my logo
          </Button>
          {!logoAssetId ? (
            <span className="text-xs text-zinc-500">Upload a logo first (Logo step).</span>
          ) : null}
        </div>
        {extracted.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2" data-testid="color-extracted">
            {extracted.map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => addPick({ hex }, 'extract')}
                disabled={full}
                title={`Add ${hex}`}
                data-testid={`color-extracted-${hex.slice(1)}`}
                className="flex items-center gap-1.5 rounded-full border border-zinc-200 py-1 pl-1.5 pr-2.5 text-xs hover:border-zinc-400"
              >
                <span
                  className="size-5 rounded-full border border-zinc-200"
                  style={{ backgroundColor: hex }}
                  aria-hidden
                />
                <span className="font-mono">{hex}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {/* Mode c: film library */}
      <div>
        <label className="mb-1 block text-sm font-medium" htmlFor="film-search">
          Real film colors (3M 2080 · Avery SW900)
        </label>
        <input
          id="film-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder='Search by name, code, or finish — e.g. "satin black", "G13", "matte"'
          data-testid="film-search"
          className="mb-2 w-full rounded-md border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        />
        <ul
          className="grid max-h-64 grid-cols-1 gap-1.5 overflow-y-auto sm:grid-cols-2"
          data-testid="film-results"
        >
          {results.map((c: FilmColor) => (
            <li key={c.sku}>
              <button
                type="button"
                onClick={() =>
                  addPick(
                    { hex: c.hex, brand: c.brand, sku: c.sku, name: c.name, finish: c.finish },
                    'film',
                  )
                }
                disabled={full}
                data-testid={`film-${c.sku}`}
                className="flex w-full items-center gap-2 rounded-md border border-zinc-200 p-2 text-left text-xs hover:border-zinc-400"
              >
                <span
                  className="size-7 shrink-0 rounded border border-zinc-200"
                  style={{ backgroundColor: c.hex }}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.name}</span>
                  <span className="block truncate text-zinc-500">
                    {c.brand} {c.sku} · {c.finish}
                  </span>
                </span>
              </button>
            </li>
          ))}
          {results.length === 0 ? (
            <li className="p-2 text-xs text-zinc-500">No matches — try a color or finish name.</li>
          ) : null}
        </ul>
        <p className="mt-2 text-xs text-zinc-500">
          On-screen swatches are close, not exact — your shop confirms against a physical sample.
        </p>
      </div>
    </StepShell>
  );
}
