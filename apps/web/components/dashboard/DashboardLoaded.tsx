'use client';

// Fires the `dashboard_loaded` PostHog event once when the shop dashboard
// mounts. Analytics-only — renders nothing. Properties carry no PII (just the
// order count); the server component owns the actual data.

import { useEffect } from 'react';
import { capture } from '@/lib/analytics';

export function DashboardLoaded({ orderCount }: { orderCount: number }) {
  useEffect(() => {
    capture('dashboard_loaded', { order_count: orderCount });
  }, [orderCount]);
  return null;
}
