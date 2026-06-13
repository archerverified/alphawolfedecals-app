// Unit tests for the rider-5 admin-elevation guard (Goal 9). isSyntheticTestEmail
// is pure; the setUserAdminByEmail guard rejects a non-test elevation BEFORE it
// ever opens a DB connection, so it's unit-testable. The synthetic/override pass
// paths are exercised against the real DB by the RLS integration tests.

import { describe, expect, test } from 'vitest';

import { isSyntheticTestEmail, setUserAdminByEmail } from '../src/repos/users';

describe('isSyntheticTestEmail', () => {
  test('accepts the synthetic test domains', () => {
    expect(isSyntheticTestEmail('foo-123@e2e.alphawolf.test')).toBe(true);
    expect(isSyntheticTestEmail('alpha-veh-admin@test.alphawolf.example')).toBe(true);
    expect(isSyntheticTestEmail('CASEY@E2E.ALPHAWOLF.TEST')).toBe(true);
  });

  test('rejects real / non-test domains', () => {
    expect(isSyntheticTestEmail('archer@1stimpression.co')).toBe(false);
    expect(isSyntheticTestEmail('attacker@gmail.com')).toBe(false);
    expect(isSyntheticTestEmail('someone@example.com')).toBe(false); // retire-cohort, NOT an admin-test domain
    expect(isSyntheticTestEmail('x@e2e.alphawolf.test.evil.com')).toBe(false);
  });
});

describe('setUserAdminByEmail guard', () => {
  test('refuses to grant admin to a non-test account without operatorOverride', async () => {
    await expect(setUserAdminByEmail('attacker@gmail.com', true)).rejects.toThrow(
      /operator override/i,
    );
  });
});
