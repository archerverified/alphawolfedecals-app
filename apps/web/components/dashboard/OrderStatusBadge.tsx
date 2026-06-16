// Status pill for the shop dashboard. Presentational + server-rendered (no
// 'use client'): renders the shared <Badge> primitive so order statuses use the
// design system's status palette. The human label stays sourced from
// lib/shop/order-status (unit-tested independently); only status → Badge variant
// is decided here. data-status carries the raw enum (the dashboard e2e asserts
// on it), so the markup contract the tests rely on is unchanged.

import { type OrderStatus } from '@alphawolf/db';
import { Badge } from '@alphawolf/ui/components/ui/badge';
import { orderStatusPresentation } from '@/lib/shop/order-status';

// submitted = awaiting action (warning) · in_production = active (neutral fill) ·
// fulfilled = done (success) · cancelled = inert/terminal (de-emphasised outline).
const STATUS_VARIANT: Record<OrderStatus, 'default' | 'success' | 'warning' | 'outline'> = {
  submitted: 'warning',
  in_production: 'default',
  fulfilled: 'success',
  cancelled: 'outline',
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label } = orderStatusPresentation(status);
  return (
    <Badge variant={STATUS_VARIANT[status]} data-testid="order-status-badge" data-status={status}>
      {label}
    </Badge>
  );
}
