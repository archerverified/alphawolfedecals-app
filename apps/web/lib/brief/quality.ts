// Logo quality gate math + parse-metadata reader (Goal 5 / B2C-004).
//
// Pure functions — unit-tested in tests/brief-quality.test.ts. The DPI check
// answers "how sharp does this file print across the biggest zone it's going
// on?": panel outline bbox is in template doc units, which are mm at the
// template's 1:scaleDenom drawing scale (vehicles.scale_denom — e.g. the
// Transit is 1:20, so a 101.6-unit-wide panel is 2032 mm of real vehicle).

import { geometry } from '@alphawolf/canvas';
import type { BriefPanel } from '@/components/brief/steps';

// Below this the print reads visibly soft at wrap viewing distance; the PRD's
// quality-gate threshold (§3 step 3).
export const MIN_LOGO_DPI = 150;

export interface UploadMeta {
  naturalWidth: number | null;
  naturalHeight: number | null;
  contentBbox: { left: number; top: number; width: number; height: number } | null;
  /** True = the FINAL png has no transparent pixel (drives the gate). */
  opaque: boolean | null;
  rembg: { requested: boolean; removed: boolean; error?: string };
}

// Defensive reader for ProjectAsset.parseMetadata (JSONB from the parse
// worker) — never trust the shape, never throw.
export function readUploadMeta(meta: unknown): UploadMeta {
  const empty: UploadMeta = {
    naturalWidth: null,
    naturalHeight: null,
    contentBbox: null,
    opaque: null,
    rembg: { requested: false, removed: false },
  };
  if (!meta || typeof meta !== 'object') return empty;
  const m = meta as Record<string, unknown>;
  const bbox = m.contentBbox;
  const rembg =
    m.rembg && typeof m.rembg === 'object' ? (m.rembg as Record<string, unknown>) : null;
  return {
    naturalWidth: typeof m.naturalWidth === 'number' ? m.naturalWidth : null,
    naturalHeight: typeof m.naturalHeight === 'number' ? m.naturalHeight : null,
    contentBbox: bbox && typeof bbox === 'object' ? (bbox as UploadMeta['contentBbox']) : null,
    opaque: typeof m.opaque === 'boolean' ? m.opaque : null,
    rembg: {
      requested: rembg?.requested === true,
      removed: rembg?.removed === true,
      error: typeof rembg?.error === 'string' ? rembg.error : undefined,
    },
  };
}

const MM_PER_INCH = 25.4;

/** Physical width (inches) of a panel outline at the template's drawing scale. */
export function panelWidthIn(outlinePath: string, scaleDenom: number): number | null {
  if (!outlinePath || !Number.isFinite(scaleDenom) || scaleDenom <= 0) return null;
  try {
    const b = geometry.bbox(geometry.parsePath(outlinePath));
    const width = b ? b.maxX - b.minX : NaN;
    if (!Number.isFinite(width) || width <= 0) return null;
    return (width * scaleDenom) / MM_PER_INCH;
  } catch {
    return null;
  }
}

export interface PanelPrintSize {
  panel: BriefPanel;
  widthIn: number;
}

/**
 * The widest panel (physically) among `restrictToIds` — the logo's assigned
 * zones, or the brief's included zones as the fallback. Widest is the honest
 * worst case for "how big could this logo print".
 */
export function largestPanel(
  panels: BriefPanel[],
  scaleDenom: number,
  restrictToIds?: string[] | null,
): PanelPrintSize | null {
  const pool =
    restrictToIds && restrictToIds.length > 0
      ? panels.filter((p) => restrictToIds.includes(p.id))
      : panels;
  let best: PanelPrintSize | null = null;
  for (const panel of pool) {
    if (!panel.outlinePath) continue;
    const widthIn = panelWidthIn(panel.outlinePath, scaleDenom);
    if (widthIn === null) continue;
    if (!best || widthIn > best.widthIn) best = { panel, widthIn };
  }
  return best;
}

/** Effective DPI when `naturalWidthPx` is printed across `widthIn` inches. */
export function effectiveDpi(naturalWidthPx: number, widthIn: number): number | null {
  if (!Number.isFinite(naturalWidthPx) || naturalWidthPx <= 0) return null;
  if (!Number.isFinite(widthIn) || widthIn <= 0) return null;
  return naturalWidthPx / widthIn;
}

export interface DpiVerdict {
  dpi: number;
  widthIn: number;
  panelName: string;
  ok: boolean;
}

/** Full gate: logo px width vs the largest relevant panel. null = can't judge. */
export function dpiVerdict(
  naturalWidthPx: number | null,
  panels: BriefPanel[],
  scaleDenom: number,
  assignedPanelIds?: string[] | null,
): DpiVerdict | null {
  if (naturalWidthPx === null) return null;
  const target = largestPanel(panels, scaleDenom, assignedPanelIds);
  if (!target) return null;
  const dpi = effectiveDpi(naturalWidthPx, target.widthIn);
  if (dpi === null) return null;
  return {
    dpi: Math.round(dpi),
    widthIn: Math.round(target.widthIn),
    panelName: target.panel.name,
    ok: dpi >= MIN_LOGO_DPI,
  };
}
