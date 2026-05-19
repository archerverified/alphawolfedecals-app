import { describe, expect, it } from 'vitest';
import { generateCsrfToken, verifyCsrf } from '../src/csrf';

describe('csrf', () => {
  it('generates a non-empty token', () => {
    const t = generateCsrfToken();
    expect(t.length).toBeGreaterThan(20);
  });

  it('generates distinct tokens', () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    expect(a).not.toBe(b);
  });

  it('verifies matching tokens', () => {
    const t = generateCsrfToken();
    expect(verifyCsrf(t, t)).toBe(true);
  });

  it('rejects mismatched tokens', () => {
    expect(verifyCsrf(generateCsrfToken(), generateCsrfToken())).toBe(false);
  });

  it('rejects missing values', () => {
    expect(verifyCsrf(null, 'x')).toBe(false);
    expect(verifyCsrf('x', null)).toBe(false);
    expect(verifyCsrf('x', undefined)).toBe(false);
    expect(verifyCsrf('', 'x')).toBe(false);
  });

  it('rejects tokens of differing length', () => {
    expect(verifyCsrf('short', 'a-much-longer-token-value')).toBe(false);
  });
});
