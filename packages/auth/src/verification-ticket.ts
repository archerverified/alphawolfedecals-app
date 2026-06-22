// Verification ticket: a short-lived, HMAC-signed proof that a user JUST passed
// signup OTP verification. It lets the server establish that user's session
// (D1, Goal 20 fix-it) WITHOUT a password — the password is set at signup time
// and never available in plaintext at verify time.
//
// SECURITY MODEL:
//   * Minted ONLY server-side, immediately after verifySignupOtp() succeeds.
//   * Consumed in the SAME request by the `otp-verified` Credentials provider's
//     authorize() (see verified-session.ts). The ticket never reaches the
//     browser, so there is no client replay surface.
//   * Signed with AUTH_SECRET (the next-auth secret already required in prod), so
//     it cannot be forged.
//   * Short TTL (2 minutes), so even a leaked ticket expires almost immediately.
//
// SERVER ONLY — uses node:crypto. Mirrors the csrf.ts / otp.ts crypto pattern.

import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export const VERIFICATION_TICKET_TTL_MS = 2 * 60 * 1000; // 2 minutes

function ticketSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error('[auth] AUTH_SECRET is required to issue verification tickets');
  }
  return secret;
}

function sign(payloadB64: string): string {
  return createHmac('sha256', ticketSecret()).update(payloadB64).digest('base64url');
}

// Issue a ticket for a just-verified user. `email` is lowercased so the
// consumer can compare against the canonical (lowercased) account email.
export function issueVerificationTicket(userId: string, email: string): string {
  const payload = {
    u: userId,
    e: email.trim().toLowerCase(),
    x: Date.now() + VERIFICATION_TICKET_TTL_MS,
    // Nonce so two tickets minted in the same millisecond differ; keeps tickets
    // opaque and non-guessable even before the signature check.
    n: randomBytes(8).toString('base64url'),
  };
  // base64url(JSON) contains no '.', and the signature is base64url (no '.'),
  // so a single '.' is an unambiguous delimiter even for emails full of dots.
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${payloadB64}.${sign(payloadB64)}`;
}

export type VerifiedTicket = { userId: string; email: string };

// Verify a ticket. Returns the bound userId + (lowercased) email when the
// signature is valid AND the ticket has not expired; otherwise null. Never
// throws on malformed input.
export function verifyVerificationTicket(ticket: string | null | undefined): VerifiedTicket | null {
  if (!ticket || typeof ticket !== 'string') return null;
  const dot = ticket.indexOf('.');
  if (dot <= 0 || dot !== ticket.lastIndexOf('.')) return null;

  const payloadB64 = ticket.slice(0, dot);
  const providedSig = ticket.slice(dot + 1);
  if (!payloadB64 || !providedSig) return null;

  // Constant-time signature comparison.
  const expectedSig = sign(payloadB64);
  const a = Buffer.from(providedSig);
  const b = Buffer.from(expectedSig);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: { u?: unknown; e?: unknown; x?: unknown };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const userId = typeof payload.u === 'string' ? payload.u : '';
  const email = typeof payload.e === 'string' ? payload.e : '';
  const exp = typeof payload.x === 'number' ? payload.x : 0;
  if (!userId || !email || !Number.isFinite(exp) || Date.now() > exp) return null;

  return { userId, email };
}
