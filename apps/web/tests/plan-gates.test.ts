// Free-plan gate logic (Goal 5 / B2C-011). Pure-function coverage; the
// server-side wiring is exercised by e2e/plan-gates.spec.ts.

import { describe, expect, it } from 'vitest';
import { vehicleSlotGate, generationRunGate } from '../lib/plan/gates';

const V1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const V2 = 'aaaaaaaa-0000-4000-8000-000000000002';
const V3 = 'aaaaaaaa-0000-4000-8000-000000000003';

describe('vehicleSlotGate (free = 2 slots)', () => {
  it('allows the first and second distinct vehicles', () => {
    expect(
      vehicleSlotGate({ plan: 'free', usedVehicleIds: [], requestedVehicleId: V1 }).allowed,
    ).toBe(true);
    expect(
      vehicleSlotGate({ plan: 'free', usedVehicleIds: [V1], requestedVehicleId: V2 }).allowed,
    ).toBe(true);
  });

  it('blocks a THIRD distinct vehicle with the limit in the result', () => {
    const r = vehicleSlotGate({ plan: 'free', usedVehicleIds: [V1, V2], requestedVehicleId: V3 });
    expect(r).toEqual({ allowed: false, reason: 'vehicle_slots', limit: 2 });
  });

  it('an already-used vehicle never consumes a new slot (character-slot pattern)', () => {
    expect(
      vehicleSlotGate({ plan: 'free', usedVehicleIds: [V1, V2], requestedVehicleId: V1 }).allowed,
    ).toBe(true);
  });
});

describe('generationRunGate (free = 3/month; Phase 2 seam)', () => {
  it('allows under the cap with remaining count', () => {
    expect(generationRunGate({ plan: 'free', runsThisMonth: 0 })).toEqual({
      allowed: true,
      remaining: 3,
    });
    expect(generationRunGate({ plan: 'free', runsThisMonth: 2 })).toEqual({
      allowed: true,
      remaining: 1,
    });
  });

  it('blocks at the cap', () => {
    expect(generationRunGate({ plan: 'free', runsThisMonth: 3 })).toEqual({
      allowed: false,
      reason: 'monthly_runs',
      limit: 3,
    });
  });
});
