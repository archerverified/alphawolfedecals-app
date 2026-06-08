import { describe, expect, it } from 'vitest';
import { firstNameOf, orderNumberFromId } from '../src/index.js';

describe('firstNameOf', () => {
  it('takes only the first token of a full name (PII discipline)', () => {
    expect(firstNameOf('Casey Jordan Smith')).toBe('Casey');
    expect(firstNameOf('Jane')).toBe('Jane');
  });

  it('collapses surrounding + internal whitespace', () => {
    expect(firstNameOf('  Jane   Doe  ')).toBe('Jane');
  });

  it('falls back to a neutral greeting for empty/whitespace names', () => {
    expect(firstNameOf('')).toBe('there');
    expect(firstNameOf('   ')).toBe('there');
  });
});

describe('orderNumberFromId', () => {
  it('derives a short uppercase ref from the first 8 chars of the id', () => {
    expect(orderNumberFromId('3ae260c5-1234-5678-9abc-def012345678')).toBe('3AE260C5');
    expect(orderNumberFromId('order-1')).toBe('ORDER-1');
  });
});
