// A single browse match: 4-view preview thumbnail, dimensions, and the
// "use this template" CTA (GH-003 AC).

import Link from 'next/link';
import type { VehicleSummary } from '@alphawolf/db';
import { bodyTypeLabel, formatDimensions, vehicleTitle } from '../../lib/vehicles/format';
import { OutlinePreview } from './OutlinePreview';

export function VehicleCard({ vehicle }: { vehicle: VehicleSummary }) {
  const title = vehicleTitle(vehicle);
  return (
    <article
      data-testid="vehicle-card"
      data-vehicle-id={vehicle.id}
      className="flex flex-col overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition hover:shadow-md"
    >
      <OutlinePreview src={vehicle.thumbPngUrl} title={title} className="aspect-[4/1]" />
      <div className="flex flex-1 flex-col gap-2 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-zinc-900">{title}</h3>
          <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-xs text-zinc-600">
            {bodyTypeLabel(vehicle.bodyType)}
          </span>
        </div>
        <p className="text-xs text-zinc-500">{formatDimensions(vehicle)}</p>
        <Link
          href={`/vehicles/${vehicle.id}`}
          className="mt-auto inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Use this template
        </Link>
      </div>
    </article>
  );
}
