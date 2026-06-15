// Next.js instrumentation hook — loads the right Sentry config per runtime, and
// forwards nested React Server Component errors to Sentry via onRequestError.
import * as Sentry from '@sentry/nextjs';

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./sentry.server.config');
    // Goal 11 D1 — loud startup alarm if a stray AUTH_EMAIL_TRANSPORT=console is
    // left in real production. The auth package already ignores it and forces
    // live Resend (packages/auth/src/email.ts consoleTransportActive), but
    // capture it here so ops actually SEES the misconfig and clears the env var
    // — a silent `console` once dropped every OTP send.
    if (process.env.VERCEL_ENV === 'production' && process.env.AUTH_EMAIL_TRANSPORT === 'console') {
      const msg =
        '[startup] AUTH_EMAIL_TRANSPORT=console is set in production — live email ' +
        'is being forced on; remove this env var (docs/deployment/env-matrix.md).';
      console.error(msg);
      Sentry.captureMessage(msg, 'error');
    }
    // Goal 11 D1 — guard the OTHER silent-delivery gap: without RESEND_FROM_EMAIL
    // the sender falls back to the onboarding@resend.dev sandbox, which delivers
    // ONLY to the Resend account owner. In real production that means real
    // customers silently never get their OTP. Alarm on the missing var.
    if (process.env.VERCEL_ENV === 'production' && !process.env.RESEND_FROM_EMAIL) {
      const msg =
        '[startup] RESEND_FROM_EMAIL is unset in production — email is falling back ' +
        'to the resend.dev sandbox sender, which only reaches the account owner. ' +
        'Set RESEND_FROM_EMAIL=wraps@1stimpression.co (docs/deployment/env-matrix.md).';
      console.error(msg);
      Sentry.captureMessage(msg, 'error');
    }
  }
  if (process.env.NEXT_RUNTIME === 'edge') {
    await import('./sentry.edge.config');
  }
}

export const onRequestError = Sentry.captureRequestError;
