// Dev-only admin promotion hook. Mirrors the dev-otp peek endpoint: hard-gated
// on NODE_ENV !== 'production' (404 in prod). Lets E2E (and Archer locally)
// promote a verified account to internal admin without a DB shell. The human
// path is `pnpm --filter @alphawolf/db db:make-admin <email>`.
//
// RIDER-5 root-cause fix (Goal 9): local dev/E2E points at the LIVE shared DB,
// so the NODE_ENV gate (which checks the runtime, not the DB) let E2E persist
// is_admin=true onto whatever account it was given. Restrict the target to the
// synthetic E2E suffix — exactly like /api/dev/drain-credits — so this endpoint
// can NEVER elevate a real customer. Defense in depth with setUserAdminByEmail's
// non-test-account guard.

import { users } from '@alphawolf/db';
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
      { error: `only ${ALLOWED_SUFFIX} test identities can be promoted` },
      { status: 403 },
    );
  }
  const user = await users.setUserAdminByEmail(email, true);
  if (!user) {
    return NextResponse.json({ error: 'no user found for email' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, isAdmin: user.isAdmin });
}
