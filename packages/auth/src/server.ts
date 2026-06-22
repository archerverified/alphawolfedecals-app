// Server-only public surface of @alphawolf/auth.
//
// Everything reachable from this module is allowed to depend on argon2,
// node:crypto, node:fs, @alphawolf/db, Next.js server runtimes, etc.
//
// NEVER import this from a "use client" component or any module reachable
// from one. If you need a constant or a pure function on the client, add it
// to one of the *-constants.ts files or to password-policy.ts and re-export
// from ./index.

import NextAuth from 'next-auth';
import type { NextAuthResult } from 'next-auth';
import { authConfig } from './auth-config.js';

// Re-exported so apps/web can distinguish a failed credentials sign-in (catch)
// from the success redirect (rethrow) without taking a direct next-auth dep.
export { AuthError } from 'next-auth';

// Explicit type annotations on each export work around next-auth v5's
// portable-type inference problem (TS2742) when re-exporting from a
// workspace package that has tsconfig `declaration: true`.
const nextAuth: NextAuthResult = NextAuth(authConfig);

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;

export { authConfig } from './auth-config.js';

// Password hashing / verification (argon2).
export { hashPassword, verifyPassword } from './password.js';

// OTP generation / hashing / verification (argon2 + node:crypto).
export { generateOtpCode, hashOtp, verifyOtp, otpExpiry } from './otp.js';

// CSRF token generation / verification (node:crypto).
export { generateCsrfToken, verifyCsrf } from './csrf.js';

// Signup, login, lockout, email dispatch.
export {
  signupCustomer,
  signupShop,
  resendVerificationOtp,
  verifySignupOtp,
  customerSignupSchema,
  shopSignupSchema,
  type CustomerSignupInput,
  type ShopSignupInput,
  type SignupResult,
  type ResendResult,
  type VerifyResult,
} from './signup.js';

export { login, type LoginResult } from './login.js';

// Session-on-verify (Goal 20 D1). issueVerificationTicket is called by
// verifyOtpAction right after a successful OTP verify; the otp-verified
// Credentials provider consumes it via authorizeVerifiedSession.
export {
  issueVerificationTicket,
  verifyVerificationTicket,
  VERIFICATION_TICKET_TTL_MS,
  type VerifiedTicket,
} from './verification-ticket.js';
export { authorizeVerifiedSession, type VerifiedSessionUser } from './verified-session.js';

export {
  checkLoginGuards,
  recordLoginFailure,
  clearLoginFailures,
  IP_LOGIN_THRESHOLD,
  IP_LOGIN_WINDOW_MS,
  ACCOUNT_LOGIN_THRESHOLD,
  ACCOUNT_LOCKOUT_MS,
  type LockoutGuard,
  type FailureOutcome,
} from './lockout.js';

export { sendOtpEmail, sendEmail, _getDevOtp, _stashDevOtp } from './email.js';

// Re-export the client-safe surface from here too, so server code only needs
// one import path. Bundlers will resolve these straight from ./index.
export {
  CSRF_COOKIE_NAME,
  CSRF_FIELD_NAME,
  OTP_LENGTH,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MIN_INTERVAL_MS,
  OTP_HOURLY_RESEND_LIMIT,
  validatePasswordPolicy,
  passwordStrength,
} from './index.js';
