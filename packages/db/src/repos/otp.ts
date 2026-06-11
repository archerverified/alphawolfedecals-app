// OTP code repository. The OTP itself is hashed before storage; lookup is by
// (userId, purpose) for the most recent unconsumed unexpired row.

import { withSystem } from '../client.js';

export type OtpPurpose = 'signup_verification' | 'password_reset';

export type OtpRow = {
  id: string;
  userId: string;
  codeHash: string;
  purpose: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
};

type CreateOtpInput = {
  userId: string;
  codeHash: string;
  purpose: OtpPurpose;
  expiresAt: Date;
};

export async function createOtp(input: CreateOtpInput): Promise<OtpRow> {
  return withSystem(async (db) => {
    // Invalidate prior open codes for the same (user, purpose) so an attacker
    // can't race two codes against each other.
    await db.otpCode.updateMany({
      where: {
        userId: input.userId,
        purpose: input.purpose,
        consumedAt: null,
      },
      data: { consumedAt: new Date() },
    });

    const row = await db.otpCode.create({
      data: {
        userId: input.userId,
        codeHash: input.codeHash,
        purpose: input.purpose,
        expiresAt: input.expiresAt,
      },
    });
    return row as OtpRow;
  });
}

export async function findActiveOtp(userId: string, purpose: OtpPurpose): Promise<OtpRow | null> {
  return withSystem(async (db) => {
    const row = await db.otpCode.findFirst({
      where: {
        userId,
        purpose,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    return (row as OtpRow | null) ?? null;
  });
}

export async function recordOtpAttempt(otpId: string): Promise<number> {
  return withSystem(async (db) => {
    const updated = await db.otpCode.update({
      where: { id: otpId },
      data: { attempts: { increment: 1 } },
      select: { attempts: true },
    });
    return updated.attempts;
  });
}

export async function consumeOtp(otpId: string): Promise<void> {
  await withSystem(async (db) => {
    await db.otpCode.update({
      where: { id: otpId },
      data: { consumedAt: new Date() },
    });
  });
}

// Remove an OTP whose email was never delivered (Resend rejected the send).
// countRecentOtpRequests counts rows by createdAt regardless of consumedAt, so
// leaving the orphaned row would charge the user's hourly resend budget (and
// trip the 30s too_soon window) for a failure that was never their fault.
export async function deleteOtp(otpId: string): Promise<void> {
  await withSystem(async (db) => {
    await db.otpCode.delete({ where: { id: otpId } });
  });
}

export async function countRecentOtpRequests(
  userId: string,
  purpose: OtpPurpose,
  sinceMs: number,
): Promise<number> {
  return withSystem(async (db) => {
    return db.otpCode.count({
      where: {
        userId,
        purpose,
        createdAt: { gte: new Date(Date.now() - sinceMs) },
      },
    });
  });
}
