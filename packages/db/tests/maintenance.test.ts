// Unit tests for the test-data maintenance cohort predicates (Goal 9.1 D1). The
// suffix allowlists ARE the safety guarantee, so they get explicit coverage: a
// real domain must never match either cohort, and the smoke seed domain must be
// purge-only (its projects go, its account stays).

import { describe, expect, test } from 'vitest';

import {
  RETIRE_SUFFIXES,
  PURGE_PROJECT_SUFFIXES,
  BARE_SMOKE_SUFFIX,
  NEVER_RETIRE_SUFFIXES,
  isRetireCohortEmail,
  isPurgeCohortEmail,
  classifyBareSmokeStragglers,
  redact,
  type TestUser,
} from '../src/repos/maintenance';

function mkUser(over: Partial<TestUser> & { id: string; email: string }): TestUser {
  return {
    accountType: 'customer',
    isAdmin: false,
    createdAt: new Date('2026-06-10T00:00:00Z'),
    ...over,
  };
}

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

  test('the daily-cron invariant holds: @alphawolf.test stays OUT of RETIRE_SUFFIXES', () => {
    // The bare smoke domain is retired only via the explicit, keep-list-guarded
    // CLI path — never the daily cron (which must not delete the live smoke login).
    expect(BARE_SMOKE_SUFFIX).toBe('@alphawolf.test');
    expect(RETIRE_SUFFIXES as readonly string[]).not.toContain(BARE_SMOKE_SUFFIX);
    expect(NEVER_RETIRE_SUFFIXES).toContain('@alphawolfdecals.com');
    expect(NEVER_RETIRE_SUFFIXES).toContain('@1stimpression.co');
  });
});

describe('classifyBareSmokeStragglers (Goal 10 D0 — manual --include-bare-smoke path)', () => {
  const users: TestUser[] = [
    mkUser({ id: 'keep-cust', email: 'smoke-customer-aaaa@alphawolf.test' }),
    mkUser({ id: 'keep-shop', email: 'smoke-shop-aaaa@alphawolf.test', accountType: 'shop_user' }),
    mkUser({ id: 'stale-1', email: 'smoke-customer-bbbb@alphawolf.test' }),
    mkUser({ id: 'stale-2', email: 'smoke-shop-bbbb@alphawolf.test', accountType: 'shop_user' }),
    mkUser({ id: 'e2e-1', email: 'mvp-customer-1@e2e.alphawolf.test' }),
    mkUser({ id: 'operator', email: 'studio@alphawolfdecals.com' }),
    mkUser({ id: 'real', email: 'someone@gmail.com' }),
  ];

  test('returns only @alphawolf.test accounts not in the keep-list', () => {
    const keep = new Set(['keep-cust', 'keep-shop']);
    const ids = classifyBareSmokeStragglers(users, keep)
      .map((u) => u.id)
      .sort();
    expect(ids).toEqual(['stale-1', 'stale-2']);
  });

  test('never returns the keeper, the operator, an e2e account, or a real domain', () => {
    const keep = new Set(['keep-cust', 'keep-shop']);
    const ids = classifyBareSmokeStragglers(users, keep).map((u) => u.id);
    expect(ids).not.toContain('keep-cust');
    expect(ids).not.toContain('keep-shop');
    expect(ids).not.toContain('operator'); // @alphawolfdecals.com
    expect(ids).not.toContain('e2e-1'); // handled by partitionRetireCohort, not here
    expect(ids).not.toContain('real');
  });

  test('with an empty keep-list, every @alphawolf.test account is a straggler', () => {
    const ids = classifyBareSmokeStragglers(users, new Set())
      .map((u) => u.id)
      .sort();
    expect(ids).toEqual(['keep-cust', 'keep-shop', 'stale-1', 'stale-2']);
  });
});

describe('redact', () => {
  test('keeps only the first two local chars + the domain', () => {
    expect(redact('smoke-customer-1a2b@alphawolf.test')).toBe('sm***@alphawolf.test');
    expect(redact('a@example.com')).toBe('a***@example.com');
    expect(redact('not-an-email')).toBe('***');
  });
});
