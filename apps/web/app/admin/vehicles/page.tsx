// Admin template library list (GH-004). All statuses visible to admins (RLS).

import Link from 'next/link';
import { vehicles } from '@alphawolf/db';
import { requireAdmin } from '../../../lib/admin/guard';
import { bodyTypeLabel, vehicleTitle } from '../../../lib/vehicles/format';
import { StatusBadge } from '../../../components/admin/StatusBadge';

export const metadata = { title: 'Vehicle templates — Admin' };

export default async function AdminVehiclesPage() {
  const admin = await requireAdmin();
  const list = await vehicles.adminListVehicles(admin.id);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-zinc-900">Vehicle templates</h1>
        <Link
          href="/admin/vehicles/new"
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          New template
        </Link>
      </div>

      {list.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white p-10 text-center text-sm text-zinc-500">
          No templates yet. Upload your first Tier-1 vehicle.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-4 py-2.5 font-medium">Vehicle</th>
                <th className="px-4 py-2.5 font-medium">Body</th>
                <th className="px-4 py-2.5 font-medium">Ver</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {list.map((v) => (
                <tr key={v.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/admin/vehicles/${v.id}`}
                      className="font-medium text-zinc-900 hover:underline"
                    >
                      {vehicleTitle(v)}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-zinc-600">{bodyTypeLabel(v.bodyType)}</td>
                  <td className="px-4 py-2.5 text-zinc-600">v{v.version}</td>
                  <td className="px-4 py-2.5">
                    <StatusBadge status={v.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
