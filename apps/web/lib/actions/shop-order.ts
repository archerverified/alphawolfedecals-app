'use server';

// Shop order status-transition action (Goal 3b PR2). Same RPC shape as
// submitForProductionAction: it relies on Next.js's built-in Server-Action
// origin check plus requireShopUser (which layers requireUser), and on RLS —
// transitionOrderStatus only writes rows the orders_shop_update policy (PR3)
// permits for one of the caller's shops. Thrown errors are captured by the
// Sentry Next.js SDK's automatic Server Action instrumentation; no manual scope.

import { orders, type OrderStatus } from '@alphawolf/db';
import { requireShopUser } from '../shop/guard';
import { dispatchOrderStatusEmail } from '../notifications/order-emails';

export type TransitionOrderResult =
  | { ok: true; status: OrderStatus }
  | { ok: false; reason: 'not_found' | 'invalid_transition' | 'conflict' };

export async function transitionOrderAction(input: {
  orderId: string;
  to: OrderStatus;
}): Promise<TransitionOrderResult> {
  const { user, shopIds } = await requireShopUser(`/dashboard/orders/${input.orderId}`);
  const result = await orders.transitionOrderStatus(user.id, {
    orderId: input.orderId,
    shopIds,
    to: input.to,
  });

  // Goal 20 D2: notify the customer when the shop ACCEPTS (in_production) or
  // COMPLETES (fulfilled) the order. dispatchOrderStatusEmail was built as a
  // Goal-3b seam but was never wired in, so status changes never reached the
  // customer. Best-effort: load the order on the shop's RLS connection to build
  // the email context, and never let a notification fault undo a transition that
  // already committed (the email layer is non-throwing; this try/catch is a
  // final backstop).
  if (result.ok && (result.status === 'in_production' || result.status === 'fulfilled')) {
    try {
      const order = await orders.getShopOrder(user.id, input.orderId, shopIds);
      if (order) {
        await dispatchOrderStatusEmail(
          {
            orderId: order.id,
            ownerUserId: order.ownerUserId,
            projectId: order.projectId,
            customerEmail: order.contactEmail,
            customerName: order.contactName,
          },
          result.status,
        );
      }
    } catch {
      // swallowed: dispatchOrderStatusEmail already reports inside; the
      // transition already committed and must be returned regardless.
    }
  }

  return result;
}
