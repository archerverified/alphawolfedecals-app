// Template Studio worklist (Goal 6 D1 + D4). One screen for the operator:
// open vehicle requests (the demand queue) on top, the template library with
// panel-authoring status below. Requests transition through the EXISTING
// queue actions; authoring happens in /admin/studio/[vehicleId].

import Link from 'next/link';
import { vehicleRequests, vehicles } from '@alphawolf/db';
import { requireAdmin } from '../../../lib/admin/guard';
import { vehicleTitle } from '../../../lib/vehicles/format';
import { StatusBadge } from '../../../components/admin/StatusBadge';

export const metadata = { title: 'Template Studio — Admin' };

const REQUEST_STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
  in_progress: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  shipped: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  rejected: 'bg-zinc-100 text-zinc-500 ring-zinc-500/20',
};

export default async function StudioWorklistPage() {
  const admin = await requireAdmin();
  const [requests, list] = await Promise.all([
    vehicleRequests.adminListRequests(admin.id),
    vehicles.adminListStudioVehicles(admin.id),
  ]);
  const openRequests = requests.filter((r) => r.status === 'pending' || r.status === 'in_progress');
  const closedRequests = requests.filter((r) => r.status === 'shipped' || r.status === 'rejected');

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">Template Studio</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Turn owned source material into published templates with panel data.
          </p>
        </div>
        <Link
          href="/admin/vehicles/new"
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          New vehicle
        </Link>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Requested vehicles{openRequests.length > 0 ? ` (${openRequests.length} open)` : ''}
        </h2>
        {openRequests.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-6 text-center text-sm text-zinc-500">
            No open requests. Customer “Request this vehicle” submissions land here.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Vehicle</th>
                  <th className="px-4 py-2.5 font-medium">Requested</th>
                  <th className="px-4 py-2.5 font-medium">Notify</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                  <th className="px-4 py-2.5 font-medium" />
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {openRequests.map((r) => (
                  <tr key={r.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-2.5 font-medium text-zinc-900">
                      {r.year} {r.make} {r.model}
                      {r.trim ? ` ${r.trim}` : ''}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">
                      {r.createdAt.toISOString().slice(0, 10)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-600">{r.requesterEmail ? 'yes' : 'no'}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${REQUEST_STATUS_STYLE[r.status] ?? REQUEST_STATUS_STYLE.rejected}`}
                      >
                        {r.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link
                        href="/admin/vehicles/requests"
                        className="text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:underline"
                      >
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {closedRequests.length > 0 ? (
          <p className="mt-2 text-xs text-zinc-400">
            {closedRequests.length} resolved request{closedRequests.length === 1 ? '' : 's'} in{' '}
            <Link href="/admin/vehicles/requests" className="underline">
              the full queue
            </Link>
            .
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Template library
        </h2>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Vehicle</th>
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 font-medium">Panels</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.map((v) => (
                <tr key={v.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2.5 font-medium text-zinc-900">{vehicleTitle(v)}</td>
                  <td className="px-4 py-2.5 font-mono text-xs text-zinc-500">
                    {v.alphaWolfTplId ?? '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    {v.panelCount > 0 ? (
                      <span className="text-zinc-700">{v.panelCount}</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                        none — editor blocked
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={v.status} />
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={`/admin/studio/${v.id}`}
                      className="text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:underline"
                    >
                      Open in Studio
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
