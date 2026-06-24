// Print Pack download (Goal 22 / D3). GET -> application/pdf.
// Auth: requireUser + RLS-scoped loads (a non-owner gets 404, never another
// tenant's project). The print pack is a shop deliverable, so the caller must be
// a member of a shop that has a print profile; otherwise a 409 points them to set
// one up. The PDF is generated on the fly and streamed - no storage object is
// written (net-zero, mirrors the spec-pack route). Assembly is shared with the
// project print page via loadPrintPlanForProject.

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireUser } from '@/lib/admin/guard';
import { captureServerEvent } from '@/lib/notifications/posthog-server';
import { loadPrintPlanForProject } from '@/lib/print/load-print-plan';
import { buildPrintPackPdf } from '@/lib/print/print-pack-pdf';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: projectId } = await params;
  const user = await requireUser(`/projects/${projectId}`);

  try {
    const load = await loadPrintPlanForProject(user, projectId);
    if (!load.ok) return new NextResponse(load.message, { status: load.status });

    const pdf = await buildPrintPackPdf(load.plan, {
      projectName: load.projectName,
      vehicleLabel: load.vehicleLabel,
      generatedAtIso: new Date().toISOString(),
      artByView: load.artByView,
    });

    await captureServerEvent('print_pack_created', user.id, {
      projectId,
      shopId: load.shopId,
      panels: load.plan.panels.length,
      estimated: load.plan.estimated,
      needsMeasurement: load.plan.needsMeasurement,
      linearFeet: Math.round(load.plan.totalLinearFeet),
    });

    const filename = `print-pack-${
      load.projectName.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60) || 'pack'
    }.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return new NextResponse('Print pack failed', { status: 500 });
  }
}
