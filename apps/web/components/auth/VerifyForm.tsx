'use client';

import { useActionState, useState } from 'react';
import { CSRF_FIELD_NAME, OTP_LENGTH } from '@alphawolf/auth';
import { resendOtpAction, verifyOtpAction } from '../../lib/actions/signup';

type Props = {
  email: string;
  accountType: 'customer' | 'shop';
  csrfToken: string;
  /** Signup created the account but the OTP email failed (verify?sent=0). */
  sendFailed?: boolean;
};

type State = { ok: boolean; message?: string; email?: string };
const initial: State = { ok: false };

export function VerifyForm({ email, accountType, csrfToken, sendFailed }: Props) {
  const [verifyState, verifyAction, verifying] = useActionState<State, FormData>(
    verifyOtpAction,
    initial,
  );
  const [resendState, resendAction, resending] = useActionState<State, FormData>(
    resendOtpAction,
    initial,
  );
  const [code, setCode] = useState('');

  const status = verifyState.message ?? resendState.message;
  const ok = verifyState.ok || resendState.ok;

  return (
    <div className="flex flex-col gap-6">
      {/* Cleared once a Resend succeeds — the page's sent=0 URL param can't. */}
      {sendFailed && !resendState.ok ? (
        <p
          role="alert"
          className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900"
        >
          Your account was created, but we couldn't send the verification code. Tap
          &ldquo;Resend&rdquo; below to try again.
        </p>
      ) : null}
      <form action={verifyAction} className="flex flex-col gap-4">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
        <input type="hidden" name="email" value={email} />
        <input type="hidden" name="type" value={accountType} />

        <label htmlFor="code-input" className="text-sm font-medium text-zinc-800">
          Enter the 6-digit code we sent to <span className="font-mono">{email}</span>
        </label>
        <input
          id="code-input"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]*"
          maxLength={OTP_LENGTH}
          required
          value={code}
          onChange={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))}
          className="rounded-md border border-zinc-300 px-3 py-3 text-center text-2xl font-mono tracking-[0.5em] shadow-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
          aria-describedby="code-help"
        />
        <p id="code-help" className="text-xs text-zinc-600">
          The code expires in 10 minutes. You have up to 5 attempts.
        </p>

        {status ? (
          <p
            role="alert"
            className={`text-sm rounded border px-3 py-2 ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-red-200 bg-red-50 text-red-900'}`}
          >
            {status}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={verifying || code.length !== OTP_LENGTH}
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {verifying ? 'Verifying…' : 'Verify'}
        </button>
      </form>

      <form action={resendAction} className="flex items-center justify-between">
        <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
        <input type="hidden" name="email" value={email} />
        <p className="text-sm text-zinc-600">Didn't get the code?</p>
        <button
          type="submit"
          disabled={resending}
          className="text-sm font-medium text-zinc-900 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
        >
          {resending ? 'Resending…' : 'Resend'}
        </button>
      </form>
    </div>
  );
}
