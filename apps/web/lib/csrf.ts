// Read the form-CSRF cookie that was bootstrapped by middleware.ts.
//
// In Next.js 15, cookie WRITES are only legal in Server Actions, Route
// Handlers, and middleware. Server Components can only READ. The cookie
// is created on first request to /signup, /signup-shop, or /verify by
// the middleware in this app's root middleware.ts.
//
// If this function ever returns the fallback "missing" path, it means the
// middleware matcher and the page route are out of sync — that's a config
// bug, not a runtime condition users should hit.

import { cookies } from 'next/headers';
import { CSRF_COOKIE_NAME } from '@alphawolf/auth';

export async function getOrCreateFormCsrfToken(): Promise<string> {
  const jar = await cookies();
  const token = jar.get(CSRF_COOKIE_NAME)?.value;

  if (!token) {
    // Should be unreachable in normal operation. If you see this, check
    // that middleware.ts's matcher includes the route that called this
    // helper.
    throw new Error(
      '[csrf] CSRF cookie missing — middleware did not run for this route. Verify apps/web/middleware.ts matcher.',
    );
  }

  return token;
}
