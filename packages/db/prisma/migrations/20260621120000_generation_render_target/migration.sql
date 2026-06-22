-- Goal 21 / T1 — render_target discriminator on generation_jobs + generation_images.
--
-- Adds a render_target column to both tables so photo AI renders can be
-- distinguished from template renders at every read. Default 'template'
-- keeps all existing rows valid; a CHECK constraint holds the domain to
-- exactly two values: 'template' and 'photo'.
--
-- Per CLAUDE.md section 6: when this is applied to prod via the Supabase MCP,
-- insert the corresponding _prisma_migrations row (SHA-256 checksum) so
-- `prisma migrate deploy` skips cleanly.
--
-- No new RLS policies needed: the existing owner policies on generation_jobs
-- and generation_images already cover all columns, including this new one.

-- AddColumn: render_target on generation_jobs (mutable work units).
ALTER TABLE "generation_jobs" ADD COLUMN "render_target" text NOT NULL DEFAULT 'template';

-- Check constraint holds the domain to the two valid values.
ALTER TABLE "generation_jobs" ADD CONSTRAINT "chk_generation_jobs_render_target"
  CHECK ("render_target" IN ('template', 'photo'));

-- AddColumn: render_target on generation_images (immutable provenance rows).
ALTER TABLE "generation_images" ADD COLUMN "render_target" text NOT NULL DEFAULT 'template';

-- Check constraint holds the domain to the two valid values.
ALTER TABLE "generation_images" ADD CONSTRAINT "chk_generation_images_render_target"
  CHECK ("render_target" IN ('template', 'photo'));
