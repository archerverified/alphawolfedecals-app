// CSRF defense for state-changing routes outside the Auth.js sign-in flow
// (signup, verify, resend-OTP). Auth.js already provides CSRF on its own
// /api/auth/* endpoints; this is for the bespoke server actions.
//
// Pattern: double-submit cookie. A random token is set in a httpOnly+SameSite=strict
// cookie at first GET; submissions must echo the same token in a hidden form
// field. Comparison is constant-time.

import { randomBytes, timingSafeEqual } from 'node:crypto';

export const CSRF_COOKIE_NAME = 'alphawolf.csrf-form';
export const CSRF_FIELD_NAME = '_csrf';

const TOKEN_BYTES = 32;

export function generateCsrfToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function verifyCsrf(
  cookieToken: string | null | undefined,
  submitted: string | null | undefined,
): boolean {
  if (!cookieToken || !submitted) return false;
  const a = Buffer.from(cookieToken);
  const b = Buffer.from(submitted);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
