// Dev-only credit drain. Mirrors the make-admin/dev-otp endpoints: hard-gated
// on NODE_ENV !== 'production' (404 in prod). Lets the generation E2E reach
// the credit-exhaustion path (waitlist sheet) without burning runs.
//
// Local dev points at the LIVE shared DB, so the target is additionally
// restricted to synthetic E2E identities — this endpoint can never touch a
// real customer's ledger (same rail as scripts/cleanup-e2e-user.ts), and
// credits.drainCredits itself refuses to run under NODE_ENV=production.

import { credits, users } from '@alphawolf/db';
import { NextResponse } from 'next/server';

const ALLOWED_SUFFIX = '@e2e.alphawolf.test';

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }
  const email = new URL(request.url).searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 });
  }
  if (!email.endsWith(ALLOWED_SUFFIX)) {
    return NextResponse.json(
      { error: `only ${ALLOWED_SUFFIX} test identities can be drained` },
      { status: 403 },
    );
  }
  const user = await users.findUserByEmailForAuth(email);
  if (!user) {
    return NextResponse.json({ error: 'no user found for email' }, { status: 404 });
  }
  const drained = await credits.drainCredits(user.id);
  return NextResponse.json({ ok: true, drained });
}
