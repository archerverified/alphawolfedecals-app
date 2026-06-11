// Wrap Spec Pack download (Goal 5 / B2C-009). GET → application/pdf.
// Auth: requireUser (redirects anonymous traffic to sign-in) + RLS-scoped
// loads — a non-owner gets 404, never another customer's spec.

import { NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import { requireUser } from '@/lib/admin/guard';
import { captureServerEvent } from '@/lib/notifications/posthog-server';
import { loadSpecPackData } from '@/lib/export/load-spec-pack-data';
import { buildSpecPack } from '@/lib/export/spec-pack';

export const dynamic = 'force-dynamic';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: projectId } = await params;
  const user = await requireUser(`/projects/${projectId}/brief`);

  try {
    const data = await loadSpecPackData(
      user.id,
      { name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, phone: user.phone },
      projectId,
    );
    if (!data) return new NextResponse('Not found', { status: 404 });

    const pdf = await buildSpecPack(data);
    await captureServerEvent('export_created', user.id, {
      projectId,
      briefVersion: data.briefVersion,
      photos: data.photos.length,
    });

    const filename = `wrap-spec-${data.projectName.replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 60) || 'pack'}.pdf`;
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        'content-type': 'application/pdf',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (err) {
    Sentry.captureException(err);
    return new NextResponse('Export failed', { status: 500 });
  }
}
