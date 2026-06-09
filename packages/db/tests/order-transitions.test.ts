// Order lifecycle state machine (Goal 3b PR2). This graph is the enforcement
// boundary — transitionOrderStatus rejects any move it disallows — so it's
// pinned here against the canonical lifecycle. The web ORDER_ACTIONS button map
// is pinned to the SAME canonical graph in apps/web/tests/order-status.test.ts;
// changing the lifecycle therefore requires updating both, which is the
// intended friction that keeps the UI and the server from drifting apart.

import { describe, expect, it } from 'vitest';
import { ORDER_TRANSITIONS, canTransitionOrder, type OrderStatus } from '../src/repos/orders';

const CANONICAL: Record<OrderStatus, OrderStatus[]> = {
  submitted: ['in_production', 'cancelled'],
  in_production: ['fulfilled'],
  fulfilled: [],
  cancelled: [],
};

describe('ORDER_TRANSITIONS', () => {
  it('matches the canonical order lifecycle', () => {
    expect(
      Object.fromEntries(Object.entries(ORDER_TRANSITIONS).map(([k, v]) => [k, [...v]])),
    ).toEqual(CANONICAL);
  });

  it('terminal states have no outgoing transitions', () => {
    expect(ORDER_TRANSITIONS.fulfilled).toEqual([]);
    expect(ORDER_TRANSITIONS.cancelled).toEqual([]);
  });
});

describe('canTransitionOrder', () => {
  it('allows the forward production path and cancel-from-submitted', () => {
    expect(canTransitionOrder('submitted', 'in_production')).toBe(true);
    expect(canTransitionOrder('in_production', 'fulfilled')).toBe(true);
    expect(canTransitionOrder('submitted', 'cancelled')).toBe(true);
  });

  it('rejects skips, reversals, and cancelling a started order', () => {
    expect(canTransitionOrder('submitted', 'fulfilled')).toBe(false); // can't skip production
    expect(canTransitionOrder('in_production', 'submitted')).toBe(false); // no reversal
    expect(canTransitionOrder('in_production', 'cancelled')).toBe(false); // too late to cancel
    expect(canTransitionOrder('fulfilled', 'in_production')).toBe(false); // terminal
    expect(canTransitionOrder('cancelled', 'submitted')).toBe(false); // terminal
  });

  it('rejects a no-op self-transition', () => {
    expect(canTransitionOrder('submitted', 'submitted')).toBe(false);
    expect(canTransitionOrder('in_production', 'in_production')).toBe(false);
  });
});
