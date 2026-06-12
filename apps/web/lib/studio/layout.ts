// Layout-sheet assembly from a vehicle's published panel rows (Goal 6). Pure —
// unit-tested directly; the publish action feeds the result to
// svg.buildLayoutSheetSvg and uploads the artifact.
//
// Panel rows store view-local geometry only (no sheet placement), so views are
// laid out in a row by content bbox — the same convention CanvasStage and
// ZoneDiagram use — and the dimension callouts state the vehicle's REAL
// dimensions from the row (the calibrated source of truth), not document units.

import { geometry } from '@alphawolf/canvas';
import { svg, type LayoutSheetInput, type VehicleDetail } from '@alphawolf/db';

const VIEW_ORDER = ['front', 'driver', 'back', 'passenger', 'top'];
const VIEW_GUTTER = 600;

const mmToInches = (mm: number): string => (mm / 25.4).toFixed(1);
const fmtMm = (mm: number): string => mm.toLocaleString('en-US');

function calloutFor(view: string, vehicle: VehicleDetail): string {
  const axis = svg.defaultAxisForView(view);
  const mm =
    axis === 'length' ? vehicle.lengthMm : axis === 'width' ? vehicle.widthMm : vehicle.heightMm;
  return `Overall ${axis} ${fmtMm(mm)} mm · ${mmToInches(mm)} in`;
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function assembleLayoutSheet(vehicle: VehicleDetail): LayoutSheetInput {
  const byView = new Map<string, VehicleDetail['panels']>();
  for (const p of vehicle.panels) {
    const arr = byView.get(p.view) ?? [];
    arr.push(p);
    byView.set(p.view, arr);
  }
  const ordered = [...byView.keys()].sort((a, b) => VIEW_ORDER.indexOf(a) - VIEW_ORDER.indexOf(b));

  const views: LayoutSheetInput['views'] = [];
  let cursorX = 0;
  for (const view of ordered) {
    const panels = byView.get(view)!;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    for (const p of panels) {
      try {
        const b = geometry.bbox(geometry.parsePath(p.svgPath));
        minX = Math.min(minX, b.minX);
        minY = Math.min(minY, b.minY);
        maxX = Math.max(maxX, b.maxX);
      } catch {
        // Unparseable paths were rejected upstream by the validator.
      }
    }
    if (!Number.isFinite(minX)) continue;
    views.push({
      view,
      translate: { x: cursorX - minX, y: -minY },
      panels: panels.map((p) => ({
        name: p.name,
        outlinePath: p.svgPath,
        wrapSafePath: (p.wrapSafeZone as { clip_path?: string } | null)?.clip_path ?? p.svgPath,
        installOrder: p.installOrder,
      })),
      dimensionLabel: calloutFor(view, vehicle),
    });
    cursorX += maxX - minX + VIEW_GUTTER;
  }

  const viewsLine = `${ordered.length}-View · ${ordered.map(titleCase).join(' / ')}`;

  return {
    title: `${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`,
    yearLabel: String(vehicle.year),
    code: vehicle.alphaWolfTplId,
    scaleDenom: vehicle.scaleDenom,
    viewsLine,
    views,
  };
}
