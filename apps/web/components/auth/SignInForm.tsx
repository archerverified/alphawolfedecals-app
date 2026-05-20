'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { signInAction } from '../../lib/actions/signin';

type State = { ok: boolean; message?: string; values?: { email?: string } };
const initial: State = { ok: false };

export function SignInForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState<State, FormData>(signInAction, initial);
  const v = state.values ?? {};

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />

      <div className="flex flex-col gap-1">
        <label htmlFor="signin-email" className="text-sm font-medium text-zinc-800">
          Email
        </label>
        <input
          id="signin-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          defaultValue={v.email ?? ''}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="signin-password" className="text-sm font-medium text-zinc-800">
          Password
        </label>
        <input
          id="signin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      {state.message ? (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Signing in…' : 'Sign in'}
      </button>

      <p className="text-center text-sm text-zinc-600">
        No account?{' '}
        <Link
          href="/signup"
          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
        >
          Create one
        </Link>
      </p>
    </form>
  );
}
