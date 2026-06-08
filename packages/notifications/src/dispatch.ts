// Dispatch orchestration. Renders the template, sends via the injected client,
// and instruments the outcome. The cardinal rule (spec): a delivery failure must
// NEVER propagate — the caller is a status transition that must not be blocked by
// a flaky Resend. On failure we capture to Sentry + PostHog and best-effort
// enqueue a retry; the function always resolves to a DispatchResult.

import { renderOrderEmail } from './templates.js';
import type {
  DispatchResult,
  EmailMessage,
  NotificationEffects,
  NotificationKind,
  OrderEmailData,
} from './types.js';

export async function dispatchOrderEmail(
  kind: NotificationKind,
  to: string,
  data: OrderEmailData,
  effects: NotificationEffects,
): Promise<DispatchResult> {
  const message: EmailMessage = { to, ...renderOrderEmail(kind, data) };

  try {
    await effects.send(message);
    await effects.capture?.('email_sent', { kind, template: kind });
    return { kind, sent: true, queuedForRetry: false };
  } catch (error) {
    effects.captureException?.(error, { scope: 'notifications.dispatch', kind });
    await effects.capture?.('email_delivery_failed', { kind, template: kind });

    let queuedForRetry = false;
    if (effects.enqueueRetry) {
      try {
        await effects.enqueueRetry({ kind, ...message });
        queuedForRetry = true;
      } catch (retryError) {
        // Even the retry queue is best-effort. Surface it, but never throw.
        effects.captureException?.(retryError, { scope: 'notifications.enqueueRetry', kind });
      }
    }
    return { kind, sent: false, queuedForRetry };
  }
}

export function notifyOrderSubmitted(
  to: string,
  data: OrderEmailData,
  effects: NotificationEffects,
): Promise<DispatchResult> {
  return dispatchOrderEmail('order_submitted', to, data, effects);
}

export function notifyOrderReceived(
  to: string,
  data: OrderEmailData,
  effects: NotificationEffects,
): Promise<DispatchResult> {
  return dispatchOrderEmail('order_received', to, data, effects);
}

export function notifyOrderInProduction(
  to: string,
  data: OrderEmailData,
  effects: NotificationEffects,
): Promise<DispatchResult> {
  return dispatchOrderEmail('order_in_production', to, data, effects);
}

export function notifyOrderFulfilled(
  to: string,
  data: OrderEmailData,
  effects: NotificationEffects,
): Promise<DispatchResult> {
  return dispatchOrderEmail('order_fulfilled', to, data, effects);
}
