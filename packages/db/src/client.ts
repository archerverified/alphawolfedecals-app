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
//   * withUser(userId, fn)   — for authenticated request paths. Runs on the
//                              non-superuser `app_user` connection
//                              (DATABASE_URL_APP) so RLS policies actually
//                              enforce row visibility.
//   * withSystem(fn)         — for unauthenticated bootstrap paths (signup,
//                              OTP issuance, password reset). Runs on the
//                              privileged system connection (DATABASE_URL),
//                              which bypasses RLS — required because the
//                              bootstrap INSERT/SELECT paths (e.g. creating a
//                              user before they're authenticated) have no
//                              row-owner to scope by, and prisma/sql/auth_rls.sql
//                              deliberately defines no INSERT policy. The
//                              caller is responsible for not leaking other
//                              tenants' data on this connection.
//
// Two physical connections back this:
//   * app_user (DATABASE_URL_APP) — getPrisma(), used by withUser. nobypassrls.
//   * system   (DATABASE_URL)     — getSystemPrisma(), used by withSystem.
// If DATABASE_URL_APP is unset, getPrisma() falls back to DATABASE_URL (the
// superuser) and RLS is silently bypassed even for authenticated paths — so
// the fallback warns loudly (see warnRlsBypassOnce). See ADR-0002.
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

// Singletons — Prisma owns the connection pool and we don't want to recreate
// it per request. We keep two: the app_user connection (RLS-enforced, for
// withUser) and the privileged system connection (RLS-bypassing, for
// withSystem bootstrap paths).
let appPrisma: PrismaClient | null = null;
let systemPrisma: PrismaClient | null = null;

const prismaLog: Prisma.LogLevel[] =
  process.env.PRISMA_DEBUG === '1' ? ['query', 'warn', 'error'] : ['warn', 'error'];

// True when DATABASE_URL_APP is configured (non-empty). When it isn't, the
// app_user connection falls back to the superuser DATABASE_URL and RLS no
// longer enforces on authenticated paths — the exact footgun this module
// exists to prevent.
function isAppRoleConfigured(): boolean {
  const url = process.env.DATABASE_URL_APP;
  return typeof url === 'string' && url.length > 0;
}

// Fires exactly once per process. Triggered from whichever client is built
// first (withSystem on a signup-only flow, or withUser otherwise), so a
// missing DATABASE_URL_APP can't go unnoticed.
let rlsBypassWarned = false;
function warnRlsBypassOnce(): void {
  if (rlsBypassWarned || isAppRoleConfigured()) return;
  rlsBypassWarned = true;
  console.warn('[db] RLS bypass — running as superuser. Set DATABASE_URL_APP before production.');
}

// The connection used for authenticated request paths (withUser). Defaults to
// the non-superuser app_user role via DATABASE_URL_APP; falls back to the
// superuser DATABASE_URL (with a one-time warning) when it isn't set.
export function getPrisma(): PrismaClient {
  if (!appPrisma) {
    warnRlsBypassOnce();
    const datasourceUrl = isAppRoleConfigured()
      ? (process.env.DATABASE_URL_APP as string)
      : readEnv('DATABASE_URL');
    appPrisma = new PrismaClient({ datasourceUrl, log: prismaLog });
  }
  return appPrisma;
}

// The privileged connection used for unauthenticated bootstrap paths
// (withSystem). Always the superuser DATABASE_URL — these paths must bypass
// RLS to create/read rows before a user is authenticated.
export function getSystemPrisma(): PrismaClient {
  if (!systemPrisma) {
    warnRlsBypassOnce();
    systemPrisma = new PrismaClient({ datasourceUrl: readEnv('DATABASE_URL'), log: prismaLog });
  }
  return systemPrisma;
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

// Unauthenticated bootstrap path. Runs on the privileged system connection
// (getSystemPrisma → superuser DATABASE_URL), which BYPASSES RLS entirely — so
// it has FULL visibility, not an empty result set. This is required: bootstrap
// INSERTs (e.g. creating a user at signup) happen before any app.current_user_id
// exists, and auth_rls.sql defines no INSERT policy. app.pii_key is still set so
// pgcrypto works; app.current_user_id is left unset. Callers must enforce their
// own authorisation — there is no RLS safety net on this connection.
export async function withSystem<T>(fn: (db: TxClient) => Promise<T>): Promise<T> {
  return getSystemPrisma().$transaction(async (tx) => {
    await applySessionConfig(tx, null);
    return fn(tx);
  }, TX_OPTIONS);
}

// Test-only helper to drop the singletons between tests.
export async function _resetClientForTests(): Promise<void> {
  await Promise.all([appPrisma?.$disconnect(), systemPrisma?.$disconnect()]);
  appPrisma = null;
  systemPrisma = null;
  rlsBypassWarned = false;
}
