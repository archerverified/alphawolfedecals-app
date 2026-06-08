// Renders the status pill and proves the wiring the dashboard e2e relies on:
// the human label is shown and the machine-readable `data-status` attribute
// carries the raw enum value. Plain DOM assertions (no jest-dom), matching the
// existing component-test idiom in this package.

import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { OrderStatusBadge } from './OrderStatusBadge';

afterEach(cleanup);

describe('OrderStatusBadge', () => {
  it('shows the operator label and raw status for in_production', () => {
    render(<OrderStatusBadge status="in_production" />);
    const badge = screen.getByTestId('order-status-badge');
    expect(badge.textContent).toBe('In production');
    expect(badge.getAttribute('data-status')).toBe('in_production');
  });

  it('shows the label for a terminal status', () => {
    render(<OrderStatusBadge status="cancelled" />);
    const badge = screen.getByTestId('order-status-badge');
    expect(badge.textContent).toBe('Cancelled');
    expect(badge.getAttribute('data-status')).toBe('cancelled');
  });
});
