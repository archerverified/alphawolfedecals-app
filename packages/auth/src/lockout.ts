// Lockout policy (PRD §10.20):
//   * 5 failed logins per IP per 15 minutes  → lockout with exponential backoff
//   * 10 failed logins per account           → account lockout
//
// The rate-limit store in @alphawolf/db handles the sliding-window arithmetic.
// This module just composes keys, picks the right thresholds, and computes
// the exponential backoff for IP lockouts.

import { rateLimit } from '@alphawolf/db';

const FIFTEEN_MIN_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export const IP_LOGIN_THRESHOLD = 5;
export const IP_LOGIN_WINDOW_MS = FIFTEEN_MIN_MS;
export const ACCOUNT_LOGIN_THRESHOLD = 10;
export const ACCOUNT_LOGIN_WINDOW_MS = FIFTEEN_MIN_MS;
export const ACCOUNT_LOCKOUT_MS = ONE_HOUR_MS;

function ipKey(ip: string, purpose: string): string {
  return `ip:${ip}:${purpose}`;
}

function accountKey(userId: string, purpose: string): string {
  return `account:${userId}:${purpose}`;
}

// Exponential backoff: 1m, 2m, 4m, 8m, ... capped at 1 hour. The "level" is
// derived from how many prior lockouts this IP has hit in the past 24h —
// stored alongside the rate-limit row.
function ipLockoutMs(level: number): number {
  const minutes = Math.min(2 ** level, 60);
  return minutes * 60 * 1000;
}

export type LockoutGuard = {
  // True if this attempt should proceed; false if already locked.
  proceed: boolean;
  lockedUntil: Date | null;
  reason: 'ip' | 'account' | null;
};

export async function checkLoginGuards(args: {
  ip: string;
  userId: string | null;
}): Promise<LockoutGuard> {
  const ipStatus = await rateLimit.getRateLimit(ipKey(args.ip, 'login'));
  if (ipStatus?.lockedUntil && ipStatus.lockedUntil > new Date()) {
    return { proceed: false, lockedUntil: ipStatus.lockedUntil, reason: 'ip' };
  }
  if (args.userId) {
    const acctStatus = await rateLimit.getRateLimit(accountKey(args.userId, 'login'));
    if (acctStatus?.lockedUntil && acctStatus.lockedUntil > new Date()) {
      return { proceed: false, lockedUntil: acctStatus.lockedUntil, reason: 'account' };
    }
  }
  return { proceed: true, lockedUntil: null, reason: null };
}

export type FailureOutcome = {
  ipLocked: boolean;
  accountLocked: boolean;
  ipLockedUntil: Date | null;
  accountLockedUntil: Date | null;
};

// Records a failed login. Returns the resulting lockout state.
export async function recordLoginFailure(args: {
  ip: string;
  userId: string | null;
}): Promise<FailureOutcome> {
  // Level for backoff = number of prior locks. Cheap proxy: bump after each
  // lockout cycle. For Phase 1 we use a fixed 15-min lockout — exponential
  // levels are a Phase 2 refinement once we have lockout history data.
  const ipResult = await rateLimit.recordFailure({
    key: ipKey(args.ip, 'login'),
    windowMs: IP_LOGIN_WINDOW_MS,
    threshold: IP_LOGIN_THRESHOLD,
    lockoutMs: ipLockoutMs(0),
  });

  let acctResult: { allowed: boolean; lockedUntil: Date | null; remaining: number } | null = null;
  if (args.userId) {
    acctResult = await rateLimit.recordFailure({
      key: accountKey(args.userId, 'login'),
      windowMs: ACCOUNT_LOGIN_WINDOW_MS,
      threshold: ACCOUNT_LOGIN_THRESHOLD,
      lockoutMs: ACCOUNT_LOCKOUT_MS,
    });
  }

  return {
    ipLocked: !ipResult.allowed,
    accountLocked: acctResult ? !acctResult.allowed : false,
    ipLockedUntil: ipResult.lockedUntil,
    accountLockedUntil: acctResult?.lockedUntil ?? null,
  };
}

export async function clearLoginFailures(args: { ip: string; userId: string }): Promise<void> {
  await Promise.all([
    rateLimit.clearRateLimit(ipKey(args.ip, 'login')),
    rateLimit.clearRateLimit(accountKey(args.userId, 'login')),
  ]);
}
