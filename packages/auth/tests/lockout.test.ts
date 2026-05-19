import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @alphawolf/db's rateLimit namespace before importing lockout.
const store = new Map<string, { attempts: number; resetAt: Date; lockedUntil: Date | null }>();

vi.mock('@alphawolf/db', () => ({
  rateLimit: {
    async getRateLimit(key: string) {
      const v = store.get(key);
      return v ? { ...v } : null;
    },
    async recordFailure(input: {
      key: string;
      windowMs: number;
      threshold: number;
      lockoutMs: number;
    }) {
      const now = new Date();
      const existing = store.get(input.key);
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
      store.set(input.key, { attempts, resetAt, lockedUntil });
      return {
        allowed: !shouldLock,
        lockedUntil,
        remaining: Math.max(0, input.threshold - attempts),
      };
    },
    async clearRateLimit(key: string) {
      store.delete(key);
    },
  },
}));

import {
  ACCOUNT_LOGIN_THRESHOLD,
  IP_LOGIN_THRESHOLD,
  checkLoginGuards,
  clearLoginFailures,
  recordLoginFailure,
} from '../src/lockout';

beforeEach(() => {
  store.clear();
});

afterEach(() => {
  store.clear();
});

describe('lockout', () => {
  it('permits a fresh login attempt', async () => {
    const guard = await checkLoginGuards({ ip: '1.2.3.4', userId: 'u1' });
    expect(guard.proceed).toBe(true);
    expect(guard.reason).toBe(null);
  });

  it('locks an IP after 5 failed logins in the window', async () => {
    for (let i = 1; i <= IP_LOGIN_THRESHOLD - 1; i++) {
      const result = await recordLoginFailure({ ip: '1.2.3.4', userId: null });
      expect(result.ipLocked).toBe(false);
    }
    const final = await recordLoginFailure({ ip: '1.2.3.4', userId: null });
    expect(final.ipLocked).toBe(true);
    expect(final.ipLockedUntil).toBeInstanceOf(Date);

    const guard = await checkLoginGuards({ ip: '1.2.3.4', userId: null });
    expect(guard.proceed).toBe(false);
    expect(guard.reason).toBe('ip');
  });

  it('locks a single account after 10 failed logins', async () => {
    for (let i = 1; i <= ACCOUNT_LOGIN_THRESHOLD - 1; i++) {
      // Use distinct IPs so we don't trip the IP guard first.
      const result = await recordLoginFailure({ ip: `10.0.0.${i}`, userId: 'acc-1' });
      expect(result.accountLocked).toBe(false);
    }
    const final = await recordLoginFailure({ ip: '10.0.0.99', userId: 'acc-1' });
    expect(final.accountLocked).toBe(true);

    const guard = await checkLoginGuards({ ip: '10.0.0.100', userId: 'acc-1' });
    expect(guard.proceed).toBe(false);
    expect(guard.reason).toBe('account');
  });

  it('clearLoginFailures resets both IP and account state', async () => {
    for (let i = 0; i < IP_LOGIN_THRESHOLD; i++) {
      await recordLoginFailure({ ip: '5.5.5.5', userId: 'acc-2' });
    }
    let guard = await checkLoginGuards({ ip: '5.5.5.5', userId: 'acc-2' });
    expect(guard.proceed).toBe(false);

    await clearLoginFailures({ ip: '5.5.5.5', userId: 'acc-2' });
    guard = await checkLoginGuards({ ip: '5.5.5.5', userId: 'acc-2' });
    expect(guard.proceed).toBe(true);
  });

  it('does not double-count once already locked', async () => {
    for (let i = 0; i < IP_LOGIN_THRESHOLD; i++) {
      await recordLoginFailure({ ip: '9.9.9.9', userId: null });
    }
    const after = await recordLoginFailure({ ip: '9.9.9.9', userId: null });
    expect(after.ipLocked).toBe(true);
    expect(after.ipLockedUntil).toBeInstanceOf(Date);
  });
});
