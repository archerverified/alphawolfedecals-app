// Schema versioning (ADR-0006 §2.4).
//
// Rule locked by the ADR: `schemaVersion` only ever increments, and migrators
// are never deleted. Every schema-changing PR bumps this and adds a migrator
// plus a migrate.test.ts fixture of the prior version.

export const CURRENT_SCHEMA_VERSION = 1 as const;

export type SchemaVersion = typeof CURRENT_SCHEMA_VERSION;
