// Unit tests for the pure helpers in repos/referrals.ts (Goal 9). No DB — the
// grant idempotency / anti-abuse SQL is proven in referrals-rls.integration.test.ts.

import { describe, expect, test } from 'vitest';

import { normalizeEmailForAbuse, sanitizeReferralCode } from '../src/repos/referrals';

describe('sanitizeReferralCode', () => {
  test('accepts a valid code and uppercases it', () => {
    expect(sanitizeReferralCode('abcd1234ef')).toBe('ABCD1234EF');
    expect(sanitizeReferralCode('  HELLO99  ')).toBe('HELLO99');
  });

  test('rejects junk → null (never blocks signup, never stores garbage)', () => {
    expect(sanitizeReferralCode(undefined)).toBeNull();
    expect(sanitizeReferralCode(null)).toBeNull();
    expect(sanitizeReferralCode(12345)).toBeNull();
    expect(sanitizeReferralCode('')).toBeNull();
    expect(sanitizeReferralCode('short')).toBeNull(); // < 6
    expect(sanitizeReferralCode('A'.repeat(21))).toBeNull(); // > 20
    expect(sanitizeReferralCode('has space')).toBeNull();
    expect(sanitizeReferralCode('bad-char!')).toBeNull();
    expect(sanitizeReferralCode('drop;table')).toBeNull();
  });
});

describe('normalizeEmailForAbuse — defeats second-email self-referral', () => {
  test('strips plus-tags', () => {
    expect(normalizeEmailForAbuse('me+anything@example.com')).toBe('me@example.com');
    expect(normalizeEmailForAbuse('ME+1+2@Example.COM')).toBe('me@example.com');
  });

  test('removes dots and normalizes domain only for gmail/googlemail', () => {
    expect(normalizeEmailForAbuse('m.e.first@gmail.com')).toBe('mefirst@gmail.com');
    expect(normalizeEmailForAbuse('m.e@googlemail.com')).toBe('me@gmail.com');
    expect(normalizeEmailForAbuse('m.e+tag@gmail.com')).toBe('me@gmail.com');
  });

  test('keeps dots for non-gmail providers (dots are significant there)', () => {
    expect(normalizeEmailForAbuse('first.last@example.com')).toBe('first.last@example.com');
  });

  test('lowercases and is stable on malformed input', () => {
    expect(normalizeEmailForAbuse('USER@HOST.COM')).toBe('user@host.com');
    expect(normalizeEmailForAbuse('no-at-sign')).toBe('no-at-sign');
  });

  test('the abuse-equivalent forms of one inbox collapse to the same key', () => {
    const forms = [
      'victim@gmail.com',
      'v.i.c.t.i.m@gmail.com',
      'victim+ref1@gmail.com',
      'VICTIM@googlemail.com',
    ];
    const normalized = new Set(forms.map(normalizeEmailForAbuse));
    expect(normalized.size).toBe(1);
  });
});
