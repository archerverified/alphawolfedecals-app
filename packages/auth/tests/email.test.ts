import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the Resend SDK so the {data, error} contract tests below can drive both
// outcomes. The class is replaced wholesale; tests that use the console
// transport never reach it.
const { resendSendMock } = vi.hoisted(() => ({ resendSendMock: vi.fn() }));
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: resendSendMock };
  },
}));

import { _getDevOtp, _stashDevOtp, sendEmail, sendOtpEmail } from '../src/email';

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

// Resend's SDK resolves {data, error} instead of throwing — the bug PR #134
// fixes is exactly this rejection being discarded. These tests pin the
// sendViaResend contract: error → throw (with cause), success → email id.
describe('Resend {data, error} contract', () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = 're_test_key';
    delete process.env.AUTH_EMAIL_TRANSPORT;
    resendSendMock.mockReset();
  });

  afterEach(() => {
    delete process.env.RESEND_API_KEY;
  });

  it('throws when Resend resolves { data: null, error }', async () => {
    const error = {
      name: 'validation_error',
      message: 'You can only send testing emails to your own email address (owner@example.com).',
    };
    resendSendMock.mockResolvedValue({ data: null, error });

    const attempt = sendOtpEmail({
      to: 'customer@example.com',
      code: '123456',
      accountType: 'customer',
    });
    await expect(attempt).rejects.toThrow(/Resend rejected the email: validation_error/);
  });

  it('attaches the Resend error object as the thrown error cause', async () => {
    const error = { name: 'application_error', message: 'something broke' };
    resendSendMock.mockResolvedValue({ data: null, error });

    const thrown = await sendEmail({
      to: 'customer@example.com',
      subject: 'subject',
      html: '<p>hi</p>',
      text: 'hi',
    }).catch((e: unknown) => e);

    expect(thrown).toBeInstanceOf(Error);
    expect((thrown as Error).cause).toBe(error);
  });

  it('resolves to the Resend email id on success', async () => {
    resendSendMock.mockResolvedValue({ data: { id: 'email_abc123' }, error: null });

    await expect(
      sendEmail({ to: 'customer@example.com', subject: 's', html: '<p>x</p>', text: 'x' }),
    ).resolves.toBe('email_abc123');
  });

  it('resolves null (and never calls Resend) on the console transport', async () => {
    process.env.AUTH_EMAIL_TRANSPORT = 'console';

    await expect(
      sendEmail({ to: 'customer@example.com', subject: 's', html: '<p>x</p>', text: 'x' }),
    ).resolves.toBeNull();
    expect(resendSendMock).not.toHaveBeenCalled();
  });
});
