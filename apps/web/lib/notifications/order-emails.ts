// High-level order email orchestration (Goal 3c). Bridges a db.order to the pure
// @alphawolf/notifications dispatch: resolves a vehicle label, narrows the order
// down to PII-safe fields, and routes each template to the right recipient.
//
// Everything here is best-effort and NON-THROWING: the order already exists by
// the time these run, so a flaky email (or a failed lookup) must never bubble
// back into the status transition. The dispatch layer already swallows send
// failures; this wrapper additionally guards the DB lookup + effects build.

import { projects, vehicles } from '@alphawolf/db';
import {
  firstNameOf,
  notifyOrderFulfilled,
  notifyOrderInProduction,
  notifyOrderReceived,
  notifyOrderSubmitted,
  orderNumberFromId,
  type OrderEmailData,
} from '@alphawolf/notifications';
import * as Sentry from '@sentry/nextjs';
import { buildNotificationEffects } from './effects';

export interface OrderEmailContext {
  orderId: string;
  ownerUserId: string;
  projectId: string;
  customerEmail: string;
  customerName: string;
}

// New-order receipts go to the production team's inbox. The Shop model has no
// contact email (company/website/address are encrypted; no email field), and
// resolving member emails would decrypt PII into a mail header — so route to one
// ops inbox. Goal 3b can refine this to per-shop addresses.
function opsInbox(): string | null {
  return process.env.ORDERS_OPS_EMAIL ?? process.env.RESEND_FROM_EMAIL ?? null;
}

async function resolveVehicleLabel(userId: string, projectId: string): Promise<string> {
  const project = await projects.getProject(userId, projectId);
  if (!project) return 'your vehicle';
  const vehicle = await vehicles.getPublishedDetail(project.vehicleId).catch(() => null);
  return vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : project.name;
}

function buildData(ctx: OrderEmailContext, vehicleLabel: string): OrderEmailData {
  return {
    firstName: firstNameOf(ctx.customerName),
    orderNumber: orderNumberFromId(ctx.orderId),
    vehicleLabel,
  };
}

function reportFailure(error: unknown, ctx: OrderEmailContext, scope: string): void {
  Sentry.captureException(error, {
    tags: { feature: 'order-notifications', scope },
    extra: { orderId: ctx.orderId },
  });
}

// Fired at submit time: customer "we received your design" + shop "new order".
export async function dispatchOrderSubmittedEmails(ctx: OrderEmailContext): Promise<void> {
  try {
    const effects = buildNotificationEffects(ctx.ownerUserId);
    const data = buildData(ctx, await resolveVehicleLabel(ctx.ownerUserId, ctx.projectId));
    const ops = opsInbox();
    await Promise.all([
      notifyOrderSubmitted(ctx.customerEmail, data, effects),
      ops ? notifyOrderReceived(ops, data, effects) : Promise.resolve(),
    ]);
  } catch (error) {
    reportFailure(error, ctx, 'dispatchOrderSubmittedEmails');
  }
}

// Goal 3b seam: call from the shop status-transition Server Action after the
// db.order status flips. Only in_production ("accepted") + fulfilled ("ready for
// pickup") notify the customer; submitted/cancelled do not send a customer email.
export async function dispatchOrderStatusEmail(
  ctx: OrderEmailContext,
  status: 'in_production' | 'fulfilled',
): Promise<void> {
  try {
    const effects = buildNotificationEffects(ctx.ownerUserId);
    const data = buildData(ctx, await resolveVehicleLabel(ctx.ownerUserId, ctx.projectId));
    if (status === 'in_production') {
      await notifyOrderInProduction(ctx.customerEmail, data, effects);
    } else {
      await notifyOrderFulfilled(ctx.customerEmail, data, effects);
    }
  } catch (error) {
    reportFailure(error, ctx, 'dispatchOrderStatusEmail');
  }
}
