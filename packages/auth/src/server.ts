// Next.js / Node side of @alphawolf/auth. Wraps NextAuth() so app/api can
// import a single set of handlers. Kept on its own subpath so that the
// signup pure-logic surface (./index) stays usable from any runtime.

import NextAuth from 'next-auth';
import type { NextAuthResult } from 'next-auth';
import { authConfig } from './auth-config';

// Explicit type annotations on each export work around next-auth v5's
// portable-type inference problem (TS2742) when re-exporting from a
// workspace package that has tsconfig `declaration: true`.
const nextAuth: NextAuthResult = NextAuth(authConfig);

export const handlers: NextAuthResult['handlers'] = nextAuth.handlers;
export const auth: NextAuthResult['auth'] = nextAuth.auth;
export const signIn: NextAuthResult['signIn'] = nextAuth.signIn;
export const signOut: NextAuthResult['signOut'] = nextAuth.signOut;

export { authConfig } from './auth-config';
