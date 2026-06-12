'use client';

// Template Studio authoring workspace (Goal 6 D1, stages 2–5). The operator
// draws panel regions over the source backdrop, names them, calibrates each
// view against a real measurement, and saves/publishes. All coordinates are
// SHEET-ABSOLUTE (per-view transforms stay at 0,0) — the editor and zone
// selector re-layout views from content bboxes, so only relative geometry
// matters downstream, and absolute coords keep the backdrop aligned 1:1.
//
// Heavy logic (validation, wrap-safe insets, calibration math) lives server-
// side in lib/studio/author.ts — this component only edits points and posts
// the JSON payload.

import { useMemo, useRef, useState } from 'react';
import { useActionState } from 'react';
import { CSRF_FIELD_NAME } from '@alphawolf/auth';
import { geometry } from '@alphawolf/canvas';
import {
  publishStudioVehicleAction,
  saveStudioPanelsAction,
  type StudioActionState,
} from '../../lib/actions/studio';

const SHEET_W = 1920;
const SHEET_H = 1080;
const VIEWS = ['front', 'driver', 'back', 'passenger', 'top'] as const;
const FINISHES = ['gloss', 'satin', 'matte', 'chrome', 'carbon', 'brushed', 'none'] as const;

type ViewName = (typeof VIEWS)[number];

type ClientPanel = {
  key: number;
  view: ViewName;
  name: string;
  points: Array<[number, number]>;
  finishHint: (typeof FINISHES)[number];
  installOrder: number;
  notes: string;
};

type ViewConfig = { spanUnits: number; axis: 'length' | 'width' | 'height' };

export type StudioWorkspaceProps = {
  vehicle: {
    id: string;
    title: string;
    lengthMm: number;
    widthMm: number;
    heightMm: number;
    status: string;
    panels: Array<{
      name: string;
      view: string;
      svgPath: string;
      finishHint: string;
      installOrder: number;
      notes: string | null;
    }>;
  };
  backdropUrl: string | null;
  csrfToken: string;
  openRequests: Array<{ id: string; label: string }>;
};

const defaultAxis = (view: ViewName): ViewConfig['axis'] =>
  view === 'front' || view === 'back' ? 'width' : 'length';

function pointsFromPath(d: string): Array<[number, number]> | null {
  try {
    const ring = geometry.parsePath(d)[0];
    if (!ring || ring.length < 3) return null;
    return ring.map((p) => [p[0]!, p[1]!]);
  } catch {
    return null;
  }
}

const pathFromPoints = (pts: Array<[number, number]>): string =>
  `M${pts.map(([x, y]) => `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`).join(' L')} Z`;

const initialState: StudioActionState = { ok: false };

export function StudioWorkspace({
  vehicle,
  backdropUrl,
  csrfToken,
  openRequests,
}: StudioWorkspaceProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nextKey = useRef(1);

  const [panels, setPanels] = useState<ClientPanel[]>(() =>
    vehicle.panels.flatMap((p) => {
      const points = pointsFromPath(p.svgPath);
      if (!points) return [];
      return [
        {
          key: nextKey.current++,
          view: (VIEWS.includes(p.view as ViewName) ? p.view : 'driver') as ViewName,
          name: p.name,
          points,
          finishHint: (FINISHES.includes(p.finishHint as (typeof FINISHES)[number])
            ? p.finishHint
            : 'gloss') as (typeof FINISHES)[number],
          installOrder: p.installOrder,
          notes: p.notes ?? '',
        },
      ];
    }),
  );
  const [viewConfigs, setViewConfigs] = useState<Partial<Record<ViewName, ViewConfig>>>({});
  const [activeView, setActiveView] = useState<ViewName>('driver');
  const [selectedKey, setSelectedKey] = useState<number | null>(null);
  const [mode, setMode] = useState<'select' | 'draw' | 'measure'>('draw');
  const [draft, setDraft] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(
    null,
  );
  const [measureStart, setMeasureStart] = useState<[number, number] | null>(null);
  const [backdropOpacity, setBackdropOpacity] = useState(0.6);
  const [provenanceNote, setProvenanceNote] = useState(
    'Authored over Alpha Wolf owned source material uploaded to this vehicle’s Studio sources.',
  );

  const drag = useRef<
    | { kind: 'vertex'; key: number; index: number }
    | { kind: 'panel'; key: number; lastX: number; lastY: number }
    | null
  >(null);

  const usedViews = useMemo(() => [...new Set(panels.map((p) => p.view))], [panels]);

  const toSheet = (e: React.PointerEvent): [number, number] => {
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    return [
      ((e.clientX - rect.left) / rect.width) * SHEET_W,
      ((e.clientY - rect.top) / rect.height) * SHEET_H,
    ];
  };

  const configFor = (view: ViewName): ViewConfig =>
    viewConfigs[view] ?? { spanUnits: 0, axis: defaultAxis(view) };

  const setConfig = (view: ViewName, patch: Partial<ViewConfig>): void =>
    setViewConfigs((c) => ({ ...c, [view]: { ...configFor(view), ...patch } }));

  // --- pointer handlers -------------------------------------------------------

  const capturePointer = (e: React.PointerEvent): void => {
    // Without capture, releasing the button outside the SVG never fires
    // pointerup — the drag/draft sticks to the next hover and silently moves
    // authored geometry (PR #137 review fix).
    svgRef.current?.setPointerCapture(e.pointerId);
  };

  const clearInteraction = (): void => {
    drag.current = null;
    setDraft(null);
  };

  const onPointerDown = (e: React.PointerEvent): void => {
    capturePointer(e);
    const [x, y] = toSheet(e);
    if (mode === 'draw') {
      setDraft({ x0: x, y0: y, x1: x, y1: y });
    } else if (mode === 'measure') {
      if (!measureStart) {
        setMeasureStart([x, y]);
      } else {
        const span = Math.hypot(x - measureStart[0], y - measureStart[1]);
        if (span > 1) setConfig(activeView, { spanUnits: Math.round(span * 100) / 100 });
        setMeasureStart(null);
        setMode('select');
      }
    }
  };

  const onPointerMove = (e: React.PointerEvent): void => {
    const [x, y] = toSheet(e);
    if (mode === 'draw' && draft) {
      setDraft({ ...draft, x1: x, y1: y });
      return;
    }
    const d = drag.current;
    if (!d) return;
    setPanels((ps) =>
      ps.map((p) => {
        if (p.key !== (d.kind === 'vertex' ? d.key : d.key)) return p;
        if (d.kind === 'vertex') {
          const pts = p.points.map((pt, i) => (i === d.index ? ([x, y] as [number, number]) : pt));
          return { ...p, points: pts };
        }
        const dx = x - d.lastX;
        const dy = y - d.lastY;
        drag.current = { ...d, lastX: x, lastY: y };
        return { ...p, points: p.points.map(([px, py]) => [px + dx, py + dy]) };
      }),
    );
  };

  const onPointerUp = (): void => {
    drag.current = null;
    if (mode === 'draw' && draft) {
      const x = Math.min(draft.x0, draft.x1);
      const y = Math.min(draft.y0, draft.y1);
      const w = Math.abs(draft.x1 - draft.x0);
      const h = Math.abs(draft.y1 - draft.y0);
      setDraft(null);
      if (w > 8 && h > 8) {
        const key = nextKey.current++;
        setPanels((ps) => [
          ...ps,
          {
            key,
            view: activeView,
            name: `${activeView} panel ${ps.filter((p) => p.view === activeView).length + 1}`,
            points: [
              [x, y],
              [x + w, y],
              [x + w, y + h],
              [x, y + h],
            ],
            finishHint: 'gloss',
            installOrder: ps.length + 1,
            notes: '',
          },
        ]);
        setSelectedKey(key);
        setMode('select');
      }
    }
  };

  const insertVertex = (panel: ClientPanel, edgeIndex: number): void => {
    const a = panel.points[edgeIndex]!;
    const b = panel.points[(edgeIndex + 1) % panel.points.length]!;
    const mid: [number, number] = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    setPanels((ps) =>
      ps.map((p) =>
        p.key === panel.key
          ? {
              ...p,
              points: [...p.points.slice(0, edgeIndex + 1), mid, ...p.points.slice(edgeIndex + 1)],
            }
          : p,
      ),
    );
  };

  const removeVertex = (panel: ClientPanel, index: number): void => {
    if (panel.points.length <= 3) return;
    setPanels((ps) =>
      ps.map((p) =>
        p.key === panel.key ? { ...p, points: p.points.filter((_, i) => i !== index) } : p,
      ),
    );
  };

  const updatePanel = (key: number, patch: Partial<ClientPanel>): void =>
    setPanels((ps) => ps.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const deletePanel = (key: number): void => {
    setPanels((ps) => ps.filter((p) => p.key !== key));
    if (selectedKey === key) setSelectedKey(null);
  };

  // --- serialization -----------------------------------------------------------

  const payload = useMemo(() => {
    const views = usedViews.map((view) => ({
      view,
      translate: { x: 0, y: 0 },
      spanUnits: configFor(view).spanUnits,
      axis: configFor(view).axis,
      panels: panels
        .filter((p) => p.view === view)
        .map((p) => ({
          name: p.name,
          outlinePath: pathFromPoints(p.points),
          finishHint: p.finishHint,
          installOrder: p.installOrder,
          ...(p.notes.trim() ? { notes: p.notes.trim() } : {}),
        })),
    }));
    return JSON.stringify({
      viewBox: { width: SHEET_W, height: SHEET_H },
      provenanceNote,
      views,
    });
  }, [panels, viewConfigs, usedViews, provenanceNote]);

  const calibrationMissing = usedViews.filter((v) => configFor(v).spanUnits <= 0);

  const [saveState, saveAction, savePending] = useActionState<StudioActionState, FormData>(
    saveStudioPanelsAction,
    initialState,
  );
  const [publishState, publishAction, publishPending] = useActionState<StudioActionState, FormData>(
    publishStudioVehicleAction,
    initialState,
  );

  const selected = panels.find((p) => p.key === selectedKey) ?? null;
  const mmPerUnit = (view: ViewName): number | null => {
    const cfg = configFor(view);
    if (cfg.spanUnits <= 0) return null;
    const real =
      cfg.axis === 'length'
        ? vehicle.lengthMm
        : cfg.axis === 'width'
          ? vehicle.widthMm
          : vehicle.heightMm;
    return real / cfg.spanUnits;
  };

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_320px]">
      {/* Canvas */}
      <div className="rounded-xl border border-zinc-200 bg-white p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
          {(['select', 'draw', 'measure'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setMeasureStart(null);
              }}
              className={`rounded-md px-2.5 py-1 text-sm font-medium ${mode === m ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200'}`}
            >
              {m === 'draw' ? 'Draw panel' : m === 'measure' ? 'Measure span' : 'Select'}
            </button>
          ))}
          <span className="mx-2 h-5 w-px bg-zinc-200" />
          <label className="flex items-center gap-1.5 text-xs text-zinc-500">
            View for new panels
            <select
              value={activeView}
              onChange={(e) => setActiveView(e.target.value as ViewName)}
              className="rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
            >
              {VIEWS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          {backdropUrl ? (
            <label className="ml-auto flex items-center gap-1.5 text-xs text-zinc-500">
              Backdrop
              <input
                type="range"
                min={0}
                max={100}
                value={backdropOpacity * 100}
                onChange={(e) => setBackdropOpacity(Number(e.target.value) / 100)}
              />
            </label>
          ) : null}
        </div>

        <svg
          ref={svgRef}
          viewBox={`0 0 ${SHEET_W} ${SHEET_H}`}
          className={`w-full rounded-lg border border-zinc-100 bg-zinc-50 ${mode === 'draw' ? 'cursor-crosshair' : mode === 'measure' ? 'cursor-cell' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={clearInteraction}
          onLostPointerCapture={clearInteraction}
          data-testid="studio-canvas"
        >
          {backdropUrl ? (
            <image
              href={backdropUrl}
              width={SHEET_W}
              height={SHEET_H}
              opacity={backdropOpacity}
              preserveAspectRatio="xMidYMid meet"
            />
          ) : null}
          {panels.map((p) => {
            const isSel = p.key === selectedKey;
            return (
              <g key={p.key}>
                <path
                  d={pathFromPoints(p.points)}
                  fill={isSel ? '#2563eb' : '#18181b'}
                  fillOpacity={isSel ? 0.18 : 0.08}
                  stroke={isSel ? '#2563eb' : '#3f3f46'}
                  strokeWidth={isSel ? 2.5 : 1.5}
                  vectorEffect="non-scaling-stroke"
                  className="cursor-move"
                  data-testid={`studio-panel-${p.key}`}
                  onPointerDown={(e) => {
                    if (mode !== 'select') return;
                    e.stopPropagation();
                    capturePointer(e);
                    setSelectedKey(p.key);
                    const [x, y] = toSheet(e);
                    drag.current = { kind: 'panel', key: p.key, lastX: x, lastY: y };
                  }}
                />
                {isSel
                  ? p.points.map(([x, y], i) => (
                      <circle
                        key={i}
                        cx={x}
                        cy={y}
                        r={7}
                        fill="#ffffff"
                        stroke="#2563eb"
                        strokeWidth={2}
                        className="cursor-grab"
                        onPointerDown={(e) => {
                          e.stopPropagation();
                          // Pointer capture retargets click/dblclick to the
                          // capture target, so an onDoubleClick here would
                          // never fire — detect the double-press via
                          // pointerdown's detail count instead (it increments
                          // BEFORE any capture retargeting applies).
                          if (e.detail === 2) {
                            removeVertex(p, i);
                            return;
                          }
                          capturePointer(e);
                          drag.current = { kind: 'vertex', key: p.key, index: i };
                        }}
                      />
                    ))
                  : null}
                {isSel
                  ? p.points.map(([x, y], i) => {
                      const [nx, ny] = p.points[(i + 1) % p.points.length]!;
                      return (
                        <circle
                          key={`mid-${i}`}
                          cx={(x + nx) / 2}
                          cy={(y + ny) / 2}
                          r={5}
                          fill="#bfdbfe"
                          stroke="#2563eb"
                          className="cursor-copy"
                          onPointerDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            insertVertex(p, i);
                          }}
                        />
                      );
                    })
                  : null}
              </g>
            );
          })}
          {draft ? (
            <rect
              x={Math.min(draft.x0, draft.x1)}
              y={Math.min(draft.y0, draft.y1)}
              width={Math.abs(draft.x1 - draft.x0)}
              height={Math.abs(draft.y1 - draft.y0)}
              fill="#2563eb"
              fillOpacity={0.15}
              stroke="#2563eb"
              strokeDasharray="6 4"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {measureStart ? (
            <circle cx={measureStart[0]} cy={measureStart[1]} r={6} fill="#dc2626" />
          ) : null}
        </svg>
        <p className="mt-2 text-xs text-zinc-400">
          Draw: drag a box (refine corners afterwards — drag dots, click edge midpoints to add,
          double-click dots to remove). Measure: click the two ends of the vehicle in the active
          view to calibrate its span.
        </p>
      </div>

      {/* Sidebar */}
      <div className="space-y-4">
        <section className="rounded-xl border border-zinc-200 bg-white p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Calibration
          </h3>
          {usedViews.length === 0 ? (
            <p className="text-xs text-zinc-400">Draw a panel first.</p>
          ) : (
            usedViews.map((view) => {
              const cfg = configFor(view);
              const mmu = mmPerUnit(view);
              return (
                <div key={view} className="mb-2 flex items-center gap-2 text-sm">
                  <span className="w-20 font-medium capitalize text-zinc-700">{view}</span>
                  <input
                    type="number"
                    value={cfg.spanUnits || ''}
                    placeholder="span"
                    min={1}
                    onChange={(e) => setConfig(view, { spanUnits: Number(e.target.value) })}
                    className="w-20 rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                    data-testid={`studio-span-${view}`}
                  />
                  <select
                    value={cfg.axis}
                    onChange={(e) =>
                      setConfig(view, { axis: e.target.value as ViewConfig['axis'] })
                    }
                    className="rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                  >
                    <option value="length">length</option>
                    <option value="width">width</option>
                    <option value="height">height</option>
                  </select>
                  <span className="text-xs text-zinc-400">
                    {mmu ? `${mmu.toFixed(2)} mm/u` : '—'}
                  </span>
                </div>
              );
            })
          )}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Panels ({panels.length})
          </h3>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-sm">
            {panels.map((p) => (
              <li key={p.key}>
                <button
                  type="button"
                  onClick={() => setSelectedKey(p.key)}
                  className={`w-full truncate rounded-md px-2 py-1 text-left ${p.key === selectedKey ? 'bg-zinc-900 text-white' : 'hover:bg-zinc-100'}`}
                >
                  {p.installOrder}. {p.name}{' '}
                  <span className={p.key === selectedKey ? 'text-zinc-300' : 'text-zinc-400'}>
                    · {p.view}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {selected ? (
            <div className="mt-3 space-y-2 border-t border-zinc-100 pt-3 text-sm">
              <input
                type="text"
                value={selected.name}
                maxLength={80}
                onChange={(e) => updatePanel(selected.key, { name: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                data-testid="studio-panel-name"
              />
              <div className="flex gap-2">
                <select
                  value={selected.view}
                  onChange={(e) => updatePanel(selected.key, { view: e.target.value as ViewName })}
                  className="flex-1 rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                >
                  {VIEWS.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  value={selected.finishHint}
                  onChange={(e) =>
                    updatePanel(selected.key, {
                      finishHint: e.target.value as ClientPanel['finishHint'],
                    })
                  }
                  className="flex-1 rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                >
                  {FINISHES.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  value={selected.installOrder}
                  min={1}
                  max={99}
                  onChange={(e) =>
                    updatePanel(selected.key, { installOrder: Number(e.target.value) })
                  }
                  className="w-16 rounded-md border border-zinc-300 px-1.5 py-1 text-sm"
                  title="Install order"
                />
              </div>
              <input
                type="text"
                value={selected.notes}
                placeholder="Notes (optional)"
                maxLength={500}
                onChange={(e) => updatePanel(selected.key, { notes: e.target.value })}
                className="w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
              />
              <button
                type="button"
                onClick={() => deletePanel(selected.key)}
                className="text-xs font-medium text-red-600 hover:underline"
              >
                Delete panel
              </button>
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-zinc-200 bg-white p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
            Save &amp; publish
          </h3>
          <label className="mb-2 block text-xs text-zinc-500">
            Provenance (which owned source this tracing comes from)
            <textarea
              value={provenanceNote}
              onChange={(e) => setProvenanceNote(e.target.value)}
              rows={2}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm text-zinc-900"
            />
          </label>
          {calibrationMissing.length > 0 ? (
            <p className="mb-2 text-xs text-amber-600">
              Calibrate {calibrationMissing.join(', ')} before saving (measure or type the span).
            </p>
          ) : null}
          <form action={saveAction} className="mb-2">
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            <input type="hidden" name="payload" value={payload} />
            <button
              type="submit"
              disabled={savePending || panels.length === 0 || calibrationMissing.length > 0}
              className="w-full rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
              data-testid="studio-save"
            >
              {savePending ? 'Saving…' : `Save ${panels.length} panels`}
            </button>
          </form>
          {saveState.message ? (
            <p className={`mb-2 text-xs ${saveState.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {saveState.message}
            </p>
          ) : null}
          {saveState.errors?.length ? (
            <ul className="mb-2 list-inside list-disc text-xs text-red-600">
              {saveState.errors.slice(0, 6).map((e, i) => (
                <li key={i}>
                  {e.field}: {e.message}
                </li>
              ))}
            </ul>
          ) : null}
          {vehicle.status === 'published' ? (
            <p className="mb-2 text-xs text-amber-600">
              This template is LIVE — saving updates the catalogue immediately.
            </p>
          ) : null}

          <form action={publishAction}>
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <input type="hidden" name="vehicleId" value={vehicle.id} />
            {openRequests.length > 0 ? (
              <label className="mb-2 block text-xs text-zinc-500">
                Fulfills request (optional)
                <select
                  name="requestId"
                  defaultValue=""
                  className="mt-1 w-full rounded-md border border-zinc-300 px-2 py-1 text-sm"
                >
                  <option value="">— none —</option>
                  {openRequests.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="submit"
              disabled={publishPending}
              className="w-full rounded-md border border-zinc-900 px-3 py-2 text-sm font-medium text-zinc-900 transition hover:bg-zinc-50 disabled:opacity-50"
              data-testid="studio-publish"
            >
              {publishPending ? 'Publishing…' : 'Publish (+ layout sheet)'}
            </button>
          </form>
          {publishState.message ? (
            <p className={`mt-2 text-xs ${publishState.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {publishState.message}
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
