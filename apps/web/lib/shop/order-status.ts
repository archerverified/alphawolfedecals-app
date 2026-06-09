// Presentation for order statuses on the shop dashboard (Goal 3b).
//
// Pure mapping — kept separate from the badge component so it is unit-testable
// without rendering React, and so the list, the detail header, and the status
// summary all label a status identically. Copy is operator-first ("In
// production", not "Your order is being made").

import { type OrderStatus } from '@alphawolf/db';

export type OrderStatusPresentation = {
  label: string;
  // Tailwind classes for the status pill (background / text / ring).
  className: string;
};

const PRESENTATION: Record<OrderStatus, OrderStatusPresentation> = {
  submitted: {
    label: 'Submitted',
    className: 'bg-amber-100 text-amber-800 ring-amber-200',
  },
  in_production: {
    label: 'In production',
    className: 'bg-blue-100 text-blue-800 ring-blue-200',
  },
  fulfilled: {
    label: 'Fulfilled',
    className: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
  },
  cancelled: {
    label: 'Cancelled',
    className: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
  },
};

export function orderStatusPresentation(status: OrderStatus): OrderStatusPresentation {
  return PRESENTATION[status];
}

// Display order for the status-count summary row (lifecycle order, terminal
// states last).
export const ORDER_STATUS_DISPLAY_ORDER: readonly OrderStatus[] = [
  'submitted',
  'in_production',
  'fulfilled',
  'cancelled',
] as const;

export type OrderActionDescriptor = {
  to: OrderStatus;
  label: string;
  variant: 'default' | 'outline';
};

// Which transitions the detail page surfaces as buttons, with operator-first
// labels. This map decides PRESENTATION only — the legal-transition graph is
// server-authoritative (orders.ORDER_TRANSITIONS, enforced in
// transitionOrderStatus). A consistency unit test asserts the two never drift,
// so the UI can never offer a move the server would reject (or hide a legal
// one). Defined here rather than imported from @alphawolf/db so the client
// bundle never pulls in Prisma.
export const ORDER_ACTIONS: Record<OrderStatus, readonly OrderActionDescriptor[]> = {
  submitted: [
    { to: 'in_production', label: 'Start production', variant: 'default' },
    { to: 'cancelled', label: 'Cancel order', variant: 'outline' },
  ],
  in_production: [{ to: 'fulfilled', label: 'Mark fulfilled', variant: 'default' }],
  fulfilled: [],
  cancelled: [],
};
