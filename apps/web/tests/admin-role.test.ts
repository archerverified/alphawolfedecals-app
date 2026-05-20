// Unit test for the pure admin role-check helper (ADR-0005).
import { describe, expect, test } from 'vitest';
import { isAdminUser } from '../lib/admin/role';

describe('isAdminUser', () => {
  test('true only for an active admin', () => {
    expect(isAdminUser({ isAdmin: true, status: 'active' })).toBe(true);
  });

  test('false when the flag is off', () => {
    expect(isAdminUser({ isAdmin: false, status: 'active' })).toBe(false);
  });

  test('false when admin flag set but account is not active', () => {
    expect(isAdminUser({ isAdmin: true, status: 'locked' })).toBe(false);
    expect(isAdminUser({ isAdmin: true, status: 'pending_verification' })).toBe(false);
    expect(isAdminUser({ isAdmin: true, status: 'deleted' })).toBe(false);
  });

  test('false for null/undefined', () => {
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser(undefined)).toBe(false);
  });
});
