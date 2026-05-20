// Selected-template detail (GH-003 "use this template" target). Shows the
// 4-view outline, dimensions, and the body-panel breakdown. The editor that
// consumes these panels is Step 5 (GH-008) — the CTA is a placeholder here.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { vehicles } from '@alphawolf/db';
import { OutlinePreview } from '../../../components/vehicles/OutlinePreview';
import { bodyTypeLabel, formatDimensions, vehicleTitle } from '../../../lib/vehicles/format';

export const dynamic = 'force-dynamic';

export default async function VehicleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await vehicles.getPublishedDetail(id);
  if (!vehicle) notFound();

  const title = vehicleTitle(vehicle);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12" data-testid="vehicle-detail">
      <div className="mx-auto max-w-4xl">
        <Link href="/vehicles/select" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Back to browse
        </Link>

        <header className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
            <p className="mt-1 text-sm text-zinc-600">{formatDimensions(vehicle)}</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">
            {bodyTypeLabel(vehicle.bodyType)}
          </span>
        </header>

        <OutlinePreview
          src={vehicle.outlineSvgUrl}
          title={title}
          className="mt-6 aspect-[4/1] bg-white"
        />

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Body panels ({vehicle.panels.length})
          </h2>
          {vehicle.panels.length > 0 ? (
            <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
              {vehicle.panels.map((p) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="font-medium text-zinc-800">
                    {p.installOrder}. {p.name}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {p.view} · {p.finishHint}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-zinc-500">Panel breakdown pending.</p>
          )}
        </section>

        <div className="mt-8 flex items-center gap-3">
          <button
            type="button"
            disabled
            title="The wrap editor lands in GH-008"
            className="inline-flex cursor-not-allowed items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white opacity-60"
          >
            Start designing (editor — GH-008)
          </button>
          <Link
            href="/vehicles/select"
            className="text-sm font-medium text-zinc-700 underline-offset-2 hover:underline"
          >
            Choose a different vehicle
          </Link>
        </div>
      </div>
    </main>
  );
}
