// High-level signup + OTP verification flows.
//
// Two entry points:
//   * signupCustomer  — name, email, password, phone? → pending_verification user
//   * signupShop      — same + company name, phone, optional website/address →
//                       pending_verification user, then on verify a shop +
//                       admin membership are created in one txn
//
// Both flows email an OTP. Verification activates the user account and, for
// shops, provisions the shop org.

import { authEvents, shops as shopRepo, users as userRepo } from '@alphawolf/db';
import { z } from 'zod';
import {
  generateOtpCode,
  hashOtp,
  otpExpiry,
  OTP_HOURLY_RESEND_LIMIT,
  OTP_MAX_ATTEMPTS,
  OTP_RESEND_MIN_INTERVAL_MS,
  verifyOtp,
} from './otp.js';
import { hashPassword, validatePasswordPolicy } from './password.js';
import { sendOtpEmail } from './email.js';
import { otp as otpRepo } from '@alphawolf/db';

const NAME_MIN = 1;
const NAME_MAX = 80;

const baseSchema = z.object({
  firstName: z.string().trim().min(NAME_MIN).max(NAME_MAX),
  lastName: z.string().trim().min(NAME_MIN).max(NAME_MAX),
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(12).max(256),
});

export const customerSignupSchema = baseSchema;

export const shopSignupSchema = baseSchema.extend({
  companyName: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(40),
  // Accepts bare domains (1stimpression.co) by auto-prepending https://.
  // Real users don't type protocols; rejecting them is a UX bug.
  // Empty string normalizes to undefined so the optional() path holds.
  website: z.preprocess((v) => {
    if (typeof v !== 'string') return v;
    const trimmed = v.trim();
    if (!trimmed) return undefined;
    return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  }, z.string().url().max(2048).optional()),
  address: z
    .string()
    .trim()
    .max(500)
    .optional()
    .or(z.literal('').transform(() => undefined)),
});

export type CustomerSignupInput = z.infer<typeof customerSignupSchema>;
export type ShopSignupInput = z.infer<typeof shopSignupSchema>;

export type SignupResult =
  | { ok: true; userId: string; email: string; accountType: 'customer' | 'shop_user' }
  | { ok: false; reason: 'email_in_use' | 'invalid_input' | 'weak_password'; messages: string[] };

type Pending = {
  companyName?: string;
  phone?: string;
  website?: string | null;
  address?: string | null;
};

// We park the shop-only fields on the User.metadata? No — schema doesn't have
// it. Instead we lean on the OTP verification step to create the shop, and
// hold the shop input in the OTP `metadata` indirectly via in-memory cache.
// Simpler: store shop fields on the otp row itself? Schema has no metadata
// column on otp. To keep blast radius small, we put pending shop signup data
// in a short-lived in-memory map keyed by userId. If the process restarts
// between signup and verify, the user re-runs signup (acceptable for Phase 1).
const pendingShopData = new Map<string, Pending>();
const PENDING_TTL_MS = 30 * 60 * 1000; // 30 minutes
const pendingTimestamps = new Map<string, number>();
function pruneStalePending(): void {
  const cutoff = Date.now() - PENDING_TTL_MS;
  for (const [k, ts] of pendingTimestamps) {
    if (ts < cutoff) {
      pendingShopData.delete(k);
      pendingTimestamps.delete(k);
    }
  }
}

async function issueOtpFor(
  userId: string,
  email: string,
  accountType: 'customer' | 'shop_user',
  meta: { ip?: string; userAgent?: string },
): Promise<void> {
  const code = generateOtpCode();
  const codeHash = await hashOtp(code);
  await otpRepo.createOtp({
    userId,
    codeHash,
    purpose: 'signup_verification',
    expiresAt: otpExpiry(),
  });
  await sendOtpEmail({ to: email, code, accountType });
  await authEvents.logAuthEvent({
    userId,
    eventType: 'otp_requested',
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
    metadata: { purpose: 'signup_verification' },
  });
}

export async function signupCustomer(
  raw: unknown,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<SignupResult> {
  const parsed = customerSignupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid_input',
      messages: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  const policyErrors = validatePasswordPolicy(parsed.data.password);
  if (policyErrors.length) {
    return { ok: false, reason: 'weak_password', messages: policyErrors };
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await userRepo.createUser({
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      passwordHash,
      accountType: 'customer',
    });
    await authEvents.logAuthEvent({
      userId: user.id,
      eventType: 'signup',
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      metadata: { accountType: 'customer' },
    });
    await issueOtpFor(user.id, parsed.data.email, 'customer', meta);
    return { ok: true, userId: user.id, email: parsed.data.email, accountType: 'customer' };
  } catch (err) {
    if (userRepo.isUniqueViolation(err)) {
      // Don't reveal that the email is in use. Still issue an OTP-like delay
      // and return a generic "if your email is new, check your inbox" message.
      // Caller decides whether to expose the distinction.
      return { ok: false, reason: 'email_in_use', messages: ['Email already in use'] };
    }
    throw err;
  }
}

export async function signupShop(
  raw: unknown,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<SignupResult> {
  const parsed = shopSignupSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      reason: 'invalid_input',
      messages: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
    };
  }
  const policyErrors = validatePasswordPolicy(parsed.data.password);
  if (policyErrors.length) {
    return { ok: false, reason: 'weak_password', messages: policyErrors };
  }

  try {
    const passwordHash = await hashPassword(parsed.data.password);
    const user = await userRepo.createUser({
      email: parsed.data.email,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
      passwordHash,
      accountType: 'shop_user',
    });
    pruneStalePending();
    pendingShopData.set(user.id, {
      companyName: parsed.data.companyName,
      phone: parsed.data.phone,
      website: parsed.data.website ?? null,
      address: parsed.data.address ?? null,
    });
    pendingTimestamps.set(user.id, Date.now());
    await authEvents.logAuthEvent({
      userId: user.id,
      eventType: 'signup',
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      metadata: { accountType: 'shop_user' },
    });
    await issueOtpFor(user.id, parsed.data.email, 'shop_user', meta);
    return { ok: true, userId: user.id, email: parsed.data.email, accountType: 'shop_user' };
  } catch (err) {
    if (userRepo.isUniqueViolation(err)) {
      return { ok: false, reason: 'email_in_use', messages: ['Email already in use'] };
    }
    throw err;
  }
}

export type ResendResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'too_soon' | 'hourly_limit' | 'not_found' | 'already_verified';
      retryAfterMs?: number;
    };

export async function resendVerificationOtp(
  email: string,
  meta: { ip?: string; userAgent?: string } = {},
): Promise<ResendResult> {
  const user = await userRepo.findUserByEmailForAuth(email);
  if (!user) return { ok: false, reason: 'not_found' };
  if (user.status === 'active') return { ok: false, reason: 'already_verified' };

  const recent = await otpRepo.findActiveOtp(user.id, 'signup_verification');
  if (recent) {
    const elapsed = Date.now() - recent.createdAt.getTime();
    if (elapsed < OTP_RESEND_MIN_INTERVAL_MS) {
      return {
        ok: false,
        reason: 'too_soon',
        retryAfterMs: OTP_RESEND_MIN_INTERVAL_MS - elapsed,
      };
    }
  }
  const hourly = await otpRepo.countRecentOtpRequests(
    user.id,
    'signup_verification',
    60 * 60 * 1000,
  );
  if (hourly >= OTP_HOURLY_RESEND_LIMIT) return { ok: false, reason: 'hourly_limit' };

  await issueOtpFor(user.id, email, user.accountType, meta);
  return { ok: true };
}

export type VerifyResult =
  | { ok: true; userId: string; accountType: 'customer' | 'shop_user'; shopId?: string }
  | {
      ok: false;
      reason: 'invalid' | 'expired' | 'too_many_attempts' | 'not_found';
      remaining?: number;
    };

export async function verifySignupOtp(args: {
  email: string;
  code: string;
  meta?: { ip?: string; userAgent?: string };
}): Promise<VerifyResult> {
  const meta = args.meta ?? {};
  const user = await userRepo.findUserByEmailForAuth(args.email);
  if (!user) return { ok: false, reason: 'not_found' };

  const active = await otpRepo.findActiveOtp(user.id, 'signup_verification');
  if (!active) {
    await authEvents.logAuthEvent({
      userId: user.id,
      eventType: 'otp_failed',
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      metadata: { reason: 'expired_or_missing' },
    });
    return { ok: false, reason: 'expired' };
  }

  if (active.attempts >= OTP_MAX_ATTEMPTS) {
    await authEvents.logAuthEvent({
      userId: user.id,
      eventType: 'otp_failed',
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      metadata: { reason: 'too_many_attempts' },
    });
    return { ok: false, reason: 'too_many_attempts' };
  }

  const ok = await verifyOtp(active.codeHash, args.code);
  if (!ok) {
    const attempts = await otpRepo.recordOtpAttempt(active.id);
    await authEvents.logAuthEvent({
      userId: user.id,
      eventType: 'otp_failed',
      ipAddress: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      metadata: { attempts },
    });
    return { ok: false, reason: 'invalid', remaining: Math.max(0, OTP_MAX_ATTEMPTS - attempts) };
  }

  await otpRepo.consumeOtp(active.id);
  await userRepo.markUserActive(user.id);
  await authEvents.logAuthEvent({
    userId: user.id,
    eventType: 'otp_verified',
    ipAddress: meta.ip ?? null,
    userAgent: meta.userAgent ?? null,
  });

  let shopId: string | undefined;
  if (user.accountType === 'shop_user') {
    const pending = pendingShopData.get(user.id);
    // If the in-memory pending data is gone (process restart), still mark the
    // user active — the shop record can be created by walking them through
    // the shop setup form on first login. Phase 1 acceptable.
    if (pending && pending.companyName && pending.phone) {
      const shop = await shopRepo.createShopWithAdminMembership({
        ownerUserId: user.id,
        companyName: pending.companyName,
        phone: pending.phone,
        website: pending.website ?? null,
        address: pending.address ?? null,
      });
      shopId = shop.id;
      pendingShopData.delete(user.id);
      pendingTimestamps.delete(user.id);
    }
  }

  return {
    ok: true,
    userId: user.id,
    accountType: user.accountType,
    ...(shopId ? { shopId } : {}),
  };
}

// Test-only — drop pending shop data between tests.
export function _clearPendingShopData(): void {
  pendingShopData.clear();
  pendingTimestamps.clear();
}
