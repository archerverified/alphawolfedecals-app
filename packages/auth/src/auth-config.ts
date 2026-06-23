// Auth.js v5 configuration for the @alphawolf/web app.
//
// Strategy: JWT session in an httpOnly + Secure + SameSite=lax cookie.
// 30-day refresh per PRD §4.1. Credentials provider delegates to login()
// which enforces lockouts, audit logging, and Argon2id verification.
//
// SameSite=lax (NOT strict — Goal 11 D2): the session cookie was SameSite=strict,
// which dropped the session on top-level navigations that follow a POST/redirect
// — e.g. "Start design" → createProjectAction (POST) → redirect to the editor
// (GET): the editor's GET arrived without the cookie, requireUser bounced to
// /signin, and the operator re-authenticated repeatedly (proven in auth_events:
// login → create-project → login again, seconds apart). `lax` is next-auth's
// default and the correct setting for a session cookie; it still withholds the
// cookie on cross-site POSTs (CSRF-safe), and the app additionally protects
// Server Actions with its own double-submit token (see middleware CSRF + verifyCsrf).

import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { login } from './login.js';
import { authorizeVerifiedSession } from './verified-session.js';

const THIRTY_DAYS_SEC = 60 * 60 * 24 * 30;

export const authConfig: NextAuthConfig = {
  trustHost: true,
  session: {
    strategy: 'jwt',
    maxAge: THIRTY_DAYS_SEC,
    updateAge: 60 * 60 * 24, // refresh once per day
  },
  cookies: {
    sessionToken: {
      name:
        process.env.NODE_ENV === 'production' ? '__Secure-alphawolf.session' : 'alphawolf.session',
      options: {
        httpOnly: true,
        // lax, not strict — see the SameSite note at the top of this file.
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production' ? '__Host-alphawolf.csrf' : 'alphawolf.csrf',
      options: {
        httpOnly: true,
        // lax matches next-auth's own default; strict broke the credentials
        // callback redirect the same way it broke the session cookie (Goal 11 D2).
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
  },
  providers: [
    Credentials({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(creds, req) {
        const email = typeof creds?.email === 'string' ? creds.email : '';
        const password = typeof creds?.password === 'string' ? creds.password : '';
        if (!email || !password) return null;
        // `req` in next-auth's edge runtime is a Web Request. We read x-forwarded-for
        // for the rate limiter; fall back to a sentinel when missing.
        const ip = (req?.headers?.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || '0.0.0.0';
        const userAgent = req?.headers?.get('user-agent') ?? null;

        const result = await login({
          email,
          password,
          meta: { ip, userAgent: userAgent ?? undefined },
        });
        if (!result.ok) return null;
        return {
          id: result.userId,
          email,
          accountType: result.accountType,
        } as unknown as { id: string; email: string };
      },
    }),
    // Goal 20 D1: session on verify. After a successful signup OTP verification
    // the server mints a short-lived, HMAC-signed verification ticket (never sent
    // to the browser) and calls signIn('otp-verified', { email, ticket }). This
    // establishes the JWT session WITHOUT a password (none exists in plaintext at
    // verify time), so a new customer/shop is signed in immediately instead of
    // bouncing to /signin on the first auth-gated action (finding F3). All of the
    // ticket validation + active-account checks live in authorizeVerifiedSession.
    Credentials({
      id: 'otp-verified',
      name: 'Verified session',
      credentials: {
        email: { label: 'Email', type: 'email' },
        ticket: { label: 'Ticket', type: 'text' },
      },
      async authorize(creds) {
        const email = typeof creds?.email === 'string' ? creds.email : '';
        const ticket = typeof creds?.ticket === 'string' ? creds.ticket : '';
        if (!email || !ticket) return null;
        const user = await authorizeVerifiedSession(email, ticket);
        if (!user) return null;
        return {
          id: user.id,
          email: user.email,
          accountType: user.accountType,
        } as unknown as { id: string; email: string };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.sub = (user as { id?: string }).id ?? token.sub;
        token.accountType = (user as { accountType?: string }).accountType;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as { id?: string }).id = token.sub ?? '';
        (session.user as { accountType?: string }).accountType =
          typeof token.accountType === 'string' ? token.accountType : undefined;
      }
      return session;
    },
  },
  pages: {
    signIn: '/signin',
  },
};
