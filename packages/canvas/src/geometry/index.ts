export { parsePath } from './path-parse';
export type { Ring } from './path-parse';
export {
  pointInRing,
  pointInPolygon,
  pointInBbox,
  ringBbox,
  bbox,
  bboxIntersects,
  ringSignedArea,
  polygonArea,
} from './polygon';
export type { Bbox } from './polygon';
export { isElementInsideClip, pathArea, pathAreaMm2 } from './hit-test';
export { insetRingPath, pathAreaScaled } from './offset';
export { elementBbox } from './bbox';
export { resolveSnap } from './snap';
export type { SnapCandidate, SnapInput, SnapResult } from './snap';
