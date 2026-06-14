// Unit tests for the test-data maintenance cohort predicates (Goal 9.1 D1). The
// suffix allowlists ARE the safety guarantee, so they get explicit coverage: a
// real domain must never match either cohort, and the smoke seed domain must be
// purge-only (its projects go, its account stays).

import { describe, expect, test } from 'vitest';

import {
  RETIRE_SUFFIXES,
  PURGE_PROJECT_SUFFIXES,
  isRetireCohortEmail,
  isPurgeCohortEmail,
  redact,
} from '../src/repos/maintenance';

describe('isRetireCohortEmail (whole-account retirement)', () => {
  test('matches the synthetic / RFC-reserved account domains', () => {
    expect(isRetireCohortEmail('mvp-customer-abc@e2e.alphawolf.test')).toBe(true);
    expect(isRetireCohortEmail('rls-admin@test.alphawolf.example')).toBe(true);
    expect(isRetireCohortEmail('someone@example.com')).toBe(true);
    expect(isRetireCohortEmail('quotes@example-shop.test')).toBe(true);
    expect(isRetireCohortEmail('CASEY@E2E.ALPHAWOLF.TEST')).toBe(true); // case-insensitive
  });

  test('never matches a real customer / operator domain', () => {
    expect(isRetireCohortEmail('archer@1stimpression.co')).toBe(false);
    expect(isRetireCohortEmail('customer@gmail.com')).toBe(false);
    expect(isRetireCohortEmail('x@e2e.alphawolf.test.evil.com')).toBe(false); // suffix spoof
  });

  test('does NOT retire the persistent smoke login domain', () => {
    // @alphawolf.test is the seeded prod-smoke account — its ACCOUNT must survive.
    expect(isRetireCohortEmail('smoke-customer-1a2b@alphawolf.test')).toBe(false);
  });
});

describe('isPurgeCohortEmail (project purge — account may persist)', () => {
  test('includes everything the retire cohort does, plus the smoke login', () => {
    for (const suffix of RETIRE_SUFFIXES) {
      expect(isPurgeCohortEmail(`anything${suffix}`)).toBe(true);
    }
    expect(isPurgeCohortEmail('smoke-customer-1a2b@alphawolf.test')).toBe(true);
    expect(isPurgeCohortEmail('smoke-shop-1a2b@alphawolf.test')).toBe(true);
  });

  test('never matches a real customer / operator domain', () => {
    expect(isPurgeCohortEmail('archer@1stimpression.co')).toBe(false);
    expect(isPurgeCohortEmail('customer@gmail.com')).toBe(false);
    expect(isPurgeCohortEmail('x@alphawolf.test.evil.com')).toBe(false); // suffix spoof
  });
});

describe('cohort invariants', () => {
  test('the smoke login is purge-cohort but NOT retire-cohort', () => {
    const smoke = 'smoke-customer-1a2b@alphawolf.test';
    expect(isPurgeCohortEmail(smoke)).toBe(true);
    expect(isRetireCohortEmail(smoke)).toBe(false);
  });

  test('PURGE_PROJECT_SUFFIXES is a strict superset of RETIRE_SUFFIXES', () => {
    for (const s of RETIRE_SUFFIXES) expect(PURGE_PROJECT_SUFFIXES).toContain(s);
    expect(PURGE_PROJECT_SUFFIXES).toContain('@alphawolf.test');
    expect(RETIRE_SUFFIXES).not.toContain('@alphawolf.test');
  });
});

describe('redact', () => {
  test('keeps only the first two local chars + the domain', () => {
    expect(redact('smoke-customer-1a2b@alphawolf.test')).toBe('sm***@alphawolf.test');
    expect(redact('a@example.com')).toBe('a***@example.com');
    expect(redact('not-an-email')).toBe('***');
  });
});
