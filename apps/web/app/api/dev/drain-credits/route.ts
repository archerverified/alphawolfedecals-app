// Dev-only credit drain. Mirrors the make-admin/dev-otp endpoints: hard-gated
// on NODE_ENV !== 'production' (404 in prod). Lets the generation E2E reach
// the credit-exhaustion path (waitlist sheet) without burning runs.

import { credits, users } from '@alphawolf/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }
  const email = new URL(request.url).searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 });
  }
  const user = await users.findUserByEmailForAuth(email);
  if (!user) {
    return NextResponse.json({ error: 'no user found for email' }, { status: 404 });
  }
  const drained = await credits.drainCredits(user.id);
  return NextResponse.json({ ok: true, drained });
}
