// Template Studio ingest-provenance repository (Goal 6).
//
// One row per uploaded source artifact (orthographic photo, OEM dimensional
// PDF, owned SVG art) feeding a template authoring session. The files live in
// the PRIVATE `template-sources` bucket; these rows are the audit trail that
// enforces the legal wall by provenance (ADR-0014 invariant 12). Internal
// staff data only: RLS (template_sources_admin_all) makes every verb
// admin-only, so all functions here run on withUser(adminId). Never expose the
// Prisma client.

import type { Prisma, TemplateSourceKind } from '@prisma/client';
import { withUser } from '../client.js';

export type { TemplateSourceKind };

export const TEMPLATE_SOURCE_KINDS = ['photo', 'oem_pdf', 'owned_svg'] as const;

export function isTemplateSourceKind(value: string): value is TemplateSourceKind {
  return (TEMPLATE_SOURCE_KINDS as readonly string[]).includes(value);
}

// The operator's reference numbers captured at ingest — the calibration
// inputs from the strategy doc (overall length, wheelbase, wrap height).
export type SourceMeasurements = {
  overall_length_mm?: number;
  wheelbase_mm?: number;
  wrap_height_mm?: number;
};

export type TemplateSourceRow = {
  id: string;
  vehicleId: string | null;
  requestId: string | null;
  kind: TemplateSourceKind;
  storageKey: string;
  measurements: SourceMeasurements | null;
  notes: string | null;
  createdById: string;
  createdAt: Date;
};

export type CreateSourceInput = {
  vehicleId?: string | null;
  requestId?: string | null;
  kind: TemplateSourceKind;
  storageKey: string;
  measurements?: SourceMeasurements | null;
  notes?: string | null;
};

export async function createSource(
  adminId: string,
  input: CreateSourceInput,
): Promise<TemplateSourceRow> {
  return withUser(adminId, async (db) => {
    const row = await db.templateSource.create({
      data: {
        vehicleId: input.vehicleId ?? null,
        requestId: input.requestId ?? null,
        kind: input.kind,
        storageKey: input.storageKey,
        measurements: (input.measurements ?? undefined) as Prisma.InputJsonValue | undefined,
        notes: input.notes ?? null,
        createdById: adminId,
      },
    });
    return toRow(row);
  });
}

export async function listForVehicle(
  adminId: string,
  vehicleId: string,
): Promise<TemplateSourceRow[]> {
  return withUser(adminId, async (db) => {
    const rows = await db.templateSource.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(toRow);
  });
}

type SourceRow = {
  id: string;
  vehicleId: string | null;
  requestId: string | null;
  kind: TemplateSourceKind;
  storageKey: string;
  measurements: Prisma.JsonValue;
  notes: string | null;
  createdById: string;
  createdAt: Date;
};

function toRow(row: SourceRow): TemplateSourceRow {
  return {
    id: row.id,
    vehicleId: row.vehicleId,
    requestId: row.requestId,
    kind: row.kind,
    storageKey: row.storageKey,
    measurements: (row.measurements ?? null) as SourceMeasurements | null,
    notes: row.notes,
    createdById: row.createdById,
    createdAt: row.createdAt,
  };
}
