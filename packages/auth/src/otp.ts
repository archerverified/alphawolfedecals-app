// 6-digit OTP generation + constant-time comparison helpers.
//
// Codes are stored as argon2id hashes, never in clear. The plaintext leaves
// the server exactly once — in the verification email — and is held only in
// memory until then.

import { randomInt, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes (PRD §10.1)
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_MIN_INTERVAL_MS = 30 * 1000; // 30 seconds (PRD §10.1)
export const OTP_HOURLY_RESEND_LIMIT = 5; // 5 sends per email per hour

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 16 * 1024, // OTP is short-lived + low-entropy; cheaper params are fine
  timeCost: 2,
  parallelism: 1,
};

export function generateOtpCode(): string {
  // randomInt(min, max) — max is exclusive. Pad to fixed length.
  const n = randomInt(0, 10 ** OTP_LENGTH);
  return n.toString().padStart(OTP_LENGTH, '0');
}

export async function hashOtp(code: string): Promise<string> {
  return argon2.hash(code, ARGON2_OPTIONS);
}

export async function verifyOtp(hash: string, candidate: string): Promise<boolean> {
  if (!hash || !candidate) return false;
  // Constant-time length check on the candidate before argon2 work.
  if (!constantTimeStringEqLength(candidate, OTP_LENGTH)) return false;
  try {
    return await argon2.verify(hash, candidate);
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
