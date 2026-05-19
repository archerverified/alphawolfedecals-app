// Request-scoped Prisma client + RLS session helpers.
//
// ADR-0002 locks the app.current_user_id session-variable pattern: every
// request runs inside a Postgres transaction that sets the session var,
// and RLS policies read it to scope row visibility.
//
// The Prisma `$extends` shape doesn't naturally express "wrap every query
// in a txn" without infinite recursion, so this module exposes two helpers
// instead:
//
//   * withUser(userId, fn)   — for authenticated request paths.
//   * withSystem(fn)         — for unauthenticated bootstrap paths (signup,
//                              OTP issuance, password reset). Does not set
//                              app.current_user_id, so RLS fails closed on
//                              user-scoped tables. The caller is responsible
//                              for not leaking other tenants' data.
//
// Both helpers also set `app.pii_key` so the pgcrypto helper functions
// (app_encrypt_pii / app_decrypt_pii) defined in prisma/sql/auth_rls.sql
// can encrypt/decrypt PII without the key crossing the wire as a query
// parameter.

import { PrismaClient } from '@prisma/client';
import type { Prisma } from '@prisma/client';

export type TxClient = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`[db] missing required env var: ${name}`);
  }
  return value;
}

// Singleton — Prisma owns the connection pool and we don't want to recreate it per request.
let basePrisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!basePrisma) {
    basePrisma = new PrismaClient({
      log: process.env.PRISMA_DEBUG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }
  return basePrisma;
}

// Postgres string-literal escaping. Doubles any single quotes (the standard
// way to embed a single quote inside a SQL string) and switches to E'' syntax
// if backslashes are present (so they're treated as escape sequences instead
// of the default Postgres standard_conforming_strings off-mode confusion).
//
// Inputs to applySessionConfig are server-controlled (env var or authenticated
// session userId — never raw user input), so this is defence-in-depth rather
// than the primary injection guard. Use this helper only for values you
// already trust by provenance.
function pgQuoteLiteral(value: string): string {
  const hasBackslash = value.includes('\\');
  const escaped = value.replace(/'/g, "''").replace(/\\/g, '\\\\');
  return hasBackslash ? `E'${escaped}'` : `'${escaped}'`;
}

async function applySessionConfig(tx: TxClient, userId: string | null): Promise<void> {
  const piiKey = readEnv('PII_ENCRYPTION_KEY');
  // We use $executeRawUnsafe with manually-escaped literals (NOT tagged
  // template strings with parameter binding) because:
  //
  //   * Prisma's `$executeRaw` tagged-template form always creates a prepared
  //     statement named s0, s1, etc.
  //   * The Supabase transaction pooler (pgBouncer in transaction mode, port
  //     6543) releases connections back to the pool after each transaction,
  //     so prepared statements from one request collide with the next:
  //         "ERROR: prepared statement \"s0\" already exists"
  //   * Prisma's `?pgbouncer=true` connection-string flag is documented to
  //     disable prepared statements, but it doesn't reach $executeRaw in
  //     Prisma 5.x (open upstream bug).
  //
  // set_config(name, value, is_local=true) scopes the value to the current
  // transaction so it cannot leak across pool reuse.
  await tx.$executeRawUnsafe(`SELECT set_config('app.pii_key', ${pgQuoteLiteral(piiKey)}, true)`);
  await tx.$executeRawUnsafe(
    `SELECT set_config('app.current_user_id', ${pgQuoteLiteral(userId ?? '')}, true)`,
  );
}

const TX_OPTIONS: {
  maxWait: number;
  timeout: number;
  isolationLevel?: Prisma.TransactionIsolationLevel;
} = {
  maxWait: 5_000,
  timeout: 15_000,
};

// Authenticated request path. Wraps `fn` in a Postgres transaction with
// app.current_user_id and app.pii_key set. RLS policies enforce row visibility.
export async function withUser<T>(userId: string, fn: (db: TxClient) => Promise<T>): Promise<T> {
  if (!userId) {
    throw new Error('[db] withUser requires a userId — use withSystem() for bootstrap paths');
  }
  return getPrisma().$transaction(async (tx) => {
    await applySessionConfig(tx, userId);
    return fn(tx);
  }, TX_OPTIONS);
}

// Unauthenticated bootstrap path. Bypasses user-scoped RLS by not setting
// app.current_user_id (policies fail closed → empty result set). Callers
// must enforce their own authorisation.
export async function withSystem<T>(fn: (db: TxClient) => Promise<T>): Promise<T> {
  return getPrisma().$transaction(async (tx) => {
    await applySessionConfig(tx, null);
    return fn(tx);
  }, TX_OPTIONS);
}

// Test-only helper to drop the singleton between tests.
export async function _resetClientForTests(): Promise<void> {
  if (basePrisma) {
    await basePrisma.$disconnect();
    basePrisma = null;
  }
}
