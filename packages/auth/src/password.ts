// Argon2id password hashing. SERVER ONLY.
//
// Uses @node-rs/argon2 (Rust + N-API) rather than the JS-native argon2
// package. Rationale: N-API provides a stable ABI across Node versions
// (16, 18, 20, 22, 24, ...) so we don't get bitten by "no prebuilt
// binary for this Node version" errors every time a new Node ships.
// The previous argon2@0.41.1 had no prebuild for Node 24 ABI 137 which
// blocked the entire signup flow.
//
// Pure password policy / strength helpers live in ./password-policy and
// ARE safe to import from the client.
//
// Parameters chosen per PRD §10.20 / OWASP password storage cheat sheet:
//   memoryCost = 64 MiB
//   timeCost   = 3
//   parallelism = 4
//
// Argon2 encodes the parameters into the hash string, so future reads
// will verify correctly even if we tune the parameters later.

import { hash as argonHash, verify as argonVerify } from '@node-rs/argon2';

// Re-exported for backwards compatibility within this package. New code should
// import these directly from ./password-policy.
export { validatePasswordPolicy, passwordStrength } from './password-policy.js';

// Argon2id is @node-rs/argon2's default algorithm — we don't pass `algorithm`
// explicitly because Algorithm is a `const enum` that TypeScript refuses to
// access under `isolatedModules: true` (TS2748). Omitting it lets the runtime
// use its default, which is what we want anyway.
const ARGON2_OPTIONS = {
  memoryCost: 64 * 1024, // KiB → 64 MiB
  timeCost: 3,
  parallelism: 4,
} as const;

export async function hashPassword(plaintext: string): Promise<string> {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('[auth] hashPassword requires a non-empty string');
  }
  return argonHash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  if (!hash || !plaintext) return false;
  try {
    return await argonVerify(hash, plaintext);
  } catch {
    return false;
  }
}
