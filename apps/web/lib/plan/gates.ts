// Free-plan gate logic (Goal 5 / B2C-011). Pure functions — the server
// actions compose these with @alphawolf/db's getPlanGateContext. PRD §3
// step 2 + §9.4: limits are enforced SERVER-SIDE with friendly messaging,
// never a silent failure.

import { PLAN_LIMITS, type PlanName } from '@alphawolf/db';

export type SlotGateResult =
  | { allowed: true }
  | { allowed: false; reason: 'vehicle_slots'; limit: number };

/**
 * Vehicle-slot gate: a project on an ALREADY-USED vehicle never consumes a
 * new slot (the slot is the vehicle, not the project — character-slot
 * pattern, PRD §5).
 */
export function vehicleSlotGate(input: {
  plan: PlanName;
  usedVehicleIds: string[];
  requestedVehicleId: string;
}): SlotGateResult {
  const limit = PLAN_LIMITS[input.plan].vehicleSlots;
  if (input.usedVehicleIds.includes(input.requestedVehicleId)) return { allowed: true };
  if (input.usedVehicleIds.length < limit) return { allowed: true };
  return { allowed: false, reason: 'vehicle_slots', limit };
}

export type RunGateResult =
  | { allowed: true; remaining: number }
  | { allowed: false; reason: 'monthly_runs'; limit: number };

/**
 * Monthly generation-run cap. PHASE 2 SEAM (B2C-007): generation runs don't
 * exist yet, so nothing calls this in Phase 1 — it ships now (with tests) so
 * the AI build wires a counter into an already-enforced gate instead of
 * inventing one under deadline.
 */
export function generationRunGate(input: { plan: PlanName; runsThisMonth: number }): RunGateResult {
  const limit = PLAN_LIMITS[input.plan].monthlyGenerationRuns;
  if (input.runsThisMonth < limit) {
    return { allowed: true, remaining: limit - input.runsThisMonth };
  }
  return { allowed: false, reason: 'monthly_runs', limit };
}
