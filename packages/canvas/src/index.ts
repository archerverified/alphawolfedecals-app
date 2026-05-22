// Public surface of @alphawolf/canvas (ADR-0006 §1).
//
// Framework-agnostic, DOM-free, React-free, Konva-free pure TS. The only entry
// point: consumers import from here, never from internal modules.

export * from './schema/types';
export { CURRENT_SCHEMA_VERSION } from './schema/versions';
export type { SchemaVersion } from './schema/versions';
export * as factory from './schema/defaults';

export {
  serializeDocument,
  deserializeDocument,
  migrateToCurrent,
  CanvasSchemaError,
} from './serialization';
export type { SerializedDocument, DeserializeResult } from './serialization';

export * as history from './history';
export * as geometry from './geometry';
