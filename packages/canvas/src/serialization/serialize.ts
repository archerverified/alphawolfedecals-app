// CanvasDocument -> JSON-safe payload (ADR-0006 §1).
//
// The document model is already plain data, but serialize() guarantees a
// stamped current schemaVersion, a structural clone (so the persisted payload
// can't alias live editor state), and that only finite numbers reach the DB.

import type { CanvasDocument } from '../schema/types.js';
import { CURRENT_SCHEMA_VERSION } from '../schema/versions.js';

/** A structurally-cloned, JSON-safe representation of a document. */
export type SerializedDocument = Record<string, unknown>;

/**
 * Produce a JSON-safe payload for persistence. Throws if the document contains
 * a value that cannot survive JSON round-tripping (NaN/Infinity become null in
 * JSON, which would silently corrupt geometry — we reject instead).
 */
export function serializeDocument(doc: CanvasDocument): SerializedDocument {
  const stamped: CanvasDocument = {
    ...doc,
    schemaVersion: CURRENT_SCHEMA_VERSION,
  };

  // JSON.stringify drops `undefined` and converts NaN/Infinity to null. Catch
  // non-finite numbers explicitly so corruption surfaces here, not on reload.
  const json = JSON.stringify(stamped, (_key, value) => {
    if (typeof value === 'number' && !Number.isFinite(value)) {
      throw new Error(`serializeDocument: non-finite number encountered for "${_key}"`);
    }
    return value;
  });

  return JSON.parse(json) as SerializedDocument;
}
