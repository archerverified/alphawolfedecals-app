// Project print plan (Goal 22). Server Component: gate to the logged-in owner,
// assemble the never-short paneling plan through loadPrintPlanForProject (the
// shared pipeline shared with the PDF route), and render it for a shop. The plan
// is curvature-corrected, safety-margined, and bleed-extended, so every size on
// the page is sized to never come up short. Estimated panels are flagged so the
// shop knows to measure before printing.

import Link from 'next/link';
import { requireUser } from '@/lib/admin/guard';
import { loadPrintPlanForProject } from '@/lib/print/load-print-plan';
import type { PrintPlan } from '@/lib/print/print-pack';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Print plan',
};

const BRAND = '#00AEEF';

const CONFIDENCE: Record<PrintPlan['panels'][number]['source'], { label: string; amber: boolean }> =
  {
    measured_in_shop: { label: 'Measured', amber: false },
    calibrated_sibling: { label: 'Calibrated', amber: false },
    class_prior: { label: 'Estimated', amber: false },
    unknown: { label: 'UNMEASURED', amber: true },
  };

function fmt(n: number): string {
  // Round to one decimal, drop a trailing .0 so 12.0 reads as 12.
  return Number(n.toFixed(1)).toString();
}

export default async function ProjectPrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/projects/${id}/print`);
  const load = await loadPrintPlanForProject(user, id);

  if (!load.ok) {
    return (
      <main className="min-h-screen bg-zinc-50 px-4 py-12">
        <div className="mx-auto max-w-md rounded-lg border border-zinc-200 bg-white p-8 text-center">
          <h1 className="text-lg font-semibold text-zinc-900">Print plan unavailable</h1>
          <p className="mt-2 text-sm text-zinc-600">{load.message}</p>
          {load.status === 409 && (
            <Link
              href="/dashboard/print-profile"
              className="mt-5 inline-flex h-9 items-center justify-center rounded-md bg-zinc-900 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
            >
              Set up print profile
            </Link>
          )}
        </div>
      </main>
    );
  }

  const { plan, projectName, vehicleLabel } = load;
  const showBanner = plan.estimated || plan.needsMeasurement;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: BRAND }}>
              Print plan
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
              {projectName}
            </h1>
            <p className="mt-1 text-sm text-zinc-600">{vehicleLabel}</p>
            <p className="mt-2 text-sm text-zinc-600">
              {plan.printer.label ?? 'Manual printer'} · effective width{' '}
              {fmt(plan.printer.effectiveWidthIn)} in · overlap {fmt(plan.printer.overlapIn)} in ·
              bleed {fmt(plan.printer.bleedIn)} in
            </p>
          </div>
          <a
            href={`/projects/${id}/print-pack`}
            download
            className="inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium text-white shadow-sm transition-colors hover:opacity-90"
            style={{ backgroundColor: BRAND }}
            data-testid="download-print-pack"
          >
            Download Print Pack PDF
          </a>
        </header>

        {showBanner && (
          <div
            className="mb-6 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="status"
            data-testid="estimate-banner"
          >
            <p className="font-semibold">Some dimensions are estimates.</p>
            <p className="mt-1">
              Never short: every size is curvature-corrected, safety-margined, and includes bleed.
            </p>
            {plan.needsMeasurement && (
              <p className="mt-1 font-medium">
                Measure the flagged panels on the real vehicle before printing.
              </p>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-lg border border-zinc-200 bg-white">
          <table className="w-full text-sm" data-testid="print-panels-table">
            <thead>
              <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500">
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Panel
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  View
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  True (in) W×H
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Safe cut (in) W×H
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Tiles
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Linear ft
                </th>
                <th scope="col" className="px-4 py-2.5 font-medium">
                  Confidence
                </th>
              </tr>
            </thead>
            <tbody>
              {plan.panels.map((panel) => {
                const confidence = CONFIDENCE[panel.source];
                return (
                  <tr
                    key={panel.id}
                    className="border-b border-zinc-100 last:border-0 hover:bg-zinc-50"
                    data-testid="print-panel-row"
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-zinc-900">{panel.name}</div>
                      {panel.warning && (
                        <div className="mt-0.5 text-xs text-amber-700">{panel.warning}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-zinc-600">{panel.view}</td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums text-zinc-700">
                      {fmt(panel.trueWidthIn)} × {fmt(panel.trueHeightIn)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap tabular-nums font-medium text-zinc-900">
                      {fmt(panel.safeWidthIn)} × {fmt(panel.safeHeightIn)}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-700">
                      {panel.paneled.tiles.length}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-zinc-700">
                      {fmt(panel.paneled.linearFeet)}
                    </td>
                    <td className="px-4 py-3">
                      {confidence.amber ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                          {confidence.label}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-zinc-600">
                          {confidence.label}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <dl className="mt-6 flex flex-wrap gap-x-8 gap-y-2 text-sm" data-testid="print-totals">
          <div className="flex items-baseline gap-1.5">
            <dt className="text-zinc-500">Panels</dt>
            <dd className="font-semibold tabular-nums text-zinc-900">{plan.panels.length}</dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-zinc-500">Total linear feet</dt>
            <dd className="font-semibold tabular-nums text-zinc-900">
              {fmt(plan.totalLinearFeet)}
            </dd>
          </div>
          <div className="flex items-baseline gap-1.5">
            <dt className="text-zinc-500">Approx media</dt>
            <dd className="font-semibold tabular-nums text-zinc-900">
              {fmt(plan.totalMediaAreaSqFt)} sq ft
            </dd>
          </div>
        </dl>

        {plan.skipped.length > 0 && (
          <div
            className="mt-6 rounded-lg border border-zinc-200 bg-white px-4 py-3 text-sm text-zinc-600"
            data-testid="print-skipped"
          >
            <p className="font-medium text-zinc-900">Skipped panels</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {plan.skipped.map((s) => (
                <li key={s.id}>
                  <span className="text-zinc-900">{s.name}</span>: {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
