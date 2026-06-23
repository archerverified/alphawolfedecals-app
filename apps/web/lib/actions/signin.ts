'use server';

// Credentials sign-in via Auth.js. The auth PR shipped signup + verify but no
// sign-in surface; the vehicle-template work needs authenticated sessions (admin
// gating, request ownership), so this is the minimal bridge. Auth.js owns CSRF
// for the credentials POST, so this action has no bespoke CSRF.

import { unstable_rethrow } from 'next/navigation';
import * as Sentry from '@sentry/nextjs';
import { AuthError, signIn, signOut } from '@alphawolf/auth/server';

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: '/' });
}

type SignInState = { ok: boolean; message?: string; values?: { email?: string } };

// Only allow same-origin relative redirects; ignore anything else.
function safeNext(next: string): string {
  return next.startsWith('/') && !next.startsWith('//') ? next : '/vehicles/select';
}

export async function signInAction(_prev: SignInState, form: FormData): Promise<SignInState> {
  const email = String(form.get('email') ?? '').trim();
  const password = String(form.get('password') ?? '');
  const next = safeNext(String(form.get('next') ?? ''));
  if (!email || !password) {
    return { ok: false, message: 'Email and password are required.', values: { email } };
  }
  try {
    await signIn('credentials', { email, password, redirectTo: next });
  } catch (err) {
    // A failed credentials check throws AuthError.
    if (err instanceof AuthError) {
      return { ok: false, message: 'Incorrect email or password.', values: { email } };
    }
    // The success path throws NEXT_REDIRECT; unstable_rethrow re-throws Next's
    // control-flow errors (redirect/notFound) so they propagate, and returns for
    // anything else.
    unstable_rethrow(err);
    // Any OTHER server-side error (DB hiccup, next-auth internal) would otherwise
    // bubble as a 500 that the React Server Action client renders as "An
    // unexpected response was received from the server" (Sentry NODE-G). Convert
    // it to a friendly action state instead of an unhandled crash. Goal 20 D1.
    Sentry.captureException(err, { tags: { feature: 'signin' } });
    return {
      ok: false,
      message: 'Something went wrong. Please try again in a moment.',
      values: { email },
    };
  }
  return { ok: true };
}
