'use client';

// Clickable vehicle zone diagram (Goal 5 / B2C-003). Renders whatever panels
// the template carries — views laid side by side (same layout math as the
// editor's CanvasStage), each panel an SVG path that toggles include/exclude.
// Fully data-driven: a template with zero panels renders nothing and the step
// falls back to its empty-state copy (AW catalog templates until Archer's
// panel data lands); the Transit's 6 panels prove the interaction.

import { useMemo } from 'react';
import { geometry } from '@alphawolf/canvas';
import type { BriefPanel } from './steps';

const VIEW_ORDER = ['front', 'driver', 'back', 'passenger', 'top'];
const VIEW_GUTTER = 600; // doc units between views, mirrors CanvasStage

interface PlacedPanel {
  panel: BriefPanel;
  transform: string;
}

interface Layout {
  placed: PlacedPanel[];
  viewLabels: Array<{ view: string; x: number; y: number }>;
  width: number;
  height: number;
}

function computeLayout(panels: BriefPanel[]): Layout {
  const byView = new Map<string, BriefPanel[]>();
  for (const p of panels) {
    if (!p.outlinePath) continue;
    const arr = byView.get(p.view) ?? [];
    arr.push(p);
    byView.set(p.view, arr);
  }
  const ordered = [...byView.keys()].sort(
    (a, b) =>
      VIEW_ORDER.indexOf(a) +
      100 * Number(VIEW_ORDER.indexOf(a) < 0) -
      (VIEW_ORDER.indexOf(b) + 100 * Number(VIEW_ORDER.indexOf(b) < 0)),
  );

  const placed: PlacedPanel[] = [];
  const viewLabels: Layout['viewLabels'] = [];
  let cursorX = 0;
  let maxH = 0;
  for (const view of ordered) {
    const vp = byView.get(view) ?? [];
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of vp) {
      try {
        const b = geometry.bbox(geometry.parsePath(p.outlinePath!));
        if (b.minX < minX) minX = b.minX;
        if (b.minY < minY) minY = b.minY;
        if (b.maxX > maxX) maxX = b.maxX;
        if (b.maxY > maxY) maxY = b.maxY;
      } catch {
        // Unparseable path: skip the panel rather than killing the diagram.
      }
    }
    if (!Number.isFinite(minX)) continue;
    const w = maxX - minX;
    const h = maxY - minY;
    const offsetX = cursorX - minX;
    const offsetY = -minY;
    for (const p of vp) {
      placed.push({ panel: p, transform: `translate(${offsetX}, ${offsetY})` });
    }
    viewLabels.push({ view, x: cursorX + w / 2, y: 0 });
    cursorX += w + VIEW_GUTTER;
    if (h > maxH) maxH = h;
  }
  // Second pass: one shared label baseline below the TALLEST view — per-view
  // heights vary (top vs side views) and per-view baselines render ragged.
  for (const l of viewLabels) l.y = maxH + 260;
  return {
    placed,
    viewLabels,
    width: Math.max(0, cursorX - VIEW_GUTTER),
    height: maxH,
  };
}

export interface ZoneDiagramProps {
  panels: BriefPanel[];
  /** Panel ids currently included; null = full wrap (all included). */
  includedPanelIds: string[] | null;
  onToggle: (panelId: string) => void;
}

export function ZoneDiagram({ panels, includedPanelIds, onToggle }: ZoneDiagramProps) {
  const layout = useMemo(() => computeLayout(panels), [panels]);
  if (layout.placed.length === 0) return null;

  const isIncluded = (id: string) => includedPanelIds === null || includedPanelIds.includes(id);

  // Label headroom below the tallest view, plus horizontal padding so the
  // centre-anchored edge labels (front / rear) don't clip at the SVG bounds
  // (Goal 14 — they overran the viewBox at fontSize 180). Pad adapts to the
  // longest view name so it holds for any template's view set.
  const labelFontSize = 130;
  const longestView = layout.viewLabels.reduce((m, l) => Math.max(m, l.view.length), 0);
  const labelPad = Math.ceil(longestView * labelFontSize * 0.3) + 48;
  const viewBox = `${-labelPad} 0 ${layout.width + labelPad * 2} ${layout.height + 320}`;

  return (
    <svg
      viewBox={viewBox}
      role="group"
      aria-label="Vehicle wrap zones — tap a panel to include or exclude it"
      className="w-full"
      data-testid="zone-diagram"
    >
      {layout.placed.map(({ panel, transform }) => {
        const on = isIncluded(panel.id);
        return (
          <path
            key={panel.id}
            d={panel.outlinePath}
            transform={transform}
            role="button"
            tabIndex={0}
            aria-pressed={on}
            data-testid={`zone-path-${panel.id}`}
            onClick={() => onToggle(panel.id)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onToggle(panel.id);
              }
            }}
            // Keyboard users need a visible focus ring (WCAG 2.4.7); the
            // <title> doubles as hover tooltip and accessible name.
            className="cursor-pointer transition-[fill-opacity] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-500"
            fill={on ? '#18181b' : '#e4e4e7'}
            fillOpacity={on ? 0.85 : 0.6}
            stroke={on ? '#18181b' : '#a1a1aa'}
            strokeWidth={1.5}
            // viewBox scaling would shrink a doc-unit stroke to sub-pixel —
            // keep panel borders readable at any rendered size.
            vectorEffect="non-scaling-stroke"
          >
            <title>{`${panel.name} (${panel.view}) — tap to ${on ? 'exclude' : 'include'}`}</title>
          </path>
        );
      })}
      {layout.viewLabels.map((l) => (
        <text
          key={l.view}
          x={l.x}
          y={l.y}
          textAnchor="middle"
          fontSize={labelFontSize}
          fill="#a1a1aa"
          className="select-none capitalize"
        >
          {l.view}
        </text>
      ))}
    </svg>
  );
}
