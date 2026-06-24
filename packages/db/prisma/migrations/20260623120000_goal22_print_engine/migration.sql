-- Goal 22 - print-ready paneling engine + shop print profile (B2B core).
--
-- Three additive changes, all backward-compatible (every existing row stays
-- valid). RLS for the two new tables lives in prisma/sql/auth_rls.sql and is
-- applied by `db:apply-sql` AFTER this migration:
--   * curvature_class_priors  - global reference data: public read, admin writes
--     (mirrors the vehicle catalogue).
--   * shop_print_profiles     - per-shop config: shop-member read + write
--     (mirrors the shops/orders shop-scoped policies).
-- The new vehicle_panels.curvature_* columns inherit the existing vehicle_panels
-- RLS (public read of published-vehicle panels, admin writes) - no policy change.
--
-- Per CLAUDE.md §6: when this is applied to prod via the Supabase MCP, insert the
-- corresponding _prisma_migrations row (SHA-256 checksum) so `prisma migrate
-- deploy` skips it cleanly. This migration is NOT applied to prod by the build -
-- deploy is gated on Archer's go.

-- CreateEnum: confidence/provenance of a panel's curvature factor (D4).
CREATE TYPE "curvature_source" AS ENUM (
  'measured_in_shop',
  'calibrated_sibling',
  'class_prior',
  'unknown'
);

-- AlterTable: additive curvature columns on vehicle_panels (all nullable or
-- defaulted, so existing rows remain valid). The print engine reads these to
-- correct flat template dims to true never-short dims (D4).
ALTER TABLE "vehicle_panels"
  ADD COLUMN "curvature_factor"      DECIMAL(5,3),
  ADD COLUMN "curvature_source"      "curvature_source" NOT NULL DEFAULT 'class_prior',
  ADD COLUMN "curvature_margin"      DECIMAL(4,3) NOT NULL DEFAULT 0.080,
  ADD COLUMN "curvature_measured_at" TIMESTAMPTZ,
  ADD COLUMN "curvature_notes"       TEXT;

-- Never let curvature data make a panel SHORT: a factor must be a real upward
-- multiplier (or NULL = use the prior), and the margin is a non-negative
-- one-sided allowance. Enforced so a bad write can't silently undercut a print.
ALTER TABLE "vehicle_panels"
  ADD CONSTRAINT "chk_vehicle_panels_curvature_factor"
    CHECK ("curvature_factor" IS NULL OR "curvature_factor" > 0),
  ADD CONSTRAINT "chk_vehicle_panels_curvature_margin"
    CHECK ("curvature_margin" >= 0 AND "curvature_margin" < 1);

-- CreateTable: versioned per-(body, panel-class, axis) curvature priors (D4 §5).
CREATE TABLE "curvature_class_priors" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "body_type"   "body_type" NOT NULL,
  "panel_class" TEXT NOT NULL,
  "view_axis"   TEXT NOT NULL,
  "k"           DECIMAL(5,3) NOT NULL,
  "margin"      DECIMAL(4,3) NOT NULL DEFAULT 0.080,
  "version"     INTEGER NOT NULL DEFAULT 1,
  "notes"       TEXT,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "curvature_class_priors_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "chk_curvature_class_priors_k" CHECK ("k" > 0),
  CONSTRAINT "chk_curvature_class_priors_margin" CHECK ("margin" >= 0 AND "margin" < 1),
  CONSTRAINT "chk_curvature_class_priors_axis" CHECK ("view_axis" IN ('length','width'))
);
CREATE UNIQUE INDEX "curvature_class_priors_key"
  ON "curvature_class_priors" ("body_type", "panel_class", "view_axis", "version");

-- CreateTable: per-shop print profile (D1). One row per shop.
CREATE TABLE "shop_print_profiles" (
  "id"                 UUID NOT NULL DEFAULT gen_random_uuid(),
  "shop_id"            UUID NOT NULL,
  "printer_key"        TEXT,
  "printer_label"      TEXT,
  "nominal_width_in"   DECIMAL(6,2) NOT NULL,
  "effective_width_in" DECIMAL(6,2) NOT NULL,
  "default_overlap_in" DECIMAL(5,2) NOT NULL DEFAULT 0.50,
  "bleed_in"           DECIMAL(5,2) NOT NULL DEFAULT 0.25,
  "media_type"         TEXT,
  "created_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at"         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "shop_print_profiles_pkey" PRIMARY KEY ("id"),
  -- The engine ALWAYS tiles to the effective width, so the data model enforces
  -- the never-short invariants: positive widths, effective never wider than the
  -- physical media, overlap strictly inside the media, non-negative bleed.
  CONSTRAINT "chk_shop_print_profiles_nominal" CHECK ("nominal_width_in" > 0),
  CONSTRAINT "chk_shop_print_profiles_effective"
    CHECK ("effective_width_in" > 0 AND "effective_width_in" <= "nominal_width_in"),
  CONSTRAINT "chk_shop_print_profiles_overlap"
    CHECK ("default_overlap_in" >= 0 AND "default_overlap_in" < "effective_width_in"),
  CONSTRAINT "chk_shop_print_profiles_bleed" CHECK ("bleed_in" >= 0)
);
CREATE UNIQUE INDEX "shop_print_profiles_shop_id_key" ON "shop_print_profiles" ("shop_id");

-- AddForeignKey
ALTER TABLE "shop_print_profiles"
  ADD CONSTRAINT "shop_print_profiles_shop_id_fkey"
  FOREIGN KEY ("shop_id") REFERENCES "shops" ("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Seed conservative curvature priors (biased UP, never short). Source: spike
-- 2026-06-22 §3b / §5. k per panel-class is applied across every body type and
-- both view axes; the print engine refines a specific (body, class) the moment a
-- real panel is measured (which writes vehicle_panels.curvature_* directly). The
-- generic 'panel' class is the fallback so any classifyPanel() output resolves to
-- a seeded prior rather than the worst-case unknown multiplier.
-- Idempotent: ON CONFLICT DO NOTHING on the versioned unique key.
INSERT INTO "curvature_class_priors" ("body_type", "panel_class", "view_axis", "k", "margin", "version", "notes")
SELECT b.bt::"body_type", pc.panel_class, ax.view_axis, pc.k, 0.080, 1, pc.notes
FROM (VALUES
  ('door',     1.100, 'door crown + leading/trailing edge wrap'),
  ('quarter',  1.150, 'wheel arch + C-pillar compound curvature'),
  ('fender',   1.180, 'compound shoulder + arch'),
  ('hood',     1.120, 'compound crown'),
  ('roof',     1.100, 'roof transition curvature'),
  ('bumper',   1.270, 'deep compound (worst case, reprints live here)'),
  ('rocker',   1.050, 'shallow rocker'),
  ('bed',      1.080, 'pickup box sides'),
  ('cab',      1.100, 'cab compound'),
  ('pillar',   1.100, 'pillar'),
  ('tailgate', 1.100, 'tailgate / liftgate'),
  ('slabside', 1.030, 'near-flat slab side (van/box constant width)'),
  ('panel',    1.150, 'generic conservative fallback')
) AS pc(panel_class, k, notes)
CROSS JOIN (VALUES ('length'), ('width')) AS ax(view_axis)
CROSS JOIN (VALUES
  ('sedan'), ('suv'), ('crossover'), ('pickup'), ('van'), ('box_truck'),
  ('sprinter'), ('motorcycle'), ('rv'), ('trailer'), ('boat'), ('equipment')
) AS b(bt)
ON CONFLICT ("body_type", "panel_class", "view_axis", "version") DO NOTHING;
