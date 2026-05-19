import { cookies } from 'next/headers';
import { CSRF_COOKIE_NAME, generateCsrfToken } from '@alphawolf/auth';

// Reads the form-CSRF cookie or sets a new one. Called from server components
// that render forms wired to the signup/verify/resend actions.
export async function getOrCreateFormCsrfToken(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(CSRF_COOKIE_NAME)?.value;
  if (existing) return existing;
  const token = generateCsrfToken();
  jar.set(CSRF_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
  });
  return token;
}
