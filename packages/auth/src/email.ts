// Resend transactional email sender.
//
// Live sending domain: 1stimpression.co (verified — SPF/DKIM/DMARC green),
// from-address `wraps@1stimpression.co` via RESEND_FROM_EMAIL.
//
// In NODE_ENV !== 'production', the OTP code is also logged to the server
// console + stashed in an in-memory ring so the dev-only "peek OTP" route
// (apps/web/app/api/auth/dev-otp/route.ts) can read it during E2E tests.
//
// AUTH_EMAIL_TRANSPORT=console bypasses Resend for local dev (OTP prints to the
// terminal + ring buffer). It is a local-dev-only knob — see
// docs/deployment/env-matrix.md. A stray `console` left in the PROD env once
// silently disabled every OTP send (rows persisted, no error, no Sentry —
// Goal 11 D1). So `consoleTransportActive()` IGNORES it in real production
// (VERCEL_ENV==='production') and forces live Resend instead.

import { Resend, type CreateEmailOptions } from 'resend';

type SendOtpInput = {
  to: string;
  code: string;
  accountType: 'customer' | 'shop_user';
};

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error('[auth] RESEND_API_KEY is not set');
    resendClient = new Resend(apiKey);
  }
  return resendClient;
}

function getFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
}

// Whether the console (no-send) transport is in effect for THIS send.
//
// `AUTH_EMAIL_TRANSPORT=console` is a local-dev convenience. It must never take
// effect in real production: the var was once left set in the prod env and
// silently dropped every OTP send (Goal 11 D1). In real production
// (VERCEL_ENV==='production', the same signal apps/web/lib/ai/mock.ts uses to
// detect real prod vs preview) we IGNORE the console transport and force live
// Resend — fail-safe to working delivery, never to silent silence — logging the
// misconfig once so ops can clear the env var.
let warnedConsoleTransportInProd = false;
function consoleTransportActive(): boolean {
  if (process.env.AUTH_EMAIL_TRANSPORT !== 'console') return false;
  if (process.env.VERCEL_ENV === 'production') {
    if (!warnedConsoleTransportInProd) {
      warnedConsoleTransportInProd = true;
      console.error(
        '[auth] AUTH_EMAIL_TRANSPORT=console is set in production — IGNORING it and ' +
          'sending live email. Remove this env var (see docs/deployment/env-matrix.md).',
      );
    }
    return false;
  }
  return true;
}

// Resend's SDK returns { data, error } and does NOT throw on API errors.
// Without this check, rejections (e.g. unverified from-domain, test-sender
// recipient limits) vanish silently and callers' failure handling never runs.
// (Root cause of the Goal 5 "36 email_sent, zero in the Resend dashboard" bug.)
// Returns the Resend email id so callers can correlate with the dashboard.
async function sendViaResend(payload: CreateEmailOptions): Promise<string> {
  const result = await getResend().emails.send(payload);
  if (result.error) {
    throw new Error(
      `[auth] Resend rejected the email: ${result.error.name} — ${result.error.message}`,
      { cause: result.error },
    );
  }
  return result.data.id;
}

// Ring buffer of the last 20 OTPs in non-production. Read by the dev-only
// peek route during E2E tests.
//
// Pinned to globalThis because `next dev` can compile the signup Server Action
// and the dev-otp Route Handler into SEPARATE module instances — a plain
// module-level array would then give each its own ring, so the route never sees
// the code the action stashed. globalThis is one-per-process, so both instances
// share the same buffer. (Same reasoning as the well-known Prisma-client
// global-singleton pattern.)
type DevOtpEntry = { to: string; code: string; createdAt: number };
const DEV_OTP_RING_KEY = Symbol.for('alphawolf.dev-otp-ring');
const globalForOtp = globalThis as unknown as { [DEV_OTP_RING_KEY]?: DevOtpEntry[] };
const devOtpRing: DevOtpEntry[] = (globalForOtp[DEV_OTP_RING_KEY] ??= []);
const DEV_OTP_RING_MAX = 20;

export function _stashDevOtp(to: string, code: string): void {
  devOtpRing.push({ to: to.toLowerCase(), code, createdAt: Date.now() });
  if (devOtpRing.length > DEV_OTP_RING_MAX) devOtpRing.shift();
}

export function _getDevOtp(to: string): string | null {
  const needle = to.toLowerCase();
  // Most recent first.
  for (let i = devOtpRing.length - 1; i >= 0; i--) {
    const entry = devOtpRing[i]!;
    if (entry.to === needle) return entry.code;
  }
  return null;
}

function renderOtpHtml(code: string, accountType: 'customer' | 'shop_user'): string {
  const who = accountType === 'shop_user' ? 'your shop account' : 'your account';
  // Minimal markup — single inline style block, no remote assets, no tracking
  // pixels. Keeps the spam score high and avoids Gmail's clipping at 102 KB.
  return `<!doctype html>
<html lang="en">
  <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px; color: #111;">
    <h1 style="font-size: 20px; margin: 0 0 16px;">Verify ${who}</h1>
    <p style="margin: 0 0 24px;">Enter this code to finish signing up for Alpha Wolf Wrap Studio:</p>
    <p style="font-size: 32px; letter-spacing: 8px; font-weight: 600; background: #f4f4f5; padding: 16px 24px; text-align: center; border-radius: 8px; margin: 0 0 24px;">${code}</p>
    <p style="margin: 0 0 8px; font-size: 14px; color: #555;">This code expires in 10 minutes.</p>
    <p style="margin: 0; font-size: 12px; color: #777;">If you didn't request this, ignore this email — no account will be created.</p>
  </body>
</html>`;
}

function renderOtpText(code: string): string {
  return `Your Alpha Wolf Wrap Studio verification code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request this, ignore this email.`;
}

// Generic transactional send, reusing the one Resend client + from-address.
// Used for non-OTP notifications (e.g. GH-017 "your requested template shipped").
// Best-effort callers should wrap this in try/catch; it throws if Resend rejects.
// Resolves to the Resend email id, or null when the console transport skipped the send.
export type EmailAttachment = {
  filename: string;
  /** Raw bytes — passed to Resend as a Buffer. */
  content: Buffer;
};

export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Optional file attachments (Goal 5 / B2C-010 — the spec-pack PDF). */
  attachments?: EmailAttachment[];
  /** Optional Reply-To (e.g. the customer on send-to-shop). */
  replyTo?: string;
}): Promise<string | null> {
  if (process.env.NODE_ENV !== 'production') {
    const att = input.attachments?.length
      ? ` (+${input.attachments.length} attachment${input.attachments.length > 1 ? 's' : ''})`
      : '';
    console.log(`[auth][dev] email to ${input.to}: ${input.subject}${att}`);
  }
  if (consoleTransportActive()) {
    return null;
  }
  return sendViaResend({
    from: getFromAddress(),
    to: input.to,
    subject: input.subject,
    html: input.html,
    text: input.text,
    replyTo: input.replyTo,
    attachments: input.attachments?.map((a) => ({ filename: a.filename, content: a.content })),
  });
}

export async function sendOtpEmail(input: SendOtpInput): Promise<string | null> {
  if (process.env.NODE_ENV !== 'production') {
    _stashDevOtp(input.to, input.code);
    console.log(`[auth][dev] OTP for ${input.to}: ${input.code}`);
  }

  if (consoleTransportActive()) {
    return null;
  }

  return sendViaResend({
    from: getFromAddress(),
    to: input.to,
    subject: 'Your Alpha Wolf verification code',
    html: renderOtpHtml(input.code, input.accountType),
    text: renderOtpText(input.code),
    headers: {
      'X-Entity-Ref-ID': `otp-${Date.now()}`,
    },
  });
}
