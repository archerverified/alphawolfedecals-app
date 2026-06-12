-- Goal 6 (PR #135 verification follow-up) — panel identity is (vehicle, view,
-- name): saved canvas artwork keys on the panel UUID and the Studio's
-- setVehiclePanels sync preserves UUIDs by matching (view, name), so duplicate
-- pairs would leave un-synced ghost panels. Live data verified duplicate-free
-- before this constraint (the Transit's 6 panels are the only rows).

-- CreateIndex
CREATE UNIQUE INDEX "vehicle_panels_identity_uk" ON "vehicle_panels"("vehicle_id", "view", "name");
