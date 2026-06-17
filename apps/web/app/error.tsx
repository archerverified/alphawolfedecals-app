'use client';

// Route-segment error boundary (Goal 10 D2). Without this, any thrown error in a
// server component (a failed DB fetch, a cold-start connection blip) rendered the
// bare Next.js error overlay — a white-screen-of-death for the user. This catches
// it app-wide, reports to Sentry, and offers a retry + a way home. Errors in the
// root layout itself are caught by global-error.tsx instead.

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Something went wrong</h1>
      <p className="mt-3 text-sm leading-6 text-zinc-600">
        We hit an unexpected problem loading this page. Your work is saved — please try again.
      </p>
      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={reset}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Try again
        </button>
        <a
          href="/"
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Go home
        </a>
      </div>
      {error.digest ? (
        <p className="mt-6 text-xs text-zinc-500">Reference: {error.digest}</p>
      ) : null}
    </main>
  );
}
