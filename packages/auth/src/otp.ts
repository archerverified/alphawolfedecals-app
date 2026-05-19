// 6-digit OTP generation + constant-time comparison helpers. SERVER ONLY.
//
// Uses @node-rs/argon2 (Rust + N-API) — see password.ts for the rationale.
//
// The OTP_* constants are re-exported from ./otp-constants for client use
// (e.g. input maxLength on the verify form).
//
// Codes are stored as argon2id hashes, never in clear. The plaintext leaves
// the server exactly once — in the verification email — and is held only in
// memory until then.

import { randomInt, timingSafeEqual } from 'node:crypto';
import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

// Re-exported for backwards compatibility within this package. New code should
// import these directly from ./otp-constants.
export {
  OTP_LENGTH,
  OTP_TTL_MS,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MIN_INTERVAL_MS,
  OTP_HOURLY_RESEND_LIMIT,
} from './otp-constants';

import { OTP_LENGTH, OTP_TTL_MS } from './otp-constants';

// Argon2id is @node-rs/argon2's default algorithm — see password.ts for the
// const-enum rationale.
const ARGON2_OPTIONS = {
  memoryCost: 16 * 1024, // OTP is short-lived + low-entropy; cheaper params are fine
  timeCost: 2,
  parallelism: 1,
} as const;

export function generateOtpCode(): string {
  // randomInt(min, max) — max is exclusive. Pad to fixed length.
  const n = randomInt(0, 10 ** OTP_LENGTH);
  return n.toString().padStart(OTP_LENGTH, '0');
}

export async function hashOtp(code: string): Promise<string> {
  return argonHash(code, ARGON2_OPTIONS);
}

export async function verifyOtp(hash: string, candidate: string): Promise<boolean> {
  if (!hash || !candidate) return false;
  // Constant-time length check on the candidate before argon2 work.
  if (!constantTimeStringEqLength(candidate, OTP_LENGTH)) return false;
  try {
    return await argonVerify(hash, candidate);
  } catch {
    return false;
  }
}

// True iff `s` has exactly `n` characters, compared in constant time on length.
// Avoids leaking length via early return + branch timing.
function constantTimeStringEqLength(s: string, n: number): boolean {
  const actual = Buffer.from(String(s.length).padStart(8, '0'));
  const expected = Buffer.from(String(n).padStart(8, '0'));
  return timingSafeEqual(actual, expected);
}

export function otpExpiry(): Date {
  return new Date(Date.now() + OTP_TTL_MS);
}
