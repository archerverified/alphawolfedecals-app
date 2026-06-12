// Admin "Request this vehicle" queue (GH-004 AC + GH-017). Pending / In progress
// / Shipped / Rejected transitions. Marking shipped (with an optional template
// id to deep-link) emails the requester if they opted in.

import { CSRF_FIELD_NAME } from '@alphawolf/auth';
import { vehicleRequests } from '@alphawolf/db';
import { requireAdmin } from '../../../../lib/admin/guard';
import { getOrCreateFormCsrfToken } from '../../../../lib/csrf';
import { StatusBadge } from '../../../../components/admin/StatusBadge';
import { updateRequestStatusAction } from '../../../../lib/actions/admin-requests';

export const metadata = { title: 'Template requests — Admin' };

export default async function RequestQueuePage() {
  const admin = await requireAdmin();
  const [requests, csrfToken] = await Promise.all([
    vehicleRequests.adminListRequests(admin.id),
    getOrCreateFormCsrfToken(),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-xl font-semibold text-zinc-900">Template requests</h1>
      <p className="mb-6 text-sm text-zinc-600">
        Customer requests for vehicles not yet in the library. Mark “Shipped” to notify the
        requester (if they opted in).
      </p>

      {requests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          No requests in the queue.
        </div>
      ) : (
        <ul className="flex flex-col gap-3" data-testid="request-queue">
          {requests.map((r) => (
            <li
              key={r.id}
              data-testid="request-row"
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-zinc-900">
                    {r.year} {r.make} {r.model}
                    {r.trim ? ` ${r.trim}` : ''}
                    {r.variant ? ` · ${r.variant}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {r.requesterEmail ? `Notify: ${r.requesterEmail}` : 'Notifications opted out'}
                    {' · '}
                    {new Date(r.createdAt).toLocaleDateString()}
                  </p>
                  {r.notes ? <p className="mt-2 text-sm text-zinc-700">{r.notes}</p> : null}
                </div>
                <StatusBadge status={r.status} />
              </div>

              {/* One form per transition with the status in a HIDDEN input:
                  submit-button name/value is dropped by server-action forms
                  (the silent no-op the Goal 6 e2e caught on the vehicle detail
                  page — same fix here). The Shipped form carries the template
                  id field; the other transitions don't use it. */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
                <form action={updateRequestStatusAction} className="flex flex-1 items-center gap-2">
                  <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value="shipped" />
                  <input
                    name="shippedVehicleId"
                    placeholder="shipped template id (for Shipped)"
                    defaultValue={r.shippedVehicleId ?? ''}
                    className="min-w-[18rem] flex-1 rounded-md border border-zinc-300 px-2 py-1.5 text-xs shadow-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
                  />
                  <button
                    type="submit"
                    className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-800"
                  >
                    Shipped
                  </button>
                </form>
                <form action={updateRequestStatusAction}>
                  <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value="in_progress" />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50"
                  >
                    In progress
                  </button>
                </form>
                <form action={updateRequestStatusAction}>
                  <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value="rejected" />
                  <button
                    type="submit"
                    className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-800 transition hover:bg-zinc-50"
                  >
                    Reject
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
