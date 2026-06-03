-- Goal 2a — Alpha Wolf wrapped-template fields on the vehicle template table.
--
-- The `vehicles` table IS the vehicle-template library (see schema.prisma header,
-- GH-003/004). These five columns carry the metadata for an Alpha Wolf-wrapped
-- SVG template: the Storage key of the wrapped SVG, how many views the wrap frame
-- shows, a human dimensions string, the wrap scale denominator, and the
-- AW-TPL-NNNN catalogue id.
--
-- All five are ADDITIVE and NULLABLE (except scale_denom, which carries a safe
-- DEFAULT). The table is heterogeneous: it already holds non-AW rows (the seeded
-- Ford Transit) that legitimately have no AW wrap, so a NOT NULL constraint would
-- break the existing data. The seed (scripts/seed-vehicle-templates.ts) always
-- populates all five for the AW rows; the partial-coverage is intentional.

-- AlterTable — add the columns.
ALTER TABLE "vehicles" ADD COLUMN "svg_storage_key" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "view_count" SMALLINT;
ALTER TABLE "vehicles" ADD COLUMN "dimensions_text" TEXT;
ALTER TABLE "vehicles" ADD COLUMN "scale_denom" SMALLINT NOT NULL DEFAULT 20;
ALTER TABLE "vehicles" ADD COLUMN "alpha_wolf_tpl_id" TEXT;

-- Uniqueness. Postgres unique indexes permit multiple NULLs, so non-AW rows
-- (NULL key / NULL tpl id) never collide; only populated AW values are unique.
CREATE UNIQUE INDEX "vehicles_svg_storage_key_key" ON "vehicles"("svg_storage_key");
CREATE UNIQUE INDEX "vehicles_alpha_wolf_tpl_id_key" ON "vehicles"("alpha_wolf_tpl_id");

-- ----------------------------------------------------------------------------
-- CHECK constraints the Prisma schema language can't express. NULL passes a
-- CHECK, so these only bind the AW rows that actually set the value.
-- ----------------------------------------------------------------------------

-- view_count is the number of views baked into the wrap frame (1..4).
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_view_count_check"
  CHECK ("view_count" IS NULL OR "view_count" BETWEEN 1 AND 4);

-- alpha_wolf_tpl_id locks the AW-TPL-NNNN namespace so it can extend later
-- (AW-LIB-NNNN, AW-CUSTOM-NNNN) without ambiguity.
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_alpha_wolf_tpl_id_format_check"
  CHECK ("alpha_wolf_tpl_id" IS NULL OR "alpha_wolf_tpl_id" ~ '^AW-TPL-\d{4}$');

-- ----------------------------------------------------------------------------
-- Widen the model-year lower bound 1990 -> 1900. The catalogue now includes
-- vintage wrap subjects (e.g. the 1973 Crown Super Coach, AW-TPL-0003) that the
-- original §2 bound rejected. This is a WIDENING of an existing CHECK: it only
-- accepts more rows, never rejects an existing one, so it cannot break data.
-- Not an ADR-0013 invariant.
-- ----------------------------------------------------------------------------
ALTER TABLE "vehicles" DROP CONSTRAINT "vehicles_year_check";
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_year_check"
  CHECK ("year" BETWEEN 1900 AND extract(year from now())::int + 2);
