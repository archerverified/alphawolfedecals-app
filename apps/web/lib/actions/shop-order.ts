'use server';

// Shop order status-transition action (Goal 3b PR2). Same RPC shape as
// submitForProductionAction: it relies on Next.js's built-in Server-Action
// origin check plus requireShopUser (which layers requireUser), and on RLS —
// transitionOrderStatus only writes rows the orders_shop_update policy (PR3)
// permits for one of the caller's shops. Thrown errors are captured by the
// Sentry Next.js SDK's automatic Server Action instrumentation; no manual scope.

import { orders, type OrderStatus } from '@alphawolf/db';
import { requireShopUser } from '../shop/guard';

export type TransitionOrderResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; reason: 'not_found' | 'invalid_transition' | 'conflict' };

export async function transitionOrderAction(input: {
  orderId: string;
  to: OrderStatus;
}): Promise<TransitionOrderResult> {
  const { user, shopIds } = await requireShopUser(`/dashboard/orders/${input.orderId}`);
  return orders.transitionOrderStatus(user.id, {
    orderId: input.orderId,
    shopIds,
    to: input.to,
  });
}
