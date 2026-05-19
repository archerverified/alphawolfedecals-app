// Dev-only OTP peek endpoint.
//
// Resend's onboarding@resend.dev sender only delivers to the Resend account
// owner's mailbox, so E2E tests cannot read OTPs from email. This endpoint
// returns the most recent OTP issued to a given email from the in-process
// ring buffer in @alphawolf/auth.
//
// Hard-gated on NODE_ENV !== 'production'. Returns 404 in prod regardless of
// query string.

import { _getDevOtp } from '@alphawolf/auth';
import { NextResponse } from 'next/server';

export async function GET(request: Request): Promise<Response> {
  if (process.env.NODE_ENV === 'production') {
    return new NextResponse(null, { status: 404 });
  }
  const url = new URL(request.url);
  const email = url.searchParams.get('email');
  if (!email) {
    return NextResponse.json({ error: 'email query param required' }, { status: 400 });
  }
  const code = _getDevOtp(email);
  if (!code) {
    return NextResponse.json({ error: 'no OTP found for email' }, { status: 404 });
  }
  return NextResponse.json({ code });
}
