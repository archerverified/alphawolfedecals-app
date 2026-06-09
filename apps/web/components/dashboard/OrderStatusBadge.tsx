// Status pill for the shop dashboard. Presentational + server-rendered (no
// 'use client'): the label/colour mapping lives in lib/shop/order-status so it
// is unit-tested independently of this markup.

import { type OrderStatus } from '@alphawolf/db';
import { orderStatusPresentation } from '@/lib/shop/order-status';

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  const { label, className } = orderStatusPresentation(status);
  return (
    <span
      data-testid="order-status-badge"
      data-status={status}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${className}`}
    >
      {label}
    </span>
  );
}
