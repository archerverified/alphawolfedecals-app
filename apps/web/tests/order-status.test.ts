// Order-status presentation (Goal 3b PR1). Pure mapping — no DB, no React. The
// dashboard list, the status summary, and the detail header all label a status
// through orderStatusPresentation, so this is the single guard against a missing
// or off-brand status label.

import { describe, it, expect } from 'vitest';
import { orderStatusPresentation, ORDER_STATUS_DISPLAY_ORDER } from '@/lib/shop/order-status';

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
