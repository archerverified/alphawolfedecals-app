// Barrel for the SVG template toolchain. Existing call sites import
// `svg.validateOutlineSvg` / `svg.wrapSafeZoneFor` via @alphawolf/db, so this
// re-export keeps that surface while the Studio (Goal 6) adds the builder,
// calibration, and layout-sheet halves of the round trip.

export * from './validate.js';
export * from './build-outline.js';
export * from './calibrate.js';
export * from './layout-sheet.js';
export * from './qc-overlay.js';
export * from './theme.js';
