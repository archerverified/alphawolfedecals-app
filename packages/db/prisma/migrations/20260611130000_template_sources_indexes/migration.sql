-- Goal 6 (PR #135 review follow-up) — FK indexes on template_sources.
--
-- request_id: the D4 Studio worklist queries sources by their linked request,
-- and the FK's ON DELETE SET NULL maintenance on vehicle_template_requests
-- otherwise seq-scans this table. created_by: ON DELETE RESTRICT makes every
-- user deletion check this FK. Separate migration because the base
-- 20260611120000_template_sources migration was already applied.

-- CreateIndex
CREATE INDEX "template_sources_request_idx" ON "template_sources"("request_id");
CREATE INDEX "template_sources_created_by_idx" ON "template_sources"("created_by");
