'use client';

// Status-transition controls for an order on the shop dashboard (Goal 3b PR2).
// Surfaces only the moves legal from the current status (ORDER_ACTIONS, kept in
// sync with the server-side ORDER_TRANSITIONS graph by a consistency test),
// calls the transition server action, fires order_status_changed (no PII), and
// router.refresh()es so the server component re-renders with the new status.

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { type OrderStatus } from '@alphawolf/db';
import { ORDER_ACTIONS, orderStatusPresentation } from '@/lib/shop/order-status';
import { capture } from '@/lib/analytics';
import { transitionOrderAction } from '@/lib/actions/shop-order';

export function OrderActions({ orderId, status }: { orderId: string; status: OrderStatus }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyTo, setBusyTo] = useState<OrderStatus | null>(null);
  const actions = ORDER_ACTIONS[status];

  if (actions.length === 0) {
    return (
      <p className="text-sm text-zinc-500" data-testid="order-actions-terminal">
        No further actions — this order is {orderStatusPresentation(status).label.toLowerCase()}.
      </p>
    );
  }

  const run = (to: OrderStatus) => {
    if (pending) return;
    setBusyTo(to);
    startTransition(async () => {
      try {
        const res = await transitionOrderAction({ orderId, to });
        if (res.ok) {
          capture('order_status_changed', {
            order_id: orderId,
            from_status: status,
            to_status: res.status,
          });
          toast.success(`Order moved to “${orderStatusPresentation(res.status).label}”.`);
          router.refresh();
        } else if (res.reason === 'invalid_transition') {
          toast.error('That status change isn’t allowed.');
        } else if (res.reason === 'not_found') {
          toast.error('Order not found.');
        } else {
          toast.error('Order changed since you loaded it — refresh and try again.');
        }
      } catch {
        toast.error('Could not update the order — please try again.');
      } finally {
        setBusyTo(null);
      }
    });
  };

  return (
    <div className="flex flex-wrap gap-2" data-testid="order-actions">
      {actions.map((a) => (
        <Button
          key={a.to}
          variant={a.variant}
          disabled={pending}
          data-testid={`transition-${a.to}`}
          onClick={() => run(a.to)}
          className="gap-1.5"
        >
          {pending && busyTo === a.to ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Working…
            </>
          ) : (
            a.label
          )}
        </Button>
      ))}
    </div>
  );
}
