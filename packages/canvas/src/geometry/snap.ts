// Snapping math (ADR-0006 §3). Pure; computed in panel-local space so the view
// transform never enters the math.

import type { Bbox } from './polygon';

export interface SnapCandidate {
  axis: 'x' | 'y';
  value: number;
  source: 'body' | 'edge' | 'center' | 'element';
}

export interface SnapInput {
  moving: { bbox: Bbox; center: { x: number; y: number } };
  candidates: ReadonlyArray<SnapCandidate>;
  /** Threshold in DOC units (caller converts px->doc using current zoom). */
  thresholdPx: number;
}

export interface SnapResult {
  dx: number;
  dy: number;
  lines: SnapCandidate[];
}

/** The three reference positions on the moving bbox per axis. */
function movingRefs(moving: SnapInput['moving'], axis: 'x' | 'y'): number[] {
  if (axis === 'x') {
    return [moving.bbox.minX, moving.center.x, moving.bbox.maxX];
  }
  return [moving.bbox.minY, moving.center.y, moving.bbox.maxY];
}

/**
 * Resolve snapping for a moving element against candidate guide lines.
 *
 * For each axis independently, finds the (candidate, moving-edge/center) pair
 * with the smallest absolute gap within `thresholdPx`. Returns the delta to
 * apply and the guide line(s) that were snapped to (for rendering). Snaps to
 * the NEAREST candidate; no snap when the nearest gap exceeds the threshold.
 */
export function resolveSnap(input: SnapInput): SnapResult {
  const result: SnapResult = { dx: 0, dy: 0, lines: [] };

  for (const axis of ['x', 'y'] as const) {
    const refs = movingRefs(input.moving, axis);
    let best: { delta: number; gap: number; candidate: SnapCandidate } | null = null;

    for (const candidate of input.candidates) {
      if (candidate.axis !== axis) continue;
      for (const ref of refs) {
        const delta = candidate.value - ref;
        const gap = Math.abs(delta);
        if (gap > input.thresholdPx) continue;
        if (best === null || gap < best.gap) {
          best = { delta, gap, candidate };
        }
      }
    }

    if (best) {
      if (axis === 'x') result.dx = best.delta;
      else result.dy = best.delta;
      result.lines.push(best.candidate);
    }
  }

  return result;
}
