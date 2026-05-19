// Pure password validation + strength scoring. NO server dependencies.
// Safe to import from client components (React, SignupForm, etc.).
//
// Argon2id hashing/verification live in ./password (server-only). Keeping the
// policy + strength scoring out of that module is what lets the signup form
// render without bundling argon2 + node-gyp-build into the client.

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
