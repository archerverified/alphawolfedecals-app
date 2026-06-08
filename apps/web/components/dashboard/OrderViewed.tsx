'use client';

// Fires the `order_viewed` PostHog event when a shop member opens an order
// detail page. Analytics-only — renders nothing. Carries the order id (a UUID,
// not PII) and the status; never the customer contact fields.

import { useEffect } from 'react';
import { type OrderStatus } from '@alphawolf/db';
import { capture } from '@/lib/analytics';

export function OrderViewed({ orderId, status }: { orderId: string; status: OrderStatus }) {
  useEffect(() => {
    capture('order_viewed', { order_id: orderId, status });
  }, [orderId, status]);
  return null;
}
