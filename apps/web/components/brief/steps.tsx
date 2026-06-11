'use client';

// Brief wizard step components (Goal 5 / B2C-002). Functional baseline UIs:
// zones is a panel checklist here and becomes the clickable SVG diagram in
// B2C-003; photos/logo/colors/tint activate in B2C-004/005/006. Copy style:
// simple, direct, no jargon.

import type { ReactNode } from 'react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { ZoneDiagram } from './ZoneDiagram';
import {
  BRIEF_STYLE_PRESETS,
  MATERIAL_TIERS,
  type BriefData,
  type BriefStepKey,
} from '@/lib/brief/schema';

export interface BriefPanel {
  id: string;
  name: string;
  view: string;
  /** SVG path of the panel outline (template space). Absent → list-only UI. */
  outlinePath?: string;
}

interface StepProps {
  data: BriefData;
  patch: (updater: (prev: BriefData) => BriefData) => void;
}

export function StepShell({
  title,
  hint,
  children,
}: {
  title: string;
  hint: string;
  children: ReactNode;
}) {
  return (
    <div>
      <h2 className="text-lg font-medium">{title}</h2>
      <p className="mb-4 mt-1 text-sm text-zinc-500">{hint}</p>
      {children}
    </div>
  );
}

const textareaClass =
  'w-full rounded-md border border-zinc-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400';

// --- Zones (B2C-003: clickable panel diagram + accessible checklist) ---------

export function ZonesStep({ data, patch, panels }: StepProps & { panels: BriefPanel[] }) {
  const included = data.zones?.includedPanelIds ?? null; // null = full wrap
  const isIncluded = (id: string) => included === null || included.includes(id);

  const toggle = (id: string) => {
    patch((prev) => {
      const current = prev.zones?.includedPanelIds ?? null;
      const base = current === null ? panels.map((p) => p.id) : current;
      const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
      // Selecting every panel returns to the "full wrap" default state.
      const includedPanelIds = next.length === panels.length ? null : next;
      return { ...prev, zones: { includedPanelIds } };
    });
  };

  return (
    <StepShell
      title="Which parts of the vehicle get wrapped?"
      hint="Everything is included by default (full wrap). Tap a panel to leave it out."
    >
      {panels.length === 0 ? (
        <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          This vehicle template doesn&apos;t have its panel breakdown yet. You can keep going — the
          rest of your brief still applies to the whole vehicle.
        </p>
      ) : (
        <>
          {panels.some((p) => p.outlinePath) ? (
            <div className="mb-4 rounded-md border border-zinc-200 bg-white p-4">
              <ZoneDiagram panels={panels} includedPanelIds={included} onToggle={toggle} />
            </div>
          ) : null}
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {panels.map((p) => {
              const on = isIncluded(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => toggle(p.id)}
                    aria-pressed={on}
                    data-testid={`zone-toggle-${p.id}`}
                    className={
                      'flex w-full items-center justify-between rounded-md border p-3 text-left text-sm transition-colors ' +
                      (on
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400')
                    }
                  >
                    <span>{p.name}</span>
                    <span className="text-xs opacity-70">{p.view}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs text-zinc-400" data-testid="zone-summary">
        {included === null
          ? 'Full wrap — every panel included.'
          : `${included.length} of ${panels.length} panels included.`}
      </p>
    </StepShell>
  );
}

// --- Style & ideas -----------------------------------------------------------

export function StyleStep({ data, patch }: StepProps) {
  const presets = data.style?.presets ?? [];
  const togglePreset = (p: (typeof BRIEF_STYLE_PRESETS)[number]) => {
    patch((prev) => {
      const cur = prev.style?.presets ?? [];
      const next = cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p];
      return { ...prev, style: { ...prev.style, presets: next } };
    });
  };

  return (
    <StepShell
      title="What look are you going for?"
      hint="Pick any styles that fit, then describe it in your own words."
    >
      <div className="mb-4 flex flex-wrap gap-2">
        {BRIEF_STYLE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => togglePreset(p)}
            aria-pressed={presets.includes(p)}
            className={
              'rounded-full border px-3 py-1 text-sm transition-colors ' +
              (presets.includes(p)
                ? 'border-zinc-900 bg-zinc-900 text-white'
                : 'border-zinc-200 text-zinc-600 hover:border-zinc-400')
            }
          >
            {p}
          </button>
        ))}
      </div>
      <textarea
        className={textareaClass}
        rows={4}
        maxLength={2000}
        placeholder='e.g. "clean contractor look, navy + white, subtle pinstripe"'
        value={data.style?.prompt ?? ''}
        onChange={(e) =>
          patch((prev) => ({ ...prev, style: { ...prev.style, prompt: e.target.value } }))
        }
        data-testid="style-prompt"
      />
    </StepShell>
  );
}

// --- Per-zone notes ----------------------------------------------------------

export function ZoneNotesStep({ data, patch, panels }: StepProps & { panels: BriefPanel[] }) {
  const included = data.zones?.includedPanelIds ?? null;
  const activePanels = included === null ? panels : panels.filter((p) => included.includes(p.id));

  return (
    <StepShell
      title="Anything specific per panel?"
      hint='Optional. e.g. "keep the hood mostly black", "phone number large on rear doors".'
    >
      {activePanels.length === 0 ? (
        <p className="text-sm text-zinc-500">No panels included — nothing to note here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {activePanels.map((p) => (
            <li key={p.id}>
              <label className="mb-1 block text-sm font-medium">{p.name}</label>
              <textarea
                className={textareaClass}
                rows={2}
                maxLength={500}
                value={data.zoneNotes?.[p.id] ?? ''}
                onChange={(e) =>
                  patch((prev) => {
                    const zoneNotes = { ...prev.zoneNotes };
                    if (e.target.value) zoneNotes[p.id] = e.target.value;
                    else delete zoneNotes[p.id];
                    return { ...prev, zoneNotes };
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </StepShell>
  );
}

// --- Materials ---------------------------------------------------------------

export function MaterialsStep({ data, patch }: StepProps) {
  return (
    <StepShell
      title="Vinyl material"
      hint="This prints on your spec pack as the recommended material. Your shop has the final word."
    >
      <ul className="flex flex-col gap-2">
        {MATERIAL_TIERS.map((t) => {
          const on = data.materials?.tier === t.id;
          return (
            <li key={t.id}>
              <button
                type="button"
                onClick={() =>
                  patch((prev) => ({
                    ...prev,
                    materials: { tier: on ? undefined : t.id },
                  }))
                }
                aria-pressed={on}
                className={
                  'flex w-full items-center justify-between gap-3 rounded-md border p-3 text-left transition-colors ' +
                  (on
                    ? 'border-zinc-900 ring-1 ring-zinc-900'
                    : 'border-zinc-200 hover:border-zinc-400')
                }
              >
                <span>
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-xs text-zinc-500">{t.blurb}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-zinc-500">{t.cost}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </StepShell>
  );
}

// --- Extras ------------------------------------------------------------------

const EXTRA_TOGGLES = [
  { key: 'chromeDelete', label: 'Chrome delete', blurb: 'Black out the chrome trim.' },
  { key: 'roofOnlyColorChange', label: 'Roof color change', blurb: 'Different color up top.' },
  { key: 'pinstripeAccent', label: 'Pinstripe / accents', blurb: 'Thin accent lines or stripes.' },
  {
    key: 'ppfZones',
    label: 'Paint protection film',
    blurb: 'Clear protection on high-wear areas.',
  },
] as const;

export function ExtrasStep({ data, patch }: StepProps) {
  return (
    <StepShell
      title="Extras"
      hint="All free to put on the brief — they help your shop quote the full job."
    >
      <ul className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {EXTRA_TOGGLES.map((t) => {
          const on = Boolean(data.extras?.[t.key]);
          return (
            <li key={t.key}>
              <button
                type="button"
                onClick={() =>
                  patch((prev) => ({
                    ...prev,
                    extras: { ...prev.extras, [t.key]: !on },
                  }))
                }
                aria-pressed={on}
                className={
                  'w-full rounded-md border p-3 text-left transition-colors ' +
                  (on
                    ? 'border-zinc-900 ring-1 ring-zinc-900'
                    : 'border-zinc-200 hover:border-zinc-400')
                }
              >
                <span className="block text-sm font-medium">{t.label}</span>
                <span className="block text-xs text-zinc-500">{t.blurb}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <label className="mb-1 block text-sm font-medium">DOT / MC number (fleet)</label>
      <input
        type="text"
        maxLength={40}
        className="w-full rounded-md border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
        placeholder="e.g. USDOT 1234567"
        value={data.extras?.dotNumber ?? ''}
        onChange={(e) =>
          patch((prev) => ({
            ...prev,
            extras: { ...prev.extras, dotNumber: e.target.value || undefined },
          }))
        }
      />
    </StepShell>
  );
}

// --- Notes for the AI ----------------------------------------------------------

export function NotesStep({ data, patch }: StepProps) {
  return (
    <StepShell
      title="Anything else?"
      hint="Catch-all notes. The design assistant reads these word for word."
    >
      <textarea
        className={textareaClass}
        rows={6}
        maxLength={4000}
        placeholder="Anything you couldn't fit in the other steps."
        value={data.aiNotes ?? ''}
        onChange={(e) => patch((prev) => ({ ...prev, aiNotes: e.target.value || undefined }))}
      />
    </StepShell>
  );
}

// --- Review ------------------------------------------------------------------

export function ReviewStep({
  data,
  panels,
  vehicleLabel,
  onJumpTo,
}: {
  data: BriefData;
  panels: BriefPanel[];
  vehicleLabel: string;
  onJumpTo: (key: BriefStepKey) => void;
}) {
  const included = data.zones?.includedPanelIds ?? null;
  const zoneSummary =
    included === null
      ? 'Full wrap'
      : included.length === 0
        ? 'No panels selected'
        : panels
            .filter((p) => included.includes(p.id))
            .map((p) => p.name)
            .join(', ');
  const tier = MATERIAL_TIERS.find((t) => t.id === data.materials?.tier);
  const extras = [
    data.extras?.chromeDelete && 'Chrome delete',
    data.extras?.roofOnlyColorChange && 'Roof color change',
    data.extras?.pinstripeAccent && 'Pinstripe / accents',
    data.extras?.ppfZones && 'PPF',
    data.extras?.dotNumber && `DOT: ${data.extras.dotNumber}`,
  ].filter(Boolean);

  // Intersect with currently-included zones: an assignment to a later-excluded
  // panel must not print on the review (PR #125 review finding #3).
  const logoZones = (data.logo?.zonePanelIds ?? [])
    .filter((id) => included === null || included.includes(id))
    .map((id) => panels.find((p) => p.id === id)?.name)
    .filter(Boolean);

  const rows: Array<{ key: BriefStepKey; label: string; value: string }> = [
    { key: 'zones', label: 'Zones', value: zoneSummary },
    {
      key: 'photos',
      label: 'Vehicle photos',
      value: data.photos?.length ? `${data.photos.length} photo(s)` : '—',
    },
    {
      key: 'logo',
      label: 'Logo',
      value: data.logo?.assetId
        ? [data.logo.fileName ?? 'Uploaded', logoZones.length ? `on ${logoZones.join(', ')}` : null]
            .filter(Boolean)
            .join(' — ')
        : '—',
    },
    {
      key: 'colors',
      label: 'Colors',
      value: (data.colors?.picks ?? []).length
        ? (data.colors?.picks ?? []).map((p) => (p.sku ? `${p.sku} (${p.hex})` : p.hex)).join(', ')
        : '—',
    },
    {
      key: 'style',
      label: 'Style',
      value:
        [...(data.style?.presets ?? []), data.style?.prompt].filter(Boolean).join(' — ') || '—',
    },
    {
      key: 'zoneNotes',
      label: 'Zone notes',
      value: Object.keys(data.zoneNotes ?? {}).length
        ? `${Object.keys(data.zoneNotes ?? {}).length} panel note(s)`
        : '—',
    },
    { key: 'materials', label: 'Material', value: tier ? `${tier.label} (${tier.cost})` : '—' },
    {
      key: 'tint',
      label: 'Tint',
      value: (() => {
        const windows = Object.entries(data.tint?.perWindow ?? {});
        if (windows.length === 0) return '—';
        const parts = windows.map(([w, v]) => `${w.replace('_', ' ')} ${v}%`);
        return [data.tint?.state, ...parts].filter(Boolean).join(' — ');
      })(),
    },
    { key: 'extras', label: 'Extras', value: extras.length ? extras.join(', ') : '—' },
    { key: 'aiNotes', label: 'Notes', value: data.aiNotes ? data.aiNotes.slice(0, 120) : '—' },
  ];

  return (
    <StepShell
      title="Review your brief"
      hint={`Everything below goes on the spec for your ${vehicleLabel}. Tap a row to change it.`}
    >
      <dl className="divide-y divide-zinc-100 rounded-md border border-zinc-200">
        {rows.map((r) => (
          <div key={r.key} className="flex items-start justify-between gap-4 p-3">
            <dt className="shrink-0 text-sm text-zinc-500">{r.label}</dt>
            <dd className="flex-1 truncate text-right text-sm">{r.value}</dd>
            <Button variant="ghost" size="sm" className="shrink-0" onClick={() => onJumpTo(r.key)}>
              Edit
            </Button>
          </div>
        ))}
      </dl>
      <p className="mt-4 text-xs text-zinc-400">
        Saving freezes this brief as a numbered version. You can keep editing afterwards — and
        export your spec pack any time.
      </p>
    </StepShell>
  );
}
