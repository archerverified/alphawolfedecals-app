// Public concept-vote endpoint (Goal 9). POST a { conceptKey } against a share
// token. Unauthenticated by design — the share token is the capability. Guards:
//   1. Per-IP rate limit — THE abuse ceiling (ballot-stuffing defense) via the
//      shared rate_limits table.
//   2. An opaque per-visitor cookie (aw_voter) → DEDUPES HONEST VISITORS: one
//      vote per browser per project (UPSERT moves the vote, never stacks it).
//      NOT a stuffing defense — a client that drops cookies gets a fresh token,
//      which is exactly why guard #1 exists. NOT PII.
//   3. recordConceptVote validates concept_key against the project's real
//      directions, so a forged key can't pollute the tally.

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { rateLimit, share } from '@alphawolf/db';

import { captureServerEvent } from '../../../../../lib/notifications/posthog-server';
import { VOTER_COOKIE } from '../../../../../lib/share/cookie';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// aw_voter is httpOnly (set below) so client JS can't read or forge it; scoped
// to /share so the share page (also under /share) can read it for view
// attribution but it never rides along to the authenticated app.
const VOTER_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

// Generous ceiling: a real crew of voters shares one IP (shop wifi); this only
// trips obvious ballot-stuffing.
const VOTE_WINDOW_MS = 60_000;
const VOTE_THRESHOLD = 40;
const VOTE_LOCKOUT_MS = 60_000;

// Prefer x-real-ip (Vercel sets it to the true client IP — not client-spoofable)
// over the leftmost x-forwarded-for hop, which a client can forge.
function clientIp(request: Request): string {
  const realIp = request.headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '0.0.0.0';
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  let conceptKey: unknown;
  try {
    const body = (await request.json()) as { conceptKey?: unknown };
    conceptKey = body.conceptKey;
  } catch {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }
  if (typeof conceptKey !== 'string' || conceptKey.length === 0 || conceptKey.length > 128) {
    return NextResponse.json({ ok: false, error: 'bad_request' }, { status: 400 });
  }

  const ip = clientIp(request);
  const decision = await rateLimit.recordFailure({
    key: `share_vote:${ip}`,
    windowMs: VOTE_WINDOW_MS,
    threshold: VOTE_THRESHOLD,
    lockoutMs: VOTE_LOCKOUT_MS,
  });
  if (!decision.allowed) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 });
  }

  // Read or mint the visitor id. A freshly-minted one is written back on the
  // response so the next vote dedupes against it.
  const jar = await cookies();
  const existing = jar.get(VOTER_COOKIE)?.value;
  const voterToken = existing || randomUUID();

  const result = await share.recordConceptVote({ token, conceptKey, voterToken });
  if (!result.ok) {
    const status = result.reason === 'invalid_concept' ? 400 : 404;
    return NextResponse.json({ ok: false, error: result.reason }, { status });
  }

  await captureServerEvent('concept_voted', voterToken, { concept_key: conceptKey });

  const res = NextResponse.json({
    ok: true,
    concepts: result.concepts,
    totalVotes: result.totalVotes,
    voted: conceptKey,
  });
  if (!existing) {
    res.cookies.set(VOTER_COOKIE, voterToken, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/share',
      maxAge: VOTER_COOKIE_MAX_AGE,
    });
  }
  return res;
}
