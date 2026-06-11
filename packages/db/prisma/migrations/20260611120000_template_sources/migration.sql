-- Goal 6 — Template Studio ingest provenance.
--
-- One row per uploaded source artifact (orthographic photo, OEM dimensional
-- PDF, owned SVG art) feeding a template authoring session. The files
-- themselves live in the PRIVATE `template-sources` Storage bucket; this table
-- is the audit trail that enforces the legal wall by provenance (ADR-0014
-- invariant 12 / docs/product/template-supply-strategy.md): every authored
-- template traces to one of the three allowed owned-source classes, and the
-- app's template sources never mix with shop production files.
--
-- RLS (admin-only, fail-closed) is applied by prisma/sql/auth_rls.sql per
-- ADR-0014 invariant 11 — policies are NOT in this migration.

-- CreateEnum
CREATE TYPE "template_source_kind" AS ENUM ('photo', 'oem_pdf', 'owned_svg');

-- CreateTable
CREATE TABLE "template_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID,
    "request_id" UUID,
    "kind" "template_source_kind" NOT NULL,
    "storage_key" TEXT NOT NULL,
    "measurements" JSONB,
    "notes" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "template_sources_vehicle_idx" ON "template_sources"("vehicle_id");

-- AddForeignKey
ALTER TABLE "template_sources" ADD CONSTRAINT "template_sources_vehicle_id_fkey"
  FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "template_sources" ADD CONSTRAINT "template_sources_request_id_fkey"
  FOREIGN KEY ("request_id") REFERENCES "vehicle_template_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "template_sources" ADD CONSTRAINT "template_sources_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
