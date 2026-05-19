// Public surface of @alphawolf/db.
//
// Other workspace packages must import from here, never from @prisma/client
// directly. Enforced by the no-restricted-imports rule in eslint.config.mjs.

export * from './client';
export * from './crypto';
export * as users from './repos/users';
export * as shops from './repos/shops';
export * as otp from './repos/otp';
export * as authEvents from './repos/auth-events';
export * as rateLimit from './repos/rate-limit';

export type { AccountType, AccountStatus, DecryptedUser } from './repos/users';
export type { MembershipRole, ShopSummary } from './repos/shops';
export type { OtpPurpose, OtpRow } from './repos/otp';
export type { AuthEventType } from './repos/auth-events';
export type { RateLimitDecision, RateLimitStatus } from './repos/rate-limit';
