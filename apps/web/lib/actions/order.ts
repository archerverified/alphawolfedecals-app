'use server';

// Submit-for-production action (Goal 3a PR5). RPC-style like saveCanvasAction:
// it relies on Next.js's built-in Server-Action origin check plus requireUser +
// RLS (orders_owner_all WITH CHECK ties the row to the session user), so it does
// not carry the double-submit CSRF token that the FormData actions use.
//
// Errors thrown here are captured by the Sentry Next.js SDK's automatic Server
// Action instrumentation (see apps/web sentry config) — no manual scope wrapper.

import { orders } from '@alphawolf/db';
import { requireUser } from '../admin/guard';
import { dispatchOrderSubmittedEmails } from '../notifications/order-emails';

export type SubmitForProductionResult =
  | { ok: true; orderId: string }
  | { ok: false; reason: 'invalid_input' | 'no_project' | 'no_working_version' };

// Light server-side email shape check — the modal validates too, but never trust
// the client. Not a full RFC validator; just rejects the obvious garbage.
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function submitForProductionAction(input: {
  projectId: string;
  contactName: string;
  contactEmail: string;
  contactPhone?: string;
  deliveryNotes?: string;
}): Promise<SubmitForProductionResult> {
  const user = await requireUser(`/projects/${input.projectId}/editor`);

  const contactName = (input.contactName ?? '').trim();
  const contactEmail = (input.contactEmail ?? '').trim();
  if (!contactName || !EMAIL_RE.test(contactEmail)) {
    return { ok: false, reason: 'invalid_input' };
  }

  const res = await orders.submitForProduction(user.id, {
    projectId: input.projectId,
    contactName,
    contactEmail,
    contactPhone: (input.contactPhone ?? '').trim() || null,
    deliveryNotes: (input.deliveryNotes ?? '').trim() || null,
  });

  if (!res.ok) return { ok: false, reason: res.reason };

  // Notify the customer ("we received your design") + the shop ("new order").
  // Awaited so the send flushes before this serverless function can freeze, but
  // it's best-effort end to end: dispatchOrderSubmittedEmails never throws, and
  // this try/catch is a final backstop so a notification fault can never undo an
  // order that was already created (spec: email failure must not block submit).
  try {
    await dispatchOrderSubmittedEmails({
      orderId: res.orderId,
      ownerUserId: user.id,
      projectId: input.projectId,
      customerEmail: contactEmail,
      customerName: contactName,
    });
  } catch {
    // swallowed — already reported inside dispatchOrderSubmittedEmails
  }

  return { ok: true, orderId: res.orderId };
}
