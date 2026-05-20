// CSRF cookie bootstrap.
//
// Next.js 15 Server Components can READ cookies but cannot WRITE them.
// Cookie writes are only allowed in Server Actions, Route Handlers, and
// middleware. This middleware runs before any of the bespoke auth pages
// render and ensures the form-CSRF cookie exists, so the page's Server
// Component can simply read it.
//
// Middleware runs in the Edge runtime, which does NOT support `node:crypto`
// or other node: scheme imports. We use the Web Crypto API (available
// globally in both Edge and Node runtimes) to generate the random token.
// This means we do not import from @alphawolf/auth/server here — that path
// pulls in node:crypto, argon2, Prisma, and Resend, none of which run on
// Edge.
//
// Pattern: double-submit cookie. The cookie set here is paired with a
// hidden form field on the signup/verify/resend forms; the server actions
// in apps/web/lib/actions/signup.ts compare the two in constant time
// (using node:crypto's timingSafeEqual, which is fine — those actions
// run on the Node runtime, not Edge).

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { CSRF_COOKIE_NAME } from '@alphawolf/auth';

const TOKEN_BYTES = 32;

// Edge-compatible: uses Web Crypto API (crypto.getRandomValues is a global
// in both Edge and Node runtimes). Returns a 32-byte base64url-encoded
// string matching the format produced by @alphawolf/auth/server's
// generateCsrfToken (which uses node:crypto for the same purpose in
// non-middleware contexts).
function generateEdgeCsrfToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  // for...of yields `number` directly (not `number | undefined` like bytes[i]
  // under noUncheckedIndexedAccess). Avoids needing a non-null assertion.
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // base64url: standard base64, then URL-safe character swaps + strip padding
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function middleware(request: NextRequest) {
  const response = NextResponse.next();

  if (!request.cookies.get(CSRF_COOKIE_NAME)) {
    const token = generateEdgeCsrfToken();
    response.cookies.set(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return response;
}

// Run on every route that renders a form wired to a server action that
// validates CSRF. Keep this list tight — middleware runs on every match,
// so unnecessary matchers add latency to every request.
export const config = {
  matcher: ['/signup', '/signup-shop', '/verify', '/vehicles/request', '/admin/:path*'],
};
