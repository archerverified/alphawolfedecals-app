'use server';

// Admin request-queue status transitions (GH-004 queue + GH-017 ship email).
// On "shipped", emails the requester a deep link to the new template — but only
// if they opted in (requesterEmail is null on opt-out). Best-effort: a failed
// send is logged, not surfaced, so it never blocks the status change.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CSRF_COOKIE_NAME, CSRF_FIELD_NAME, sendEmail, verifyCsrf } from '@alphawolf/auth/server';
import { vehicleRequests } from '@alphawolf/db';
import { requireAdmin } from '../admin/guard';

async function csrfOk(form: FormData): Promise<boolean> {
  const submitted = form.get(CSRF_FIELD_NAME);
  const cookie = (await cookies()).get(CSRF_COOKIE_NAME)?.value ?? null;
  return verifyCsrf(cookie, typeof submitted === 'string' ? submitted : null);
}

function baseUrl(): string {
  return process.env.APP_BASE_URL ?? 'http://localhost:3000';
}

export async function updateRequestStatusAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!(await csrfOk(form))) redirect('/admin/vehicles/requests');

  const id = String(form.get('id') ?? '');
  const status = String(form.get('status') ?? '');
  const shippedVehicleId = String(form.get('shippedVehicleId') ?? '').trim() || null;
  // The guard + redirect(): never narrows `status` to RequestStatus below.
  if (!id || !vehicleRequests.isRequestStatus(status)) redirect('/admin/vehicles/requests');

  const updated = await vehicleRequests.adminUpdateStatus(admin.id, id, status, shippedVehicleId);

  if (status === 'shipped' && updated.requesterEmail) {
    const link = updated.shippedVehicleId
      ? `${baseUrl()}/vehicles/${updated.shippedVehicleId}`
      : `${baseUrl()}/vehicles/select`;
    const name = `${updated.year} ${updated.make} ${updated.model}`;
    try {
      await sendEmail({
        to: updated.requesterEmail,
        subject: `Your requested wrap template shipped: ${name}`,
        html: `<p>Good news — the template you requested (<strong>${name}</strong>) is ready.</p><p><a href="${link}">Open it in Alpha Wolf Wrap Studio</a></p>`,
        text: `The template you requested (${name}) is ready: ${link}`,
      });
    } catch (err) {
      console.error('[admin-requests] shipped email failed', err);
    }
  }

  revalidatePath('/admin/vehicles/requests');
  redirect('/admin/vehicles/requests');
}
