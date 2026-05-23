// Auth.js v5 configuration for the @alphawolf/web app.
//
// Strategy: JWT session in an httpOnly + Secure + SameSite=strict cookie.
// 30-day refresh per PRD §4.1. Credentials provider delegates to login()
// which enforces lockouts, audit logging, and Argon2id verification.

import type { NextAuthConfig } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { login } from './login.js';

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
        sameSite: 'strict',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === 'production' ? '__Host-alphawolf.csrf' : 'alphawolf.csrf',
      options: {
        httpOnly: true,
        sameSite: 'strict',
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
