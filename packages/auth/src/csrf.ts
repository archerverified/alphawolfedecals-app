// CSRF defense for state-changing routes outside the Auth.js sign-in flow
// (signup, verify, resend-OTP). Auth.js already provides CSRF on its own
// /api/auth/* endpoints; this is for the bespoke server actions.
//
// Pattern: double-submit cookie. A random token is set in a httpOnly+SameSite=strict
// cookie at first GET; submissions must echo the same token in a hidden form
// field. Comparison is constant-time.

// SERVER ONLY — uses node:crypto. The constants (cookie name + form field
// name) live in ./csrf-constants and are safe to import from the client.

import { randomBytes, timingSafeEqual } from 'node:crypto';

// Re-exported for backwards compatibility within this package. New code should
// import these directly from ./csrf-constants.
export { CSRF_COOKIE_NAME, CSRF_FIELD_NAME } from './csrf-constants.js';

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
