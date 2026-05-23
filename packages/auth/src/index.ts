// Client-safe public surface of @alphawolf/auth.
//
// Only modules that have ZERO server-only dependencies (no argon2, no node:crypto,
// no node:fs, no @alphawolf/db, no Next.js runtime hooks) may be re-exported
// here. Anything server-only lives at @alphawolf/auth/server.
//
// Importing this file from a "use client" component is safe.

export { CSRF_COOKIE_NAME, CSRF_FIELD_NAME } from './csrf-constants.js';

export {
  OTP_LENGTH,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MIN_INTERVAL_MS,
  OTP_HOURLY_RESEND_LIMIT,
} from './otp-constants.js';

export { validatePasswordPolicy, passwordStrength } from './password-policy.js';
