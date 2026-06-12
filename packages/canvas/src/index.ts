// Public surface of @alphawolf/canvas (ADR-0006 §1).
//
// Framework-agnostic, DOM-free, React-free, Konva-free pure TS. The only entry
// point: consumers import from here, never from internal modules.

export * from './schema/types.js';
export { CURRENT_SCHEMA_VERSION } from './schema/versions.js';
export type { SchemaVersion } from './schema/versions.js';
export * as factory from './schema/defaults.js';

export {
  serializeDocument,
  deserializeDocument,
  migrateToCurrent,
  CanvasSchemaError,
} from './serialization/index.js';
export type { SerializedDocument, DeserializeResult } from './serialization/index.js';

export * as history from './history/index.js';
export * as geometry from './geometry/index.js';
