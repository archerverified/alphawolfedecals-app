// Audit log of all auth events (PRD §10.20 AC).

import { withSystem } from '../client.js';

export type AuthEventType =
  | 'signup'
  | 'login'
  | 'login_failed'
  | 'logout'
  | 'otp_requested'
  | 'otp_verified'
  | 'otp_failed'
  | 'password_reset_requested'
  | 'password_reset_completed'
  | 'account_locked'
  | 'ip_locked';

type LogAuthEventInput = {
  userId?: string | null;
  eventType: AuthEventType;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAuthEvent(input: LogAuthEventInput): Promise<void> {
  // Failures here are non-fatal for the user-facing flow but indicate a real
  // problem. Surface them via console; observability stack will pick them up.
  try {
    await withSystem(async (db) => {
      await db.authEvent.create({
        data: {
          userId: input.userId ?? null,
          eventType: input.eventType,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
          metadata: (input.metadata ?? null) as never,
        },
      });
    });
  } catch (err) {
    console.error('[auth] failed to log auth event', input.eventType, err);
  }
}
