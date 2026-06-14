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

import { generation, maintenance } from '@alphawolf/db';

import { captureServerEvent } from '../../../../lib/notifications/posthog-server';

export const dynamic = 'force-dynamic';
// Hobby-plan ceiling (deploys reject above 60 — invalid_max_duration, learned
// 2026-06-12). The sweep is per-run transactional, so a timeout mid-backlog
// keeps its progress and the next tick finishes the rest.
export const maxDuration = 60;

// SERVER constant — never request-derived (a caller-supplied tiny TTL would
// fail + refund every healthy in-flight run; see generation.sweepStaleRuns).
const SWEEP_TTL_MINUTES = 15;

// Review note F6: CRON_SECRET IS set in prod, so the bearer path is live for
// ops. The x-vercel-cron header path is platform-trust only — if generation_
// swept events ever arrive with auth:'header' while CRON_SECRET is expected
// to gate everything, that should ALERT (PostHog: filter generation_swept by
// the `auth` property). Returning which path authorized the call makes that
// distinction observable per event.
function authorizedVia(request: Request): 'header' | 'bearer' | null {
  if (request.headers.get('x-vercel-cron')) return 'header';
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return null; // fail closed
  return request.headers.get('authorization') === `Bearer ${secret}` ? 'bearer' : null;
}

export async function GET(request: Request): Promise<NextResponse> {
  const auth = authorizedVia(request);
  if (!auth) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const swept = await generation.sweepStaleRuns(SWEEP_TTL_MINUTES);
  await captureServerEvent('generation_swept', 'system', { count: swept, auth });

  // Test-data sweep (Goal 9.1 D1) — folded into this existing daily cron rather
  // than a 2nd cron entry (Hobby plan caps cron count + frequency; a sub-daily
  // cron previously broke all deploys). sweepTestData does ONE decrypt pass then:
  //   * hard-purges the per-deploy prod-smoke leak (projects owned by the
  //     synthetic / @alphawolf.test smoke cohort, ownerShopId NULL, settled
  //     >30min) — the server-side guarantee behind the smoke's own soft-delete
  //     self-clean. ownerShopId NULL spares the seeded routed-order fixture.
  //   * retires straggler synthetic ACCOUNTS (RETIRE_SUFFIXES only — never
  //     @alphawolf.test) that local runs leave behind.
  // withSystem maintenance, cohort-scoped: a real account/its data never matches.
  // Isolated from the generation sweep above: a maintenance failure must NOT take
  // down the (already-completed) refund sweep or fail the cron's health.
  let maintenanceResult: Awaited<ReturnType<typeof maintenance.sweepTestData>> | null = null;
  try {
    maintenanceResult = await maintenance.sweepTestData();
    await captureServerEvent('test_data_swept', 'system', { auth, ...maintenanceResult });
  } catch (err) {
    await captureServerEvent('test_data_sweep_failed', 'system', {
      auth,
      error: err instanceof Error ? err.message : 'unknown',
    });
  }

  return NextResponse.json({ ok: true, swept, maintenance: maintenanceResult });
}
