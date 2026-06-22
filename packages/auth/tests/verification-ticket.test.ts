import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  issueVerificationTicket,
  verifyVerificationTicket,
  VERIFICATION_TICKET_TTL_MS,
} from '../src/verification-ticket';

// The verification ticket proves a user JUST passed OTP verification, so the
// server can establish their session without a password. It is HMAC-signed with
// AUTH_SECRET, short-lived, and only ever travels server-side (verifyOtpAction
// -> signIn). These tests pin its security properties.

beforeEach(() => {
  process.env.AUTH_SECRET = 'test-secret-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('verification ticket', () => {
  it('round-trips a valid ticket back to its userId and lowercased email', () => {
    const ticket = issueVerificationTicket('user-1', 'Casey@Example.com');
    expect(verifyVerificationTicket(ticket)).toEqual({
      userId: 'user-1',
      email: 'casey@example.com',
    });
  });

  it('survives emails containing dots (delimiter safety)', () => {
    const ticket = issueVerificationTicket('u-2', 'first.last@sub.example.co.uk');
    expect(verifyVerificationTicket(ticket)).toEqual({
      userId: 'u-2',
      email: 'first.last@sub.example.co.uk',
    });
  });

  it('rejects a tampered signature', () => {
    const ticket = issueVerificationTicket('user-1', 'casey@example.com');
    const tampered = ticket.slice(0, -2) + (ticket.endsWith('aa') ? 'bb' : 'aa');
    expect(verifyVerificationTicket(tampered)).toBeNull();
  });

  it('rejects a ticket signed with a different secret (no forgery)', () => {
    const ticket = issueVerificationTicket('user-1', 'casey@example.com');
    process.env.AUTH_SECRET = 'a-completely-different-secret-bbbbbbbbbbbb';
    expect(verifyVerificationTicket(ticket)).toBeNull();
  });

  it('rejects an expired ticket', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T00:00:00Z'));
    const ticket = issueVerificationTicket('user-1', 'casey@example.com');
    vi.advanceTimersByTime(VERIFICATION_TICKET_TTL_MS + 1000);
    expect(verifyVerificationTicket(ticket)).toBeNull();
  });

  it('accepts a ticket that is still inside its TTL window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-22T00:00:00Z'));
    const ticket = issueVerificationTicket('user-1', 'casey@example.com');
    vi.advanceTimersByTime(VERIFICATION_TICKET_TTL_MS - 1000);
    expect(verifyVerificationTicket(ticket)?.userId).toBe('user-1');
  });

  it('rejects malformed and empty input', () => {
    expect(verifyVerificationTicket('')).toBeNull();
    expect(verifyVerificationTicket(null)).toBeNull();
    expect(verifyVerificationTicket(undefined)).toBeNull();
    expect(verifyVerificationTicket('not-a-ticket')).toBeNull();
    expect(verifyVerificationTicket('only-one-part')).toBeNull();
    expect(verifyVerificationTicket('bad.payload')).toBeNull();
  });
});
