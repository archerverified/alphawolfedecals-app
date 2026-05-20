// Dev-only admin promotion hook. Mirrors the dev-otp peek endpoint: hard-gated
// on NODE_ENV !== 'production' (404 in prod). Lets E2E (and Archer locally)
// promote a verified account to internal admin without a DB shell. The human
// path is `pnpm --filter @alphawolf/db db:make-admin <email>`.

import { users } from '@alphawolf/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }
  const email = new URL(request.url).searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 });
  }
  const user = await users.setUserAdminByEmail(email, true);
  if (!user) {
    return NextResponse.json({ error: 'no user found for email' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, isAdmin: user.isAdmin });
}
