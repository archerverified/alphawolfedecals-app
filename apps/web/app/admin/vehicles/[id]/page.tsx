// Admin template detail + lifecycle actions (GH-004): publish (which retires any
// prior published sibling), create a new version (clones to a fresh draft), and
// move between draft/review/retired.

import { notFound } from 'next/navigation';
import { CSRF_FIELD_NAME } from '@alphawolf/auth';
import { vehicles } from '@alphawolf/db';
import { requireAdmin } from '../../../../lib/admin/guard';
import { getOrCreateFormCsrfToken } from '../../../../lib/csrf';
import { bodyTypeLabel, formatDimensions, vehicleTitle } from '../../../../lib/vehicles/format';
import { OutlinePreview } from '../../../../components/vehicles/OutlinePreview';
import { StatusBadge } from '../../../../components/admin/StatusBadge';
import {
  newVersionAction,
  publishVehicleAction,
  setVehicleStatusAction,
} from '../../../../lib/actions/admin-vehicle';

export default async function AdminVehicleDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const v = await vehicles.adminGetDetail(admin.id, id);
  if (!v) notFound();

  const csrfToken = await getOrCreateFormCsrfToken();
  const title = vehicleTitle(v);

  return (
    <div className="max-w-4xl" data-testid="admin-vehicle-detail">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-zinc-900">{title}</h1>
          <p className="mt-1 text-sm text-zinc-600">{formatDimensions(v)}</p>
          <p className="mt-1 text-xs text-zinc-500">
            {bodyTypeLabel(v.bodyType)} · v{v.version} · {v.sourceAuthority}
          </p>
        </div>
        <StatusBadge status={v.status} />
      </div>

      <OutlinePreview src={v.outlineSvgUrl} title={title} className="mt-6 aspect-[4/1] bg-white" />

      {/* Lifecycle actions */}
      <div className="mt-6 flex flex-wrap items-center gap-2">
        {v.status !== 'published' ? (
          <form action={publishVehicleAction}>
            <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
            <input type="hidden" name="id" value={v.id} />
            <button
              type="submit"
              className="rounded-md bg-emerald-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-800"
            >
              Publish
            </button>
          </form>
        ) : null}

        <form action={setVehicleStatusAction} className="flex items-center gap-2">
          <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
          <input type="hidden" name="id" value={v.id} />
          {v.status !== 'review' ? (
            <button
              type="submit"
              name="status"
              value="review"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              Mark in review
            </button>
          ) : null}
          {v.status !== 'draft' ? (
            <button
              type="submit"
              name="status"
              value="draft"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              Back to draft
            </button>
          ) : null}
          {v.status !== 'retired' ? (
            <button
              type="submit"
              name="status"
              value="retired"
              className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              Retire
            </button>
          ) : null}
        </form>

        <form action={newVersionAction}>
          <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
          <input type="hidden" name="id" value={v.id} />
          <button
            type="submit"
            className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
          >
            New version
          </button>
        </form>
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Body panels ({v.panels.length})
        </h2>
        <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
          {v.panels.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="font-medium text-zinc-800">
                {p.installOrder}. {p.name}
              </span>
              <span className="text-xs text-zinc-500">
                {p.view} · {p.finishHint}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
