'use server';

// Admin request-queue status transitions (GH-004 queue + GH-017 ship email).
// The "shipped" transition routes through the SHARED ship step (Goal 6 D4 —
// lib/studio/ship-request.ts) so the manual queue and the Studio publish flow
// send the identical email and emit the same vehicle_request_fulfilled event.
// The email stays best-effort: a failed send never blocks the status change
// (it is now loud in Sentry rather than silently logged, per PR #134).

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CSRF_COOKIE_NAME, CSRF_FIELD_NAME, verifyCsrf } from '@alphawolf/auth/server';
import { vehicleRequests } from '@alphawolf/db';
import { requireAdmin } from '../admin/guard';
import { shipRequestAndNotify } from '../studio/ship-request';

async function csrfOk(form: FormData): Promise<boolean> {
  const submitted = form.get(CSRF_FIELD_NAME);
  const cookie = (await cookies()).get(CSRF_COOKIE_NAME)?.value ?? null;
  return verifyCsrf(cookie, typeof submitted === 'string' ? submitted : null);
}

export async function updateRequestStatusAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  if (!(await csrfOk(form))) redirect('/admin/vehicles/requests');

  const id = String(form.get('id') ?? '');
  const status = String(form.get('status') ?? '');
  const shippedVehicleId = String(form.get('shippedVehicleId') ?? '').trim() || null;
  // The guard + redirect(): never narrows `status` to RequestStatus below.
  if (!id || !vehicleRequests.isRequestStatus(status)) redirect('/admin/vehicles/requests');

  if (status === 'shipped') {
    await shipRequestAndNotify(admin.id, id, shippedVehicleId);
  } else {
    await vehicleRequests.adminUpdateStatus(admin.id, id, status, shippedVehicleId);
  }

  revalidatePath('/admin/vehicles/requests');
  redirect('/admin/vehicles/requests');
}
