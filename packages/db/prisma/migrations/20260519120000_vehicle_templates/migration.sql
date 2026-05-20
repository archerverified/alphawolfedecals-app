-- CreateEnum
CREATE TYPE "body_type" AS ENUM ('sedan', 'suv', 'crossover', 'pickup', 'van', 'box_truck', 'sprinter', 'motorcycle', 'rv', 'trailer', 'boat', 'equipment');

-- CreateEnum
CREATE TYPE "template_status" AS ENUM ('draft', 'review', 'published', 'retired');

-- CreateEnum
CREATE TYPE "source_authority" AS ENUM ('manufacturer_spec', 'measured_in_shop', 'licensed', 'community_verified');

-- CreateEnum
CREATE TYPE "finish_hint" AS ENUM ('gloss', 'satin', 'matte', 'chrome', 'carbon', 'brushed', 'none');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "is_admin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "vehicles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "year" INTEGER NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "trim" TEXT,
    "variant" TEXT,
    "body_type" "body_type" NOT NULL,
    "length_mm" INTEGER NOT NULL,
    "width_mm" INTEGER NOT NULL,
    "height_mm" INTEGER NOT NULL,
    "wheelbase_mm" INTEGER,
    "cab_size" TEXT,
    "bed_size" TEXT,
    "roof_height" TEXT,
    "door_count" INTEGER,
    "outline_svg_url" TEXT NOT NULL,
    "topview_svg_url" TEXT,
    "thumb_png_url" TEXT NOT NULL,
    "source_authority" "source_authority" NOT NULL,
    "source_notes" TEXT,
    "verified_at" TIMESTAMPTZ,
    "verified_by" UUID,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "template_status" NOT NULL DEFAULT 'draft',
    "supersedes_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_panels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "vehicle_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "svg_path" TEXT NOT NULL,
    "view" TEXT NOT NULL,
    "wrap_safe_zone" JSONB NOT NULL,
    "printable_area_mm2" INTEGER NOT NULL,
    "finish_hint" "finish_hint" NOT NULL DEFAULT 'none',
    "install_order" INTEGER NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vehicle_panels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vehicle_template_requests" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "requester_id" UUID,
    "requester_email" TEXT,
    "year" INTEGER NOT NULL,
    "make" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "trim" TEXT,
    "variant" TEXT,
    "reference_photo_urls" TEXT[],
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "shipped_vehicle_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMPTZ,

    CONSTRAINT "vehicle_template_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vehicles_year_make_model_idx" ON "vehicles"("year", "make", "model");

-- CreateIndex
CREATE INDEX "vehicle_panels_vehicle_idx" ON "vehicle_panels"("vehicle_id");

-- CreateIndex
CREATE INDEX "vehicle_template_requests_status_created_at_idx" ON "vehicle_template_requests"("status", "created_at");

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_verified_by_fkey" FOREIGN KEY ("verified_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_supersedes_id_fkey" FOREIGN KEY ("supersedes_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_panels" ADD CONSTRAINT "vehicle_panels_vehicle_id_fkey" FOREIGN KEY ("vehicle_id") REFERENCES "vehicles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_template_requests" ADD CONSTRAINT "vehicle_template_requests_requester_id_fkey" FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vehicle_template_requests" ADD CONSTRAINT "vehicle_template_requests_shipped_vehicle_id_fkey" FOREIGN KEY ("shipped_vehicle_id") REFERENCES "vehicles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ----------------------------------------------------------------------------
-- Raw SQL the Prisma schema language can't express. These are mandated by
-- docs/vehicle-database-spec.md §2 and §4.2/GH-003 (typo-tolerant search).
-- ----------------------------------------------------------------------------

-- pg_trgm backs the typo-tolerant free-text search ("transt 250" -> Transit
-- 250). pgcrypto (gen_random_uuid) is created in prisma/sql/auth_rls.sql.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Spec §2: year must be a sane model year (1990 .. two years ahead of "now").
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_year_check"
  CHECK ("year" BETWEEN 1990 AND extract(year from now())::int + 2);

-- Spec §2: full-text search index over the searchable fields.
CREATE INDEX "vehicles_search_idx" ON "vehicles"
  USING gin ((to_tsvector('simple',
    coalesce("make",'') || ' ' || coalesce("model",'') || ' ' ||
    coalesce("trim",'') || ' ' || coalesce("variant",'') || ' ' ||
    "year"::text)));

-- Typo-tolerant trigram index over the same searchable expression. Powers the
-- `%` similarity operator used by the browse search box (GH-003 AC).
CREATE INDEX "vehicles_search_trgm_idx" ON "vehicles"
  USING gin ((
    coalesce("make",'') || ' ' || coalesce("model",'') || ' ' ||
    coalesce("trim",'') || ' ' || coalesce("variant",'') || ' ' ||
    "year"::text) gin_trgm_ops);

-- Spec §2: at most one PUBLISHED row per (year, make, model, trim, variant).
-- Drafts/review/retired rows may duplicate freely (versioning).
CREATE UNIQUE INDEX "vehicles_published_uk"
  ON "vehicles" ("year", "make", "model", coalesce("trim",''), coalesce("variant",''))
  WHERE "status" = 'published';

