import { describe, expect, it } from 'vitest';
import {
  hashPassword,
  passwordStrength,
  validatePasswordPolicy,
  verifyPassword,
} from '../src/password';

describe('password', () => {
  describe('hashPassword + verifyPassword', () => {
    it('round-trips a password', async () => {
      const hash = await hashPassword('correcthorsebatterystaple1!');
      expect(hash).toMatch(/^\$argon2id\$/);
      await expect(verifyPassword(hash, 'correcthorsebatterystaple1!')).resolves.toBe(true);
    });

    it('rejects a wrong password', async () => {
      const hash = await hashPassword('correcthorsebatterystaple1!');
      await expect(verifyPassword(hash, 'wrong')).resolves.toBe(false);
    });

    it('uses argon2id params m=64MiB, t=3, p=4', async () => {
      const hash = await hashPassword('correcthorsebatterystaple1!');
      // Hash format: $argon2id$v=19$m=<KiB>,t=<n>,p=<n>$...
      expect(hash).toMatch(/^\$argon2id\$v=19\$m=65536,t=3,p=4\$/);
    });

    it('produces a different hash each call (salting)', async () => {
      const h1 = await hashPassword('correcthorsebatterystaple1!');
      const h2 = await hashPassword('correcthorsebatterystaple1!');
      expect(h1).not.toBe(h2);
    });

    it('refuses empty plaintext', async () => {
      await expect(hashPassword('')).rejects.toThrow();
    });

    it('returns false for empty inputs to verifyPassword', async () => {
      await expect(verifyPassword('', 'x')).resolves.toBe(false);
      await expect(verifyPassword('x', '')).resolves.toBe(false);
    });

    it('returns false for a malformed hash', async () => {
      await expect(verifyPassword('not-a-hash', 'whatever')).resolves.toBe(false);
    });
  });

  describe('validatePasswordPolicy', () => {
    it('accepts a compliant password', () => {
      expect(validatePasswordPolicy('Aa1!aaaaaaaa')).toEqual([]);
    });

    it.each([
      ['short', 'Aa1!aaa', /at least 12/],
      ['no letter', '111111111111!', /letter/],
      ['no number', 'Aaaaaaaaaaaa!', /number/],
      ['no symbol', 'Aaaaaaaaaaa1', /symbol/],
    ])('rejects %s', (_label, pw, pattern) => {
      const errs = validatePasswordPolicy(pw);
      expect(errs.length).toBeGreaterThan(0);
      expect(errs.join(' ')).toMatch(pattern);
    });
  });

  describe('passwordStrength', () => {
    it('returns 0..4 buckets', () => {
      expect(passwordStrength('')).toBe(0);
      expect(passwordStrength('aaaaaaaaaaaa')).toBe(1);
      expect(passwordStrength('Aaaaaaaaaaaa')).toBe(2);
      expect(passwordStrength('Aaaaaaaaaaa1!')).toBeGreaterThanOrEqual(3);
      expect(passwordStrength('Aaaaaaaaaaaaaaaa1!')).toBe(4);
    });
  });
});
