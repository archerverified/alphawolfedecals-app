'use server';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import {
  CSRF_COOKIE_NAME,
  CSRF_FIELD_NAME,
  resendVerificationOtp,
  signupCustomer,
  signupShop,
  verifyCsrf,
  verifySignupOtp,
} from '@alphawolf/auth/server';
import { captureServerEvent } from '@/lib/notifications/posthog-server';

type ActionState = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  email?: string;
  // Submitted values returned on error so the form can preserve user input
  // across re-renders. Omitted on success (the form is unmounted by redirect).
  // Password is intentionally NEVER echoed back — even on validation errors,
  // the user re-types it.
  values?: Record<string, string>;
};

// Snapshot of submitted form values for error-path preservation. Excludes
// password (security) and _csrf (internal). Trimmed to strings; nulls become
// empty strings so defaultValue works cleanly in the JSX.
function snapshotFormValues(form: FormData, fields: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) {
    const v = form.get(f);
    out[f] = typeof v === 'string' ? v : '';
  }
  return out;
}

const CUSTOMER_FIELDS = ['firstName', 'lastName', 'email'];
const SHOP_FIELDS = [
  'firstName',
  'lastName',
  'email',
  'companyName',
  'phone',
  'website',
  'address',
];

async function requestMeta() {
  const h = await headers();
  const ip = (h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || '0.0.0.0';
  const userAgent = h.get('user-agent') ?? undefined;
  return { ip, userAgent };
}

async function csrfOk(form: FormData): Promise<boolean> {
  const submitted = form.get(CSRF_FIELD_NAME);
  const cookie = (await cookies()).get(CSRF_COOKIE_NAME)?.value ?? null;
  return verifyCsrf(cookie, typeof submitted === 'string' ? submitted : null);
}

function fieldErrorsFromMessages(messages: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of messages) {
    const [path, ...rest] = m.split(':');
    if (path && rest.length) {
      out[path.trim()] = rest.join(':').trim();
    }
  }
  return out;
}

export async function signupCustomerAction(
  _prev: ActionState,
  form: FormData,
): Promise<ActionState> {
  const values = snapshotFormValues(form, CUSTOMER_FIELDS);
  if (!(await csrfOk(form)))
    return {
      ok: false,
      message: 'Invalid request token. Please refresh and try again.',
      values,
    };
  const meta = await requestMeta();
  let result;
  try {
    result = await signupCustomer(
      {
        firstName: form.get('firstName'),
        lastName: form.get('lastName'),
        email: form.get('email'),
        password: form.get('password'),
      },
      meta,
    );
  } catch (err) {
    // Unhandled error from the auth package — most commonly: Resend rejected
    // the OTP send (e.g. sandbox sender refuses non-owner recipients), or
    // the DB connection dropped. We don't want a bare {ok:false} to reach
    // the form (silent failure for the user). Surface a generic message
    // and log details for the server console.
    console.error('[signupCustomerAction] unhandled error', err);
    return {
      ok: false,
      message: 'Something went wrong on our end. Please try again in a moment.',
      values,
    };
  }
  if (result.ok) {
    const email = encodeURIComponent(result.email);
    redirect(`/verify?email=${email}&type=customer`);
  }
  if (result.reason === 'invalid_input') {
    return {
      ok: false,
      message: 'Please fix the highlighted fields.',
      fieldErrors: fieldErrorsFromMessages(result.messages),
      values,
    };
  }
  if (result.reason === 'weak_password') {
    return {
      ok: false,
      message: result.messages.join('. '),
      fieldErrors: { password: result.messages.join('. ') },
      values,
    };
  }
  // email_in_use is surfaced without revealing whether the email actually exists.
  return {
    ok: false,
    message: 'We could not create that account. If you already have one, sign in instead.',
    values,
  };
}

export async function signupShopAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const values = snapshotFormValues(form, SHOP_FIELDS);
  if (!(await csrfOk(form)))
    return {
      ok: false,
      message: 'Invalid request token. Please refresh and try again.',
      values,
    };
  const meta = await requestMeta();
  let result;
  try {
    result = await signupShop(
      {
        firstName: form.get('firstName'),
        lastName: form.get('lastName'),
        email: form.get('email'),
        password: form.get('password'),
        companyName: form.get('companyName'),
        phone: form.get('phone'),
        website: form.get('website') || undefined,
        address: form.get('address') || undefined,
      },
      meta,
    );
  } catch (err) {
    // See signupCustomerAction's catch for rationale.
    console.error('[signupShopAction] unhandled error', err);
    return {
      ok: false,
      message: 'Something went wrong on our end. Please try again in a moment.',
      values,
    };
  }
  if (result.ok) {
    const email = encodeURIComponent(result.email);
    redirect(`/verify?email=${email}&type=shop`);
  }
  if (result.reason === 'invalid_input') {
    return {
      ok: false,
      message: 'Please fix the highlighted fields.',
      fieldErrors: fieldErrorsFromMessages(result.messages),
      values,
    };
  }
  if (result.reason === 'weak_password') {
    return {
      ok: false,
      message: result.messages.join('. '),
      fieldErrors: { password: result.messages.join('. ') },
      values,
    };
  }
  return {
    ok: false,
    message: 'We could not create that account. If you already have one, sign in instead.',
    values,
  };
}

export async function verifyOtpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await csrfOk(form)))
    return { ok: false, message: 'Invalid request token. Please refresh and try again.' };
  const email = String(form.get('email') ?? '').trim();
  const code = String(form.get('code') ?? '').trim();
  const meta = await requestMeta();

  if (!email || !code) {
    return { ok: false, message: 'Email and code are required.', email };
  }

  const result = await verifySignupOtp({ email, code, meta });
  if (result.ok) {
    // B2C-001 funnel event. Server-side capture (the user has no client PostHog
    // session yet at verify time); best-effort, never blocks the redirect.
    if (result.creditsGranted > 0) {
      await captureServerEvent('credits_granted', result.userId, {
        amount: result.creditsGranted,
        source: 'grant',
        reason: 'signup',
      });
    }
    const dest = result.accountType === 'shop_user' ? '/welcome/shop' : '/welcome';
    redirect(dest);
  }
  const messages: Record<string, string> = {
    invalid:
      result.remaining !== undefined
        ? `Incorrect code. ${result.remaining} attempts remaining.`
        : 'Incorrect code.',
    expired: 'That code expired. Tap "Resend" to get a fresh one.',
    too_many_attempts: 'Too many attempts. Tap "Resend" to start over.',
    not_found: 'No pending verification found for that email.',
  };
  return { ok: false, message: messages[result.reason] ?? 'Could not verify code.', email };
}

export async function resendOtpAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  if (!(await csrfOk(form)))
    return { ok: false, message: 'Invalid request token. Please refresh and try again.' };
  const email = String(form.get('email') ?? '').trim();
  const meta = await requestMeta();
  const result = await resendVerificationOtp(email, meta);
  if (result.ok) return { ok: true, message: 'New code sent. Check your email.', email };

  const messages: Record<string, string> = {
    too_soon: `Hold on — wait ${Math.ceil((result.retryAfterMs ?? 30_000) / 1000)} seconds before requesting another code.`,
    hourly_limit: 'You have requested too many codes recently. Try again in an hour.',
    not_found: 'No pending verification for that email.',
    already_verified: 'That account is already verified. Try signing in.',
  };
  return { ok: false, message: messages[result.reason] ?? 'Could not resend.', email };
}
