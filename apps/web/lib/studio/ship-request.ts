// Shared "ship a template request" step (Goal 6 D4). Used by BOTH the manual
// queue action (admin marks a request shipped) and the Studio publish action
// (publishing a template auto-ships its linked request), so the email + the
// vehicle_request_fulfilled analytics stay identical on either path.
//
// Email semantics follow GH-017 + ADR-0014 invariant 10's spirit: the status
// transition is the source of truth and a failed send never rolls it back —
// but post-PR #134 the failure is LOUD (Sentry + PostHog email_delivery_failed
// via the throwing sendEmail), not swallowed silently.

import { sendEmail } from '@alphawolf/auth/server';
import { vehicleRequests } from '@alphawolf/db';
import * as Sentry from '@sentry/nextjs';
import { captureServerEvent } from '../notifications/posthog-server';

function baseUrl(): string {
  return process.env.APP_BASE_URL ?? 'http://localhost:3000';
}

// Requester-controlled year/make/model land in the email HTML — escape them.
const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export type ShipResult = { ok: true; emailed: boolean } | { ok: false; reason: 'not_found' };

export async function shipRequestAndNotify(
  adminId: string,
  requestId: string,
  // Null preserves the legacy queue behavior: shipped without a linked vehicle
  // still notifies, deep-linking to the browse page instead of a detail page.
  shippedVehicleId: string | null,
): Promise<ShipResult> {
  const existing = await vehicleRequests.adminGetRequest(adminId, requestId);
  if (!existing) return { ok: false, reason: 'not_found' };

  const updated = await vehicleRequests.adminUpdateStatus(
    adminId,
    requestId,
    'shipped',
    shippedVehicleId,
  );

  let emailed = false;
  if (updated.requesterEmail) {
    const name = escapeHtml(`${updated.year} ${updated.make} ${updated.model}`);
    const link = shippedVehicleId
      ? `${baseUrl()}/vehicles/${shippedVehicleId}`
      : `${baseUrl()}/vehicles/select`;
    try {
      await sendEmail({
        to: updated.requesterEmail,
        subject: `Your requested wrap template shipped: ${name}`,
        html: `<p>Good news — the template you requested (<strong>${name}</strong>) is ready.</p><p><a href="${link}">Open it in Alpha Wolf Wrap Studio</a></p>`,
        text: `The template you requested (${name}) is ready: ${link}`,
      });
      emailed = true;
    } catch (err) {
      console.error('[studio] shipped email failed', err);
      Sentry.captureException(err, {
        tags: { feature: 'template-studio', action: 'ship-request' },
        extra: { requestId, shippedVehicleId },
      });
    }
  }

  await captureServerEvent('vehicle_request_fulfilled', updated.requesterId ?? 'server', {
    requestId,
    vehicleId: shippedVehicleId,
    emailed,
  });

  return { ok: true, emailed };
}
