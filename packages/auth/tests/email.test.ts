import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { _getDevOtp, _stashDevOtp, sendOtpEmail } from '../src/email';

beforeEach(() => {
  process.env.NODE_ENV = 'development';
  process.env.AUTH_EMAIL_TRANSPORT = 'console';
});

afterEach(() => {
  delete process.env.AUTH_EMAIL_TRANSPORT;
});

describe('email', () => {
  it('stashes dev OTPs and reads them back (case-insensitive)', () => {
    _stashDevOtp('Casey@Example.COM', '111222');
    expect(_getDevOtp('casey@example.com')).toBe('111222');
    expect(_getDevOtp('CASEY@EXAMPLE.com')).toBe('111222');
  });

  it('returns null for unknown emails', () => {
    expect(_getDevOtp('nobody@example.com')).toBe(null);
  });

  it('returns the most recent code when called twice for the same email', () => {
    _stashDevOtp('repeat@example.com', '000001');
    _stashDevOtp('repeat@example.com', '000002');
    expect(_getDevOtp('repeat@example.com')).toBe('000002');
  });

  it('sendOtpEmail in console transport stashes without calling Resend', async () => {
    await sendOtpEmail({ to: 'sandbox@example.com', code: '555444', accountType: 'customer' });
    expect(_getDevOtp('sandbox@example.com')).toBe('555444');
  });

  it('sendOtpEmail handles shop account type without throwing', async () => {
    await sendOtpEmail({ to: 'shop@example.com', code: '777888', accountType: 'shop_user' });
    expect(_getDevOtp('shop@example.com')).toBe('777888');
  });
});
