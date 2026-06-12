export { parsePath } from './path-parse.js';
export type { Ring } from './path-parse.js';
export {
  pointInRing,
  pointInPolygon,
  pointInBbox,
  ringBbox,
  bbox,
  bboxIntersects,
  ringSignedArea,
  polygonArea,
} from './polygon.js';
export type { Bbox } from './polygon.js';
export { isElementInsideClip, pathArea, pathAreaMm2 } from './hit-test.js';
export { insetRingPath, pathAreaScaled } from './offset.js';
export { elementBbox } from './bbox.js';
export { resolveSnap } from './snap.js';
export type { SnapCandidate, SnapInput, SnapResult } from './snap.js';
