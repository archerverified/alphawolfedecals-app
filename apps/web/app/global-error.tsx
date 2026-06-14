'use client';

// Root-layout error boundary (Goal 10 D2). error.tsx cannot catch an error thrown
// by the root layout itself; global-error.tsx is the last line of defence and must
// render its own <html>/<body>. Kept minimal — no app chrome is guaranteed to be
// mountable at this point.

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';

export default function GlobalError({
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
    <html lang="en">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: '1.5rem',
          color: '#18181b',
        }}
      >
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600 }}>Something went wrong</h1>
        <p style={{ marginTop: '0.75rem', fontSize: '0.875rem', color: '#52525b' }}>
          The app hit an unexpected problem. Please try again.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: '1.5rem',
            borderRadius: '0.375rem',
            background: '#18181b',
            color: '#fff',
            padding: '0.5rem 1rem',
            fontSize: '0.875rem',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
