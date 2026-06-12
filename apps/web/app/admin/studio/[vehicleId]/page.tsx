// Template Studio authoring workspace (Goal 6 D1). Server shell: loads the
// vehicle + its ingest sources, signs source-read URLs (requireAdmin already
// passed — the app-layer access rule from ADR-0014 invariant 6), and hands
// everything to the client workspace.

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { storage, templateSources, vehicleRequests, vehicles } from '@alphawolf/db';
import { requireAdmin } from '../../../../lib/admin/guard';
import { getOrCreateFormCsrfToken } from '../../../../lib/csrf';
import { vehicleTitle } from '../../../../lib/vehicles/format';
import { StatusBadge } from '../../../../components/admin/StatusBadge';
import { StudioWorkspace } from '../../../../components/studio/StudioWorkspace';
import { SourceUploadForm } from '../../../../components/studio/SourceUploadForm';

export const metadata = { title: 'Studio workspace — Admin' };

export default async function StudioVehiclePage({
  params,
}: {
  params: Promise<{ vehicleId: string }>;
}) {
  const admin = await requireAdmin();
  const { vehicleId } = await params;

  const vehicle = await vehicles.adminGetDetail(admin.id, vehicleId);
  if (!vehicle) notFound();

  const [sources, requests, csrfToken] = await Promise.all([
    templateSources.listForVehicle(admin.id, vehicleId),
    vehicleRequests.adminListRequests(admin.id),
    getOrCreateFormCsrfToken(),
  ]);

  // Signed reads for private source files (24h TTL; admin-only page).
  const signedSources = await Promise.all(
    sources.map(async (s) => ({
      id: s.id,
      kind: s.kind,
      storageKey: s.storageKey,
      notes: s.notes,
      measurements: s.measurements,
      url: storage.isStorageConfigured()
        ? await storage.signedTemplateSourceReadUrl(s.storageKey).catch(() => null)
        : null,
    })),
  );

  // Backdrop: the wrapped display sheet when this is an AW catalogue row
  // (panel coordinates are sheet-absolute for Studio-authored templates).
  const backdropUrl = vehicle.svgStorageKey
    ? storage.templatePublicUrl(vehicle.svgStorageKey)
    : null;

  const openRequests = requests
    .filter((r) => r.status === 'pending' || r.status === 'in_progress')
    .map((r) => ({
      id: r.id,
      label: `${r.year} ${r.make} ${r.model}${r.trim ? ` ${r.trim}` : ''}`,
    }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold text-zinc-900">{vehicleTitle(vehicle)}</h1>
            <StatusBadge status={vehicle.status} />
            {vehicle.alphaWolfTplId ? (
              <span className="font-mono text-xs text-zinc-500">{vehicle.alphaWolfTplId}</span>
            ) : null}
          </div>
          <p className="mt-1 text-sm text-zinc-500">
            {vehicle.lengthMm.toLocaleString()} × {vehicle.widthMm.toLocaleString()} ×{' '}
            {vehicle.heightMm.toLocaleString()} mm · {vehicle.panels.length} panels authored
          </p>
        </div>
        <Link
          href="/admin/studio"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900 hover:underline"
        >
          ← Worklist
        </Link>
      </div>

      <StudioWorkspace
        vehicle={{
          id: vehicle.id,
          title: vehicleTitle(vehicle),
          lengthMm: vehicle.lengthMm,
          widthMm: vehicle.widthMm,
          heightMm: vehicle.heightMm,
          status: vehicle.status,
          panels: vehicle.panels.map((p) => ({
            name: p.name,
            view: p.view,
            svgPath: p.svgPath,
            finishHint: p.finishHint,
            installOrder: p.installOrder,
            notes: p.notes ?? null,
          })),
        }}
        backdropUrl={backdropUrl}
        csrfToken={csrfToken}
        openRequests={openRequests}
      />

      <section className="rounded-xl border border-zinc-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Source material ({signedSources.length})
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          Owned sources only: shop photos, OEM body-builder PDFs, or Alpha Wolf art. This list is
          the template’s legal provenance trail — never upload provider files (PVO etc.).
        </p>
        {signedSources.length > 0 ? (
          <ul className="mb-4 divide-y divide-zinc-100 text-sm">
            {signedSources.map((s) => (
              <li key={s.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="mr-2 inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                    {s.kind.replace('_', ' ')}
                  </span>
                  <span className="text-zinc-700">{s.storageKey.split('/').pop()}</span>
                  {s.notes ? <span className="ml-2 text-xs text-zinc-400">{s.notes}</span> : null}
                </div>
                {s.url ? (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-zinc-600 hover:underline"
                  >
                    View
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        <SourceUploadForm vehicleId={vehicle.id} />
      </section>
    </div>
  );
}
