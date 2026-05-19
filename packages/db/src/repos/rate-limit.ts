// Sliding-window rate limit + lockout state stored in Postgres.
//
// Keyed by an opaque bucket string. Two windows compose:
//   * `attempts` increments per failure; resets when `resetAt` is in the past.
//   * `lockedUntil` is set when a lockout threshold is hit; while > now, all
//     attempts are rejected without further increment.
//
// Backed by Postgres rather than Redis so that Phase 1 has correct semantics
// without depending on Upstash being wired (Upstash is in env.example but
// not provisioned yet).

import { withSystem } from '../client';

export type RateLimitStatus = {
  attempts: number;
  resetAt: Date;
  lockedUntil: Date | null;
};

export type RateLimitDecision = {
  allowed: boolean;
  lockedUntil: Date | null;
  remaining: number;
};

type RecordFailureInput = {
  key: string;
  windowMs: number;
  threshold: number;
  lockoutMs: number;
};

export async function getRateLimit(key: string): Promise<RateLimitStatus | null> {
  return withSystem(async (db) => {
    const row = await db.rateLimit.findUnique({ where: { key } });
    if (!row) return null;
    return { attempts: row.attempts, resetAt: row.resetAt, lockedUntil: row.lockedUntil };
  });
}

// Returns the post-increment status. The window resets if the prior window
// expired before this call.
export async function recordFailure(input: RecordFailureInput): Promise<RateLimitDecision> {
  return withSystem(async (db) => {
    const now = new Date();
    const existing = await db.rateLimit.findUnique({ where: { key: input.key } });

    // If already locked out, do not increment further.
    if (existing?.lockedUntil && existing.lockedUntil > now) {
      return {
        allowed: false,
        lockedUntil: existing.lockedUntil,
        remaining: 0,
      };
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

    await db.rateLimit.upsert({
      where: { key: input.key },
      create: {
        key: input.key,
        attempts,
        resetAt,
        lockedUntil,
        lastAttemptAt: now,
      },
      update: {
        attempts,
        resetAt,
        lockedUntil,
        lastAttemptAt: now,
      },
    });

    return {
      allowed: !shouldLock,
      lockedUntil,
      remaining: Math.max(0, input.threshold - attempts),
    };
  });
}

export async function clearRateLimit(key: string): Promise<void> {
  await withSystem(async (db) => {
    await db.rateLimit.deleteMany({ where: { key } });
  });
}
