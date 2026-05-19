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
}));

// Use console transport so Resend is never called from these tests.
beforeEach(() => {
  users.clear();
  otps.clear();
  events.length = 0;
  shops.length = 0;
  uidCounter = 0;
  process.env.NODE_ENV = 'development';
  process.env.AUTH_EMAIL_TRANSPORT = 'console';
});

afterEach(() => {
  delete process.env.AUTH_EMAIL_TRANSPORT;
});

import {
  _clearPendingShopData,
  resendVerificationOtp,
  signupCustomer,
  signupShop,
  verifySignupOtp,
} from '../src/signup';
import { _getDevOtp } from '../src/email';

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
