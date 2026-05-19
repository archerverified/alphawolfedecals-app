import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { hashPassword } from '../src/password';

type StoredUser = {
  id: string;
  email: string;
  passwordHash: string;
  accountType: 'customer' | 'shop_user';
  status: 'pending_verification' | 'active' | 'locked' | 'deleted';
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
};

const users = new Map<string, StoredUser>();
const events: Array<{ userId: string | null; eventType: string }> = [];
const rateLimitStore = new Map<
  string,
  { attempts: number; resetAt: Date; lockedUntil: Date | null }
>();

vi.mock('@alphawolf/db', () => ({
  users: {
    async findUserByEmailForAuth(email: string) {
      for (const u of users.values()) {
        if (u.email.toLowerCase() === email.toLowerCase()) {
          return {
            id: u.id,
            email: u.email,
            firstName: 'X',
            lastName: 'X',
            phone: null,
            passwordHash: u.passwordHash,
            accountType: u.accountType,
            status: u.status,
            failedLoginCount: u.failedLoginCount,
            lockedUntil: u.lockedUntil,
            lastLoginAt: u.lastLoginAt,
            createdAt: new Date(),
          };
        }
      }
      return null;
    },
    async resetFailedLogin(userId: string) {
      const u = users.get(userId);
      if (u) {
        u.failedLoginCount = 0;
        u.lockedUntil = null;
        u.lastLoginAt = new Date();
      }
    },
  },
  authEvents: {
    async logAuthEvent(input: { userId?: string | null; eventType: string }) {
      events.push({ userId: input.userId ?? null, eventType: input.eventType });
    },
  },
  rateLimit: {
    async getRateLimit(key: string) {
      const v = rateLimitStore.get(key);
      return v ? { ...v } : null;
    },
    async recordFailure(input: {
      key: string;
      windowMs: number;
      threshold: number;
      lockoutMs: number;
    }) {
      const now = new Date();
      const existing = rateLimitStore.get(input.key);
      if (existing?.lockedUntil && existing.lockedUntil > now) {
        return { allowed: false, lockedUntil: existing.lockedUntil, remaining: 0 };
      }
      let attempts: number;
      let resetAt: Date;
      if (!existing || existing.resetAt <= now) {
        attempts = 1;
        resetAt = new Date(now.getTime() + input.windowMs);
      } else {
        attempts = existing.attempts + 1;
        resetAt = existing.resetAt;
      }
      const shouldLock = attempts >= input.threshold;
      const lockedUntil = shouldLock ? new Date(now.getTime() + input.lockoutMs) : null;
      rateLimitStore.set(input.key, { attempts, resetAt, lockedUntil });
      return {
        allowed: !shouldLock,
        lockedUntil,
        remaining: Math.max(0, input.threshold - attempts),
      };
    },
    async clearRateLimit(key: string) {
      rateLimitStore.delete(key);
    },
  },
}));

import { login } from '../src/login';

beforeEach(async () => {
  users.clear();
  events.length = 0;
  rateLimitStore.clear();
  const passwordHash = await hashPassword('Aa1!aaaaaaaa');
  users.set('u-active', {
    id: 'u-active',
    email: 'active@example.com',
    passwordHash,
    accountType: 'customer',
    status: 'active',
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
  });
  users.set('u-pending', {
    id: 'u-pending',
    email: 'pending@example.com',
    passwordHash,
    accountType: 'customer',
    status: 'pending_verification',
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
  });
  users.set('u-deleted', {
    id: 'u-deleted',
    email: 'deleted@example.com',
    passwordHash,
    accountType: 'customer',
    status: 'deleted',
    failedLoginCount: 0,
    lockedUntil: null,
    lastLoginAt: null,
  });
});

afterEach(() => {
  users.clear();
  events.length = 0;
  rateLimitStore.clear();
});

describe('login', () => {
  it('accepts valid credentials for an active user', async () => {
    const res = await login({
      email: 'active@example.com',
      password: 'Aa1!aaaaaaaa',
      meta: { ip: '1.1.1.1' },
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.accountType).toBe('customer');
    expect(events.some((e) => e.eventType === 'login')).toBe(true);
  });

  it('rejects unknown email without leaking existence', async () => {
    const res = await login({
      email: 'ghost@example.com',
      password: 'Aa1!aaaaaaaa',
      meta: { ip: '1.1.1.2' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('invalid_credentials');
  });

  it('rejects wrong password and logs login_failed', async () => {
    const res = await login({
      email: 'active@example.com',
      password: 'wrong-password-here-12!',
      meta: { ip: '1.1.1.3' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('invalid_credentials');
    expect(events.some((e) => e.eventType === 'login_failed')).toBe(true);
  });

  it('blocks pending_verification users with not_verified', async () => {
    const res = await login({
      email: 'pending@example.com',
      password: 'Aa1!aaaaaaaa',
      meta: { ip: '1.1.1.4' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('not_verified');
  });

  it('blocks deleted accounts with account_deleted', async () => {
    const res = await login({
      email: 'deleted@example.com',
      password: 'Aa1!aaaaaaaa',
      meta: { ip: '1.1.1.5' },
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('account_deleted');
  });

  it('locks IP after 5 failed attempts and rejects further attempts', async () => {
    for (let i = 0; i < 5; i++) {
      await login({
        email: 'active@example.com',
        password: 'wrong-password',
        meta: { ip: '1.1.1.99' },
      });
    }
    const sixth = await login({
      email: 'active@example.com',
      password: 'Aa1!aaaaaaaa',
      meta: { ip: '1.1.1.99' },
    });
    expect(sixth.ok).toBe(false);
    if (sixth.ok) return;
    expect(sixth.reason).toBe('ip_locked');
  });

  it('locks the account after 10 failed attempts (across different IPs)', async () => {
    for (let i = 0; i < 10; i++) {
      await login({
        email: 'active@example.com',
        password: 'wrong-password',
        meta: { ip: `2.2.2.${i}` },
      });
    }
    const next = await login({
      email: 'active@example.com',
      password: 'Aa1!aaaaaaaa',
      meta: { ip: '2.2.2.200' },
    });
    expect(next.ok).toBe(false);
    if (next.ok) return;
    expect(next.reason).toBe('account_locked');
  });

  it('on success, clears failure counters', async () => {
    // Two failures, then one success.
    await login({
      email: 'active@example.com',
      password: 'wrong-password',
      meta: { ip: '3.3.3.3' },
    });
    await login({
      email: 'active@example.com',
      password: 'wrong-password',
      meta: { ip: '3.3.3.3' },
    });
    const ok = await login({
      email: 'active@example.com',
      password: 'Aa1!aaaaaaaa',
      meta: { ip: '3.3.3.3' },
    });
    expect(ok.ok).toBe(true);
    expect(users.get('u-active')!.failedLoginCount).toBe(0);
    expect(users.get('u-active')!.lastLoginAt).not.toBe(null);
  });
});
