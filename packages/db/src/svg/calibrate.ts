// Scale calibration (Goal 6 Template Studio).
//
// Template documents are display-scaled: their coordinate unit is whatever the
// art was drawn in, NOT real millimetres. Goal 5 (decision 5) established that
// per-panel real-world sizes must derive from the vehicle's stated dimensions,
// not from document units. The Studio closes that loop at authoring time: each
// view declares which real dimension its content spans (a profile spans the
// vehicle's length; front/back span its width), and the mm-per-unit factor is
//
//     mmPerUnit = realDimensionMm / spanUnits
//
// where spanUnits is the measured document-unit span of the vehicle in that
// view (the art silhouette's bbox span — NOT the panel union, which can stop
// short of the bumpers; that shortfall is exactly what made the Transit's
// Goal 5 estimates print high).
//
// printable_area_mm2 = pathAreaScaled(wrapSafePath, mmPerUnit) is then a REAL
// area, which is what the schema always claimed the column meant.

export type VehicleDimsMm = { lengthMm: number; widthMm: number; heightMm: number };

export type ViewAxis = 'length' | 'width' | 'height';

export type ViewCalibration = {
  /** Document-unit span of the vehicle silhouette along the axis in this view. */
  spanUnits: number;
  /** Which real vehicle dimension that span represents. */
  axis: ViewAxis;
};

/** The horizontal real-world axis each standard view spans. */
export function defaultAxisForView(view: string): ViewAxis {
  switch (view) {
    case 'driver':
    case 'passenger':
    case 'top':
      return 'length';
    case 'front':
    case 'back':
      return 'width';
    default:
      throw new Error(`[svg] defaultAxisForView: unknown view "${view}"`);
  }
}

export function mmPerUnitFor(dims: VehicleDimsMm, cal: ViewCalibration): number {
  if (!Number.isFinite(cal.spanUnits) || cal.spanUnits <= 0) {
    throw new Error('[svg] mmPerUnitFor: spanUnits must be a positive number');
  }
  const real =
    cal.axis === 'length' ? dims.lengthMm : cal.axis === 'width' ? dims.widthMm : dims.heightMm;
  if (!Number.isFinite(real) || real <= 0) {
    throw new Error(`[svg] mmPerUnitFor: vehicle ${cal.axis} dimension is missing or non-positive`);
  }
  return real / cal.spanUnits;
}
