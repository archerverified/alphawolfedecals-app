// User repository. Wraps Prisma writes/reads so PII goes through pgcrypto
// helpers and the rest of the codebase never sees the raw Bytes columns.

import { Prisma } from '@prisma/client';
import { decryptPii, emailLookupHash, encryptPii } from '../crypto.js';
import { withSystem, withUser, type TxClient } from '../client.js';

export type AccountType = 'customer' | 'shop_user';
export type AccountStatus = 'pending_verification' | 'active' | 'locked' | 'deleted';

export type DecryptedUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  accountType: AccountType;
  isAdmin: boolean;
  status: AccountStatus;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
  passwordHash: string;
};

type CreateUserInput = {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  passwordHash: string;
  accountType: AccountType;
  // Referral code captured at signup from a ?ref= link (Goal 9). Already
  // sanitized by the caller; the DB CHECK + set-once trigger are the backstop.
  referredByCode?: string | null;
};

async function rowToUser(db: TxClient, row: UserRow): Promise<DecryptedUser> {
  return {
    id: row.id,
    email: await decryptPii(db, row.emailEncrypted),
    firstName: await decryptPii(db, row.firstNameEncrypted),
    lastName: await decryptPii(db, row.lastNameEncrypted),
    phone: row.phoneEncrypted ? await decryptPii(db, row.phoneEncrypted) : null,
    accountType: row.accountType,
    isAdmin: row.isAdmin,
    status: row.status,
    failedLoginCount: row.failedLoginCount,
    lockedUntil: row.lockedUntil,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
    passwordHash: row.passwordHash,
  };
}

type UserRow = {
  id: string;
  emailEncrypted: Buffer;
  firstNameEncrypted: Buffer;
  lastNameEncrypted: Buffer;
  phoneEncrypted: Buffer | null;
  passwordHash: string;
  accountType: AccountType;
  isAdmin: boolean;
  status: AccountStatus;
  failedLoginCount: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  createdAt: Date;
};

// Signup path — runs as the system role (no app.current_user_id) because the
// user does not exist yet.
export async function createUser(input: CreateUserInput): Promise<DecryptedUser> {
  return withSystem(async (db) => {
    const [emailEnc, firstNameEnc, lastNameEnc, lookupHash] = await Promise.all([
      encryptPii(db, input.email),
      encryptPii(db, input.firstName),
      encryptPii(db, input.lastName),
      emailLookupHash(db, input.email),
    ]);
    const phoneEnc = input.phone ? await encryptPii(db, input.phone) : null;

    const created = (await db.user.create({
      data: {
        emailEncrypted: emailEnc,
        emailLowerHash: lookupHash,
        firstNameEncrypted: firstNameEnc,
        lastNameEncrypted: lastNameEnc,
        phoneEncrypted: phoneEnc,
        passwordHash: input.passwordHash,
        accountType: input.accountType,
        referredByCode: input.referredByCode ?? null,
        status: 'pending_verification',
      },
    })) as unknown as UserRow;

    return rowToUser(db, created);
  });
}

export async function findUserByEmailForAuth(email: string): Promise<DecryptedUser | null> {
  return withSystem(async (db) => {
    const lookupHash = await emailLookupHash(db, email);
    const row = (await db.user.findUnique({
      where: { emailLowerHash: lookupHash },
    })) as UserRow | null;
    if (!row) return null;
    return rowToUser(db, row);
  });
}

export async function findUserById(userId: string): Promise<DecryptedUser | null> {
  return withSystem(async (db) => {
    const row = (await db.user.findUnique({ where: { id: userId } })) as UserRow | null;
    if (!row) return null;
    return rowToUser(db, row);
  });
}

export async function markUserActive(userId: string): Promise<void> {
  await withSystem(async (db) => {
    await db.user.update({
      where: { id: userId },
      data: { status: 'active' },
    });
  });
}

export async function incrementFailedLogin(userId: string): Promise<number> {
  return withSystem(async (db) => {
    const updated = await db.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    return updated.failedLoginCount;
  });
}

export async function resetFailedLogin(userId: string): Promise<void> {
  await withSystem(async (db) => {
    await db.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
  });
}

export async function lockUserUntil(userId: string, until: Date): Promise<void> {
  await withSystem(async (db) => {
    await db.user.update({
      where: { id: userId },
      data: { lockedUntil: until, status: 'locked' },
    });
  });
}

// Self-read path used after sign-in. Goes through RLS — the user can only
// read their own row even if the userId is wrong.
export async function getOwnUser(userId: string): Promise<DecryptedUser | null> {
  return withUser(userId, async (db) => {
    const row = (await db.user.findUnique({ where: { id: userId } })) as UserRow | null;
    if (!row) return null;
    return rowToUser(db, row);
  });
}

// Grant/revoke the internal-admin flag (ADR-0005). Runs on the system role:
// Synthetic test-identity domains (Goal 9 rider 5). E2E uses @e2e.alphawolf.test;
// the RLS integration tests use @test.alphawolf.example. These are the ONLY
// identities the dev admin-promotion paths may elevate without an operator
// override — see setUserAdminByEmail.
const TEST_IDENTITY_DOMAINS = ['@e2e.alphawolf.test', '@test.alphawolf.example'];

export function isSyntheticTestEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return TEST_IDENTITY_DOMAINS.some((d) => e.endsWith(d));
}

// is_admin is staff provisioning, done out-of-band (a CLI script or the
// dev-only promote endpoint), not by the user about themselves, so there is no
// app.current_user_id to scope by. Looks the user up by email hash so operators
// can promote by email without first resolving an id. Returns the updated user,
// or null if no user matches the email.
//
// RIDER-5 GUARD (Goal 9): granting admin to a NON-test account requires a
// deliberate operatorOverride. Root cause of the 8 is_admin=true customer
// accounts that leaked to prod: the dev /api/dev/make-admin endpoint had no
// target restriction, and local/E2E runs hit the LIVE shared DB. Now that
// endpoint is restricted to @e2e.alphawolf.test AND a real-account elevation can
// only happen through the db:make-admin CLI (which passes operatorOverride).
// Synthetic test identities still elevate freely (E2E + the RLS integration
// tests need an admin); revocation is always allowed.
export async function setUserAdminByEmail(
  email: string,
  isAdmin: boolean,
  opts: { operatorOverride?: boolean } = {},
): Promise<DecryptedUser | null> {
  if (isAdmin && !isSyntheticTestEmail(email) && !opts.operatorOverride) {
    throw new Error(
      '[db] refusing to grant admin to a non-test account without an explicit operator override',
    );
  }
  return withSystem(async (db) => {
    const lookupHash = await emailLookupHash(db, email);
    const existing = (await db.user.findUnique({
      where: { emailLowerHash: lookupHash },
      select: { id: true },
    })) as { id: string } | null;
    if (!existing) return null;
    const updated = (await db.user.update({
      where: { id: existing.id },
      data: { isAdmin },
    })) as unknown as UserRow;
    return rowToUser(db, updated);
  });
}

// Surfaced for callers that need to translate Prisma uniqueness violations
// into "email already taken" without coupling to the Prisma error code.
export function isUniqueViolation(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';
}
