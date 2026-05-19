// Argon2id password hashing.
//
// Parameters chosen per PRD §10.20 / OWASP password storage cheat sheet:
//   memoryCost = 64 MiB
//   timeCost   = 3
//   parallelism = 4
//
// Argon2 encodes the parameters into the hash string, so future reads will
// verify correctly even if we tune the parameters later.

import argon2 from 'argon2';

const ARGON2_OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 64 * 1024, // KiB → 64 MiB
  timeCost: 3,
  parallelism: 4,
};

export async function hashPassword(plaintext: string): Promise<string> {
  if (!plaintext || typeof plaintext !== 'string') {
    throw new Error('[auth] hashPassword requires a non-empty string');
  }
  return argon2.hash(plaintext, ARGON2_OPTIONS);
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  if (!hash || !plaintext) return false;
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    return false;
  }
}

// Password policy per PRD §10.1: ≥12 chars, ≥1 letter, ≥1 number, ≥1 symbol.
// Returns a list of human-readable failure messages — empty array means valid.
export function validatePasswordPolicy(password: string): string[] {
  const errors: string[] = [];
  if (password.length < 12) errors.push('Must be at least 12 characters');
  if (!/[A-Za-z]/.test(password)) errors.push('Must include at least 1 letter');
  if (!/\d/.test(password)) errors.push('Must include at least 1 number');
  if (!/[^A-Za-z0-9]/.test(password)) errors.push('Must include at least 1 symbol');
  return errors;
}

// 0..4 strength score for the UI strength meter. Cheap heuristic — not a
// substitute for the policy check above.
export function passwordStrength(password: string): 0 | 1 | 2 | 3 | 4 {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 16) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score++;
  return Math.min(score, 4) as 0 | 1 | 2 | 3 | 4;
}
