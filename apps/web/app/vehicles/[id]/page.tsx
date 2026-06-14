// Selected-template detail (GH-003 "use this template" target). Shows the
// 4-view outline, dimensions, and the body-panel breakdown. The editor that
// consumes these panels is Step 5 (GH-008) — the CTA is a placeholder here.

import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { vehicles, storage, PLAN_LIMITS } from '@alphawolf/db';
import { OutlinePreview } from '../../../components/vehicles/OutlinePreview';
import { DetailViewTracker } from '../../../components/vehicles/DetailViewTracker';
import { StartProjectButton } from '../../../components/projects/StartProjectButton';
import { getOrCreateFormCsrfToken } from '../../../lib/csrf';
import { bodyTypeLabel, formatDimensions, vehicleTitle } from '../../../lib/vehicles/format';
import { numberedPanels } from '../../../lib/vehicles/panel-numbers';

export const dynamic = 'force-dynamic';

// Per-page canonical + title for the indexable detail pages (Goal 10 D6 — these
// are the bulk of the sitemap'd surface). Inherits the root metadataBase/OG.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const vehicle = await vehicles.getPublishedDetail(id);
  if (!vehicle) return {};
  const title = `${vehicleTitle(vehicle)} wrap template`;
  return {
    title,
    description: `Design a custom wrap on the ${vehicleTitle(vehicle)} — an accurate, wrap-safe Alpha Wolf template.`,
    alternates: { canonical: `/vehicles/${id}` },
    openGraph: { title, url: `/vehicles/${id}` },
  };
}

export default async function VehicleDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ gate?: string | string[] }>;
}) {
  const { id } = await params;
  const { gate: gateParam } = await searchParams;
  const gate = Array.isArray(gateParam) ? gateParam[0] : gateParam;
  const vehicle = await vehicles.getPublishedDetail(id);
  if (!vehicle) notFound();

  const title = vehicleTitle(vehicle);
  const csrfToken = await getOrCreateFormCsrfToken();

  // Alpha Wolf rows carry a wrapped SVG in the public vehicle-templates bucket —
  // render that (the AW frame is already baked in; do NOT wrap again). Non-AW
  // rows fall back to their outline SVG. CSP img-src already allow-lists the
  // Supabase Storage origin.
  const isAwTemplate = vehicle.svgStorageKey != null;
  const renderUrl = vehicle.svgStorageKey
    ? storage.templatePublicUrl(vehicle.svgStorageKey)
    : vehicle.outlineSvgUrl;
  const awMeta = [
    vehicle.viewCount != null ? `${vehicle.viewCount}-view` : null,
    `Scale 1:${vehicle.scaleDenom}`,
    vehicle.dimensionsText,
  ].filter(Boolean) as string[];

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12" data-testid="vehicle-detail">
      <DetailViewTracker vehicleId={vehicle.id} alphaWolfTplId={vehicle.alphaWolfTplId} />
      <div className="mx-auto max-w-4xl">
        <Link href="/vehicles" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Back to templates
        </Link>

        {gate === 'slots' ? (
          <p
            className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800"
            data-testid="slot-gate-banner"
          >
            Your free plan covers {PLAN_LIMITS.free.vehicleSlots} vehicles, and all slots are in
            use. More slots are coming soon — for now, keep designing on{' '}
            <Link href="/projects" className="underline">
              your current vehicles
            </Link>
            .
          </p>
        ) : null}

        <header className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{title}</h1>
            <p className="mt-1 text-sm text-zinc-600">{formatDimensions(vehicle)}</p>
            {isAwTemplate && awMeta.length > 0 ? (
              <p className="mt-1 text-sm font-medium text-zinc-700" data-testid="aw-meta">
                {awMeta.join(' · ')}
              </p>
            ) : null}
          </div>
          <span className="rounded-full bg-zinc-100 px-3 py-1 text-xs text-zinc-600">
            {bodyTypeLabel(vehicle.bodyType)}
          </span>
        </header>

        {isAwTemplate ? (
          <div
            data-testid="wrapped-svg"
            className="mt-6 flex items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-white p-4"
          >
            <img
              src={renderUrl}
              alt={`${title} — Alpha Wolf wrap template`}
              className="max-h-[70vh] w-full object-contain"
            />
          </div>
        ) : (
          <OutlinePreview src={renderUrl} title={title} className="mt-6 aspect-[4/1] bg-white" />
        )}

        <section className="mt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Body panels ({vehicle.panels.length})
          </h2>
          {vehicle.panels.length > 0 ? (
            <ul className="mt-3 divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
              {/* Numbers match the template sheet's panel numerals (numberViews),
                  NOT installOrder — one number = one panel, everywhere. */}
              {numberedPanels(vehicle.panels).map(({ n, panel: p }) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                >
                  <span className="font-medium text-zinc-800">
                    {n}. {p.name}
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
          <StartProjectButton vehicleId={vehicle.id} defaultName={title} csrfToken={csrfToken} />
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
