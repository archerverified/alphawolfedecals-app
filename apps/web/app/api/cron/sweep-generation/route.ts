// Generation sweeper cron (Goal 7 pipeline design §1). The advance loop is
// client-poll-driven and NOT durable — a customer who closes the tab leaves a
// non-terminal run behind. This route fails + refunds every run past its
// deadline via generation.sweepStaleRuns (withSystem — the ONE sanctioned
// system write in the generation path; refunds derive the user from the spend
// row, no identity is supplied here).
//
// Auth, FAIL CLOSED:
//  - Vercel cron invocations carry the platform-set `x-vercel-cron` header
//    (stripped from external requests at the edge, so it can't be spoofed).
//  - Manual/ops invocations use the standard `Authorization: Bearer
//    ${CRON_SECRET}` Vercel cron convention. No secret configured → bearer
//    path is OFF, not open.

import { NextResponse } from 'next/server';

import { generation } from '@alphawolf/db';

import { captureServerEvent } from '../../../../lib/notifications/posthog-server';

export const dynamic = 'force-dynamic';
// Hobby-plan ceiling (deploys reject above 60 — invalid_max_duration, learned
// 2026-06-12). The sweep is per-run transactional, so a timeout mid-backlog
// keeps its progress and the next tick finishes the rest.
export const maxDuration = 60;

// SERVER constant — never request-derived (a caller-supplied tiny TTL would
// fail + refund every healthy in-flight run; see generation.sweepStaleRuns).
const SWEEP_TTL_MINUTES = 15;

function isAuthorized(request: Request): boolean {
  if (request.headers.get('x-vercel-cron')) return true;
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false; // fail closed
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

export async function GET(request: Request): Promise<NextResponse> {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const swept = await generation.sweepStaleRuns(SWEEP_TTL_MINUTES);
  await captureServerEvent('generation_swept', 'system', { count: swept });
  return NextResponse.json({ ok: true, swept });
}
