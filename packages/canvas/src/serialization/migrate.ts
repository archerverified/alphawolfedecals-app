// Migrate-on-load registry (ADR-0006 §2.4).
//
// A document at version `k` is upgraded by applying migrators k, k+1, ...,
// CURRENT-1 in sequence. Each migrator is PURE, operates on the OLD shape, and
// takes/returns a plain record. Migrators are NEVER deleted.

import { CURRENT_SCHEMA_VERSION } from '../schema/versions.js';

/** Thrown on structural corruption, an unknown version, or a too-new document. */
export class CanvasSchemaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CanvasSchemaError';
  }
}

type Migrator = (doc: Record<string, unknown>) => Record<string, unknown>;

/**
 * Keyed by the version a migrator upgrades FROM. `MIGRATORS[k]` turns a v`k`
 * document into a v`k+1` document. Currently empty: v1 is the first version.
 */
const MIGRATORS: Record<number, Migrator | undefined> = {
  // 1: (doc) => { /* future: rename fill -> fillColor */ return doc; },
};

/**
 * Upgrade a raw document to {@link CURRENT_SCHEMA_VERSION}. A document with no
 * numeric `schemaVersion` is treated as v0 (pre-versioning). Throws
 * {@link CanvasSchemaError} if a migrator is missing or the document is newer
 * than this client.
 */
export function migrateToCurrent(raw: Record<string, unknown>): Record<string, unknown> {
  let v = typeof raw.schemaVersion === 'number' ? raw.schemaVersion : 0;

  if (v > CURRENT_SCHEMA_VERSION) {
    throw new CanvasSchemaError(
      `Document is newer (v${v}) than this client (v${CURRENT_SCHEMA_VERSION})`,
    );
  }

  // Shallow-clone so we never mutate the caller's input.
  let doc: Record<string, unknown> = { ...raw };

  while (v < CURRENT_SCHEMA_VERSION) {
    const step = MIGRATORS[v];
    if (!step) {
      throw new CanvasSchemaError(`No migrator from schemaVersion ${v}`);
    }
    doc = { ...step(doc) };
    v += 1;
    doc.schemaVersion = v;
  }

  return doc;
}
