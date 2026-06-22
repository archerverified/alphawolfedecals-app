// authorize() body for the `otp-verified` Credentials provider (D1, Goal 20).
//
// After a successful signup OTP verification, verifyOtpAction mints a
// verification ticket and calls signIn('otp-verified', { email, ticket }). This
// function is the gate: it turns that ticket into the session user, reusing the
// exact same JWT session machinery as a password sign-in — no password, no
// duplicated cookie logic.
//
// It signs in ONLY when ALL hold:
//   * the ticket's HMAC + TTL are valid (verifyVerificationTicket),
//   * the submitted email matches the ticket's email,
//   * the bound user still exists, is `active`, and its current email still
//     matches the ticket (so a stale ticket after an email change is refused).
//
// SERVER ONLY — pulls @alphawolf/db (Prisma). Mirrors login.ts.

import { users as userRepo } from '@alphawolf/db';
import { verifyVerificationTicket } from './verification-ticket.js';

export type VerifiedSessionUser = {
  id: string;
  email: string;
  accountType: 'customer' | 'shop_user';
};

export async function authorizeVerifiedSession(
  email: string,
  ticket: string,
): Promise<VerifiedSessionUser | null> {
  const verified = verifyVerificationTicket(ticket);
  if (!verified) return null;

  const submittedEmail = email.trim().toLowerCase();
  if (submittedEmail !== verified.email) return null;

  const user = await userRepo.findUserById(verified.userId);
  if (!user || user.status !== 'active') return null;
  if (user.email.toLowerCase() !== verified.email) return null;

  return { id: user.id, email: user.email, accountType: user.accountType };
}
