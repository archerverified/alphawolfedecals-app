// Login flow: validate credentials, enforce per-IP + per-account lockouts,
// log every attempt to auth_events.

import { authEvents, users as userRepo } from '@alphawolf/db';
import { verifyPassword } from './password.js';
import { checkLoginGuards, clearLoginFailures, recordLoginFailure } from './lockout.js';

export type LoginResult =
  | { ok: true; userId: string; accountType: 'customer' | 'shop_user' }
  | {
      ok: false;
      reason:
        | 'invalid_credentials'
        | 'not_verified'
        | 'account_locked'
        | 'ip_locked'
        | 'account_deleted';
      lockedUntil?: Date | null;
    };

export async function login(args: {
  email: string;
  password: string;
  meta?: { ip?: string; userAgent?: string };
}): Promise<LoginResult> {
  const ip = args.meta?.ip ?? '0.0.0.0';
  const userAgent = args.meta?.userAgent ?? null;
  const user = await userRepo.findUserByEmailForAuth(args.email);

  // Pre-check IP-level lockout before doing any password work — saves CPU on
  // a brute-force flood.
  const preGuard = await checkLoginGuards({ ip, userId: user?.id ?? null });
  if (!preGuard.proceed) {
    await authEvents.logAuthEvent({
      userId: user?.id ?? null,
      eventType: preGuard.reason === 'ip' ? 'ip_locked' : 'account_locked',
      ipAddress: ip,
      userAgent,
    });
    return {
      ok: false,
      reason: preGuard.reason === 'ip' ? 'ip_locked' : 'account_locked',
      lockedUntil: preGuard.lockedUntil,
    };
  }

  if (!user) {
    // Still hash a fake password to avoid leaking "email exists" via timing.
    await verifyPassword(
      '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      args.password,
    );
    const outcome = await recordLoginFailure({ ip, userId: null });
    await authEvents.logAuthEvent({
      userId: null,
      eventType: 'login_failed',
      ipAddress: ip,
      userAgent,
      metadata: { reason: 'unknown_email' },
    });
    return {
      ok: false,
      reason: outcome.ipLocked ? 'ip_locked' : 'invalid_credentials',
      lockedUntil: outcome.ipLockedUntil,
    };
  }

  if (user.status === 'deleted') {
    return { ok: false, reason: 'account_deleted' };
  }

  const passwordOk = await verifyPassword(user.passwordHash, args.password);
  if (!passwordOk) {
    const outcome = await recordLoginFailure({ ip, userId: user.id });
    await authEvents.logAuthEvent({
      userId: user.id,
      eventType: 'login_failed',
      ipAddress: ip,
      userAgent,
      metadata: { reason: 'bad_password' },
    });
    if (outcome.accountLocked) {
      return { ok: false, reason: 'account_locked', lockedUntil: outcome.accountLockedUntil };
    }
    if (outcome.ipLocked) {
      return { ok: false, reason: 'ip_locked', lockedUntil: outcome.ipLockedUntil };
    }
    return { ok: false, reason: 'invalid_credentials' };
  }

  if (user.status === 'pending_verification') {
    return { ok: false, reason: 'not_verified' };
  }

  // Success.
  await clearLoginFailures({ ip, userId: user.id });
  await userRepo.resetFailedLogin(user.id);
  await authEvents.logAuthEvent({
    userId: user.id,
    eventType: 'login',
    ipAddress: ip,
    userAgent,
  });
  return { ok: true, userId: user.id, accountType: user.accountType };
}
