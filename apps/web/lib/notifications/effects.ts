// Wires the real side effects into @alphawolf/notifications' dispatch (Goal 3c).
//
// - send:            @alphawolf/auth's sendEmail — REUSES the one Resend client
//                    (spec: do not instantiate a second Resend instance).
// - capture:         server-side PostHog (email_sent / email_delivery_failed).
// - captureException: Sentry, so a Resend/deliverability failure surfaces in the
//                    dashboard (the dispatch swallows it so the order isn't blocked).
// - enqueueRetry:    BullMQ retry queue (best-effort).

import { sendEmail } from '@alphawolf/auth/server';
import type { NotificationEffects } from '@alphawolf/notifications';
import * as Sentry from '@sentry/nextjs';
import { captureServerEvent } from './posthog-server';
import { enqueueEmailRetry } from './retry-queue';

// distinctId ties the analytics event to the order's owner so deliverability can
// be graphed per user/funnel in PostHog.
export function buildNotificationEffects(distinctId: string): NotificationEffects {
  return {
    send: (message) =>
      sendEmail({
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    capture: (event, props) => captureServerEvent(event, distinctId, props),
    captureException: (error, context) => {
      Sentry.captureException(error, { extra: context, tags: { feature: 'order-notifications' } });
    },
    enqueueRetry: (job) => enqueueEmailRetry(job),
  };
}
