import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @alphawolf/db before importing signup. Use a tiny in-memory store
// that matches the repo surfaces signup.ts touches.

type StoredUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  passwordHash: string;
  accountType: 'customer' | 'shop_user';
  status: 'pending_verification' | 'active' | 'locked' | 'deleted';
};
type StoredOtp = {
  id: string;
  userId: string;
  codeHash: string;
  purpose: string;
  expiresAt: Date;
  consumedAt: Date | null;
  attempts: number;
  createdAt: Date;
};

const users = new Map<string, StoredUser>();
const otps = new Map<string, StoredOtp>();
const events: Array<{ userId: string | null; eventType: string }> = [];
const shops: Array<{ id: string; ownerUserId: string }> = [];
const grantedUserIds = new Set<string>();

let uidCounter = 0;
const uid = () => `id-${++uidCounter}`;

vi.mock('@alphawolf/db', () => ({
  users: {
    async createUser(input: {
      email: string;
      firstName: string;
      lastName: string;
      phone?: string | null;
      passwordHash: string;
      accountType: 'customer' | 'shop_user';
    }) {
      for (const u of users.values()) {
        if (u.email.toLowerCase() === input.email.toLowerCase()) {
          const err = new Error('unique violation') as Error & { code?: string };
          err.code = 'P2002';
          throw err;
        }
      }
      const id = uid();
      const user: StoredUser = {
        id,
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone ?? null,
        passwordHash: input.passwordHash,
        accountType: input.accountType,
        status: 'pending_verification',
      };
      users.set(id, user);
      return user;
    },
    async findUserByEmailForAuth(email: string) {
      for (const u of users.values()) {
        if (u.email.toLowerCase() === email.toLowerCase()) return u;
      }
      return null;
    },
    async markUserActive(userId: string) {
      const u = users.get(userId);
      if (u) u.status = 'active';
    },
    isUniqueViolation(err: unknown) {
      return Boolean(err && typeof err === 'object' && (err as { code?: string }).code === 'P2002');
    },
  },
  otp: {
    async createOtp(input: { userId: string; codeHash: string; purpose: string; expiresAt: Date }) {
      // Invalidate prior open codes
      for (const o of otps.values()) {
        if (o.userId === input.userId && o.purpose === input.purpose && o.consumedAt === null) {
          o.consumedAt = new Date();
        }
      }
      const id = uid();
      const row: StoredOtp = {
        id,
        userId: input.userId,
        codeHash: input.codeHash,
        purpose: input.purpose,
        expiresAt: input.expiresAt,
        consumedAt: null,
        attempts: 0,
        createdAt: new Date(),
      };
      otps.set(id, row);
      return row;
    },
    async findActiveOtp(userId: string, purpose: string) {
      const matches = Array.from(otps.values()).filter(
        (o) =>
          o.userId === userId &&
          o.purpose === purpose &&
          o.consumedAt === null &&
          o.expiresAt > new Date(),
      );
      matches.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return matches[0] ?? null;
    },
    async recordOtpAttempt(id: string) {
      const o = otps.get(id)!;
      o.attempts += 1;
      return o.attempts;
    },
    async consumeOtp(id: string) {
      const o = otps.get(id)!;
      o.consumedAt = new Date();
    },
    async countRecentOtpRequests(userId: string, purpose: string, sinceMs: number) {
      const cutoff = Date.now() - sinceMs;
      return Array.from(otps.values()).filter(
        (o) => o.userId === userId && o.purpose === purpose && o.createdAt.getTime() >= cutoff,
      ).length;
    },
    async deleteOtp(id: string) {
      otps.delete(id);
    },
  },
  shops: {
    async createShopWithAdminMembership(input: {
      ownerUserId: string;
      companyName: string;
      phone: string;
    }) {
      const id = uid();
      shops.push({ id, ownerUserId: input.ownerUserId });
      return { id, receiveCode: 'ABCDEFGHJKLM', createdAt: new Date() };
    },
  },
  authEvents: {
    async logAuthEvent(input: { userId?: string | null; eventType: string }) {
      events.push({ userId: input.userId ?? null, eventType: input.eventType });
    },
  },
  credits: {
    // Mirrors grantSignupCredits' idempotency: first call grants, retries no-op.
    async grantSignupCredits(userId: string) {
      if (grantedUserIds.has(userId)) return 0;
      grantedUserIds.add(userId);
      return 5;
    },
  },
  referrals: {
    sanitizeReferralCode(input: unknown) {
      if (typeof input !== 'string') return null;
      const code = input.trim().toUpperCase();
      return /^[A-Z0-9]{6,20}$/.test(code) ? code : null;
    },
    // No referral code in these fixtures — attribution is a no-op.
    async grantReferralIfAttributed() {
      return { attributed: false as const, reason: 'no_code' as const };
    },
  },
}));

// Use console transport so Resend is never called from these tests.
beforeEach(() => {
  users.clear();
  otps.clear();
  events.length = 0;
  shops.length = 0;
  grantedUserIds.clear();
  uidCounter = 0;
  process.env.NODE_ENV = 'development';
  process.env.AUTH_EMAIL_TRANSPORT = 'console';
});

afterEach(() => {
  delete process.env.AUTH_EMAIL_TRANSPORT;
});

// Wrap sendOtpEmail in a spy that defaults to the real implementation (console
// transport in these tests), so the send-failure suite below can inject
// per-call rejections with mockRejectedValueOnce.
vi.mock('../src/email', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/email')>();
  return { ...actual, sendOtpEmail: vi.fn(actual.sendOtpEmail) };
});

import {
  _clearPendingShopData,
  resendVerificationOtp,
  signupCustomer,
  signupShop,
  verifySignupOtp,
} from '../src/signup';
import { _getDevOtp, sendOtpEmail } from '../src/email';
import { OTP_HOURLY_RESEND_LIMIT } from '../src/otp-constants';

const goodCustomerInput = {
  firstName: 'Casey',
  lastName: 'Customer',
  email: 'casey@example.com',
  password: 'Aa1!aaaaaaaa',
};

const goodShopInput = {
  ...goodCustomerInput,
  email: 'shop@example.com',
  companyName: 'Rad Wraps Co',
  phone: '+1 555 555 5555',
  website: 'https://example.com',
  address: '123 Main St',
};

describe('signupCustomer', () => {
  it('creates a pending_verification user and issues an OTP', async () => {
    const res = await signupCustomer(goodCustomerInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.accountType).toBe('customer');
    expect(res.otpSent).toBe(true);

    const stored = await Promise.resolve(Array.from(users.values())[0]!);
    expect(stored.status).toBe('pending_verification');
    expect(_getDevOtp(goodCustomerInput.email)).toMatch(/^\d{6}$/);
    expect(events.map((e) => e.eventType)).toEqual(['signup', 'otp_requested']);
  });

  it('rejects invalid input', async () => {
    const res = await signupCustomer({ ...goodCustomerInput, email: 'not-an-email' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('invalid_input');
  });

  it('rejects weak password', async () => {
    const res = await signupCustomer({ ...goodCustomerInput, password: 'short' });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    // Zod's min(12) on password fires first and produces 'invalid_input'.
    expect(['weak_password', 'invalid_input']).toContain(res.reason);
  });

  it('returns email_in_use when the email already exists', async () => {
    await signupCustomer(goodCustomerInput);
    const second = await signupCustomer({ ...goodCustomerInput, firstName: 'Other' });
    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.reason).toBe('email_in_use');
  });
});

describe('signupShop', () => {
  beforeEach(() => _clearPendingShopData());

  it('creates a pending_verification shop user and issues an OTP', async () => {
    const res = await signupShop(goodShopInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.accountType).toBe('shop_user');
  });

  it('rejects missing company name', async () => {
    const res = await signupShop({ ...goodShopInput, companyName: '' });
    expect(res.ok).toBe(false);
  });
});

describe('verifySignupOtp', () => {
  beforeEach(() => _clearPendingShopData());

  it('activates the user on correct code (customer)', async () => {
    const signup = await signupCustomer(goodCustomerInput);
    expect(signup.ok).toBe(true);
    if (!signup.ok) return;
    const code = _getDevOtp(goodCustomerInput.email)!;

    const verify = await verifySignupOtp({ email: goodCustomerInput.email, code });
    expect(verify.ok).toBe(true);
    if (!verify.ok) return;
    expect(verify.accountType).toBe('customer');
    expect(verify.creditsGranted).toBe(5);
    expect(users.get(signup.userId)?.status).toBe('active');
  });

  it('creates the shop org on correct code (shop)', async () => {
    const signup = await signupShop(goodShopInput);
    expect(signup.ok).toBe(true);
    if (!signup.ok) return;
    const code = _getDevOtp(goodShopInput.email)!;

    const verify = await verifySignupOtp({ email: goodShopInput.email, code });
    expect(verify.ok).toBe(true);
    if (!verify.ok) return;
    expect(verify.accountType).toBe('shop_user');
    expect(verify.shopId).toBeDefined();
    expect(verify.creditsGranted).toBe(5);
    expect(shops).toHaveLength(1);
  });

  it('rejects wrong code and increments attempts', async () => {
    await signupCustomer(goodCustomerInput);
    const verify = await verifySignupOtp({ email: goodCustomerInput.email, code: '000000' });
    expect(verify.ok).toBe(false);
    if (verify.ok) return;
    expect(verify.reason).toBe('invalid');
    expect(verify.remaining).toBe(4);
  });

  it('locks out after 5 wrong attempts', async () => {
    await signupCustomer(goodCustomerInput);
    for (let i = 0; i < 5; i++) {
      await verifySignupOtp({ email: goodCustomerInput.email, code: '000000' });
    }
    const blocked = await verifySignupOtp({ email: goodCustomerInput.email, code: '000000' });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) return;
    expect(blocked.reason).toBe('too_many_attempts');
  });

  it('returns not_found for an unknown email', async () => {
    const verify = await verifySignupOtp({ email: 'ghost@example.com', code: '123456' });
    expect(verify.ok).toBe(false);
    if (verify.ok) return;
    expect(verify.reason).toBe('not_found');
  });
});

describe('resendVerificationOtp', () => {
  it('refuses to resend within 30 seconds', async () => {
    await signupCustomer(goodCustomerInput);
    const res = await resendVerificationOtp(goodCustomerInput.email);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('too_soon');
    expect(res.retryAfterMs).toBeGreaterThan(0);
  });

  it('returns not_found for an unknown email', async () => {
    const res = await resendVerificationOtp('ghost@example.com');
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('not_found');
  });

  it('returns already_verified once the user is active', async () => {
    const signup = await signupCustomer(goodCustomerInput);
    expect(signup.ok).toBe(true);
    if (!signup.ok) return;
    const code = _getDevOtp(goodCustomerInput.email)!;
    await verifySignupOtp({ email: goodCustomerInput.email, code });

    const res = await resendVerificationOtp(goodCustomerInput.email);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('already_verified');
  });
});

// PR #134 caller hardening: when Resend rejects the send, the account must
// still be created (otpSent=false → caller routes to /verify), and the
// undelivered OTP must not charge the hourly resend budget.
describe('signup when the OTP email fails to send', () => {
  const failNextSend = () =>
    vi.mocked(sendOtpEmail).mockRejectedValueOnce(new Error('Resend down'));

  beforeEach(() => {
    // Clears any leftover one-shot rejections and restores the real impl.
    vi.mocked(sendOtpEmail).mockReset();
  });

  it('still creates the customer account and reports otpSent=false', async () => {
    failNextSend();
    const res = await signupCustomer(goodCustomerInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.otpSent).toBe(false);

    // Not the email_in_use trap: the user recovers via the /verify Resend button.
    const resent = await resendVerificationOtp(goodCustomerInput.email);
    expect(resent.ok).toBe(true);
    expect(_getDevOtp(goodCustomerInput.email)).toMatch(/^\d{6}$/);
  });

  it('still creates the shop account and reports otpSent=false', async () => {
    failNextSend();
    const res = await signupShop(goodShopInput);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.otpSent).toBe(false);
  });

  it('does not charge failed sends against the hourly resend limit', async () => {
    failNextSend();
    const signup = await signupCustomer(goodCustomerInput);
    expect(signup.ok && !signup.otpSent).toBe(true);

    // More consecutive failures than the hourly budget allows. Each failed
    // send deletes its OTP row, so none of them count (and none arm the 30s
    // too_soon window).
    for (let i = 0; i <= OTP_HOURLY_RESEND_LIMIT; i++) {
      failNextSend();
      await expect(resendVerificationOtp(goodCustomerInput.email)).rejects.toThrow('Resend down');
    }

    // Resend recovers: the user is NOT locked out behind hourly_limit.
    const recovered = await resendVerificationOtp(goodCustomerInput.email);
    expect(recovered.ok).toBe(true);
    expect(_getDevOtp(goodCustomerInput.email)).toMatch(/^\d{6}$/);
  });
});
