// Order-status presentation (Goal 3b PR1). Pure mapping — no DB, no React. The
// dashboard list, the status summary, and the detail header all label a status
// through orderStatusPresentation, so this is the single guard against a missing
// or off-brand status label.

import { describe, it, expect } from 'vitest';
import {
  orderStatusPresentation,
  ORDER_STATUS_DISPLAY_ORDER,
  ORDER_ACTIONS,
} from '@/lib/shop/order-status';

describe('orderStatusPresentation', () => {
  it('maps every status to a non-empty label and a pill colour', () => {
    for (const status of ORDER_STATUS_DISPLAY_ORDER) {
      const { label, className } = orderStatusPresentation(status);
      expect(label.length).toBeGreaterThan(0);
      expect(className).toMatch(/\bbg-/);
      expect(className).toMatch(/\btext-/);
    }
  });

  it('uses operator-first labels (no second-person customer copy)', () => {
    expect(orderStatusPresentation('submitted').label).toBe('Submitted');
    expect(orderStatusPresentation('in_production').label).toBe('In production');
    expect(orderStatusPresentation('fulfilled').label).toBe('Fulfilled');
    expect(orderStatusPresentation('cancelled').label).toBe('Cancelled');
  });

  it('lists the four statuses in lifecycle order, terminal states last', () => {
    expect([...ORDER_STATUS_DISPLAY_ORDER]).toEqual([
      'submitted',
      'in_production',
      'fulfilled',
      'cancelled',
    ]);
  });
});

describe('ORDER_ACTIONS (dashboard button map)', () => {
  // Same canonical lifecycle pinned in packages/db/tests/order-transitions.test.ts
  // against the server-side ORDER_TRANSITIONS graph. Both are kept in lockstep so
  // the UI never offers a transition the server rejects, nor hides a legal one.
  const CANONICAL: Record<string, string[]> = {
    submitted: ['in_production', 'cancelled'],
    in_production: ['fulfilled'],
    fulfilled: [],
    cancelled: [],
  };

  it('surfaces exactly the legal transitions for each status', () => {
    const graph = Object.fromEntries(
      Object.entries(ORDER_ACTIONS).map(([status, actions]) => [status, actions.map((a) => a.to)]),
    );
    expect(graph).toEqual(CANONICAL);
  });

  it('gives every action a non-empty label and a valid button variant', () => {
    for (const actions of Object.values(ORDER_ACTIONS)) {
      for (const action of actions) {
        expect(action.label.length).toBeGreaterThan(0);
        expect(['default', 'outline']).toContain(action.variant);
      }
    }
  });
});
