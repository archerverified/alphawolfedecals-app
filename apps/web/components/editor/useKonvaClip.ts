'use client';

// Per-panel wrap-safe clip (ADR-0006 §6, §7). We parse each panel's wrap-safe
// `d` into rings ONCE (geometry.parsePath, pure TS) and build a Konva clipFunc
// that traces those rings. The clipFunc is what makes artwork visually clip to
// the printable area on render; it does NOT prevent dragging out — the
// out-of-bounds CUE handles that case (see OverlayLayer).
//
// We also cache the parsed rings so the drag-time isElementInsideClip check
// reuses them (no re-parsing per frame).

import { useMemo } from 'react';
import { geometry } from '@alphawolf/canvas';
import type { Ring } from './types';

export type ClipFunc = (ctx: {
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  closePath: () => void;
}) => void;

export interface PanelClip {
  rings: Ring[];
  /** undefined when the panel has no wrap-safe path (no clipping applied). */
  clipFunc: ClipFunc | undefined;
}

function buildClipFunc(rings: Ring[]): ClipFunc | undefined {
  if (rings.length === 0) return undefined;
  return (ctx) => {
    ctx.beginPath();
    for (const ring of rings) {
      if (ring.length < 3) continue;
      const first = ring[0];
      if (!first) continue;
      ctx.moveTo(first[0] ?? 0, first[1] ?? 0);
      for (let i = 1; i < ring.length; i++) {
        const p = ring[i];
        if (!p) continue;
        ctx.lineTo(p[0] ?? 0, p[1] ?? 0);
      }
      ctx.closePath();
    }
  };
}

/** Parse + memoize one panel's wrap-safe clip. */
export function usePanelClip(wrapSafePath: string): PanelClip {
  return useMemo(() => {
    const rings = wrapSafePath ? geometry.parsePath(wrapSafePath) : [];
    return { rings, clipFunc: buildClipFunc(rings) };
  }, [wrapSafePath]);
}

/** Parse + memoize clips for every panel, keyed by PanelId. */
export function usePanelClips(
  panels: ReadonlyArray<{ id: string; wrapSafePath: string }>,
): Record<string, PanelClip> {
  return useMemo(() => {
    const out: Record<string, PanelClip> = {};
    for (const panel of panels) {
      const rings = panel.wrapSafePath ? geometry.parsePath(panel.wrapSafePath) : [];
      out[panel.id] = { rings, clipFunc: buildClipFunc(rings) };
    }
    return out;
  }, [panels]);
}
