// Layout-sheet assembly from a vehicle's panel rows (Goal 6). Thin adapter:
// the row layout + callout logic lives in @alphawolf/db
// (svg.assembleLayoutSheetFromRows) so the Studio publish action and the AW
// panel-authoring script share one implementation. Covered by
// tests/studio-author.test.ts.

import { svg, type LayoutSheetInput, type VehicleDetail } from '@alphawolf/db';

export function assembleLayoutSheet(vehicle: VehicleDetail): LayoutSheetInput {
  return svg.assembleLayoutSheetFromRows(
    {
      title: `${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`,
      yearLabel: String(vehicle.year),
      code: vehicle.alphaWolfTplId,
      scaleDenom: vehicle.scaleDenom,
      dims: { lengthMm: vehicle.lengthMm, widthMm: vehicle.widthMm, heightMm: vehicle.heightMm },
    },
    vehicle.panels.map((p) => ({
      name: p.name,
      view: p.view,
      svgPath: p.svgPath,
      wrapSafeZone: p.wrapSafeZone,
      installOrder: p.installOrder,
    })),
  );
}
