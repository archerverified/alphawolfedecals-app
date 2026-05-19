import { describe, expect, it } from 'vitest';
import { generateOtpCode, hashOtp, otpExpiry, OTP_LENGTH, OTP_TTL_MS, verifyOtp } from '../src/otp';

describe('otp', () => {
  describe('generateOtpCode', () => {
    it('returns a 6-digit numeric string', () => {
      for (let i = 0; i < 50; i++) {
        const code = generateOtpCode();
        expect(code).toMatch(/^\d{6}$/);
        expect(code.length).toBe(OTP_LENGTH);
      }
    });

    it('returns varied codes (not constant)', () => {
      const codes = new Set<string>();
      for (let i = 0; i < 30; i++) codes.add(generateOtpCode());
      // Probability of <5 unique values out of 30 draws from 1M codes is negligible.
      expect(codes.size).toBeGreaterThan(5);
    });
  });

  describe('hashOtp + verifyOtp', () => {
    it('round-trips a 6-digit code', async () => {
      const hash = await hashOtp('123456');
      await expect(verifyOtp(hash, '123456')).resolves.toBe(true);
    });

    it('rejects the wrong code', async () => {
      const hash = await hashOtp('123456');
      await expect(verifyOtp(hash, '654321')).resolves.toBe(false);
    });

    it('rejects a code of the wrong length', async () => {
      const hash = await hashOtp('123456');
      await expect(verifyOtp(hash, '12345')).resolves.toBe(false);
      await expect(verifyOtp(hash, '1234567')).resolves.toBe(false);
    });

    it('returns false on empty inputs', async () => {
      await expect(verifyOtp('', '123456')).resolves.toBe(false);
      await expect(verifyOtp('abc', '')).resolves.toBe(false);
    });

    it('returns false on malformed hash without throwing', async () => {
      await expect(verifyOtp('not-a-hash', '123456')).resolves.toBe(false);
    });
  });

  describe('otpExpiry', () => {
    it('is roughly 10 minutes from now', () => {
      const before = Date.now();
      const expiry = otpExpiry();
      const after = Date.now();
      expect(expiry.getTime()).toBeGreaterThanOrEqual(before + OTP_TTL_MS - 5);
      expect(expiry.getTime()).toBeLessThanOrEqual(after + OTP_TTL_MS + 5);
    });
  });
});
