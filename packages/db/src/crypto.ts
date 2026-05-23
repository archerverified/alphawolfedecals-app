// PII encryption + deterministic-lookup helpers.
//
// Encryption uses pgcrypto's pgp_sym_encrypt via the SQL-side helper functions
// defined in prisma/sql/auth_rls.sql. The key is bound to the txn via the
// app.pii_key session var (set in client.ts), so the key never crosses the
// wire as a query parameter.

import type { TxClient } from './client.js';

// Lowercase + trim before hashing. Email matching is case-insensitive.
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function encryptPii(db: TxClient, plaintext: string): Promise<Buffer> {
  const rows = await db.$queryRaw<Array<{ ciphertext: Buffer }>>`
    SELECT app_encrypt_pii(${plaintext}) AS ciphertext
  `;
  const row = rows[0];
  if (!row) {
    throw new Error('[crypto] encryptPii returned no rows');
  }
  return row.ciphertext;
}

export async function decryptPii(db: TxClient, ciphertext: Buffer): Promise<string> {
  const rows = await db.$queryRaw<Array<{ plaintext: string }>>`
    SELECT app_decrypt_pii(${ciphertext}) AS plaintext
  `;
  const row = rows[0];
  if (!row) {
    throw new Error('[crypto] decryptPii returned no rows');
  }
  return row.plaintext;
}

export async function emailLookupHash(db: TxClient, email: string): Promise<Buffer> {
  const normalized = normalizeEmail(email);
  const rows = await db.$queryRaw<Array<{ h: Buffer }>>`
    SELECT app_email_lookup_hash(${normalized}) AS h
  `;
  const row = rows[0];
  if (!row) {
    throw new Error('[crypto] emailLookupHash returned no rows');
  }
  return row.h;
}
