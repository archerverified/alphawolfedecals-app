'use server';

// Credentials sign-in via Auth.js. The auth PR shipped signup + verify but no
// sign-in surface; the vehicle-template work needs authenticated sessions (admin
// gating, request ownership), so this is the minimal bridge. Auth.js owns CSRF
// for the credentials POST, so this action has no bespoke CSRF.

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
    // A failed credentials check throws AuthError; the success path throws
    // NEXT_REDIRECT, which must propagate.
    if (err instanceof AuthError) {
      return { ok: false, message: 'Incorrect email or password.', values: { email } };
    }
    throw err;
  }
  return { ok: true };
}
