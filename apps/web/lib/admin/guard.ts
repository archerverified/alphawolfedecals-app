// Server-side session + admin gating for the vehicle-template admin area.
//
// requireAdmin() returns 404 (notFound) — not 403 — for non-admins, so the
// route's existence isn't revealed (GH-004 AC). The admin flag is read fresh
// from the user's own row each request (getOwnUser goes through RLS), so a
// promotion/demotion takes effect immediately rather than waiting for the JWT
// to refresh.

import { notFound, redirect } from 'next/navigation';
import { auth } from '@alphawolf/auth/server';
import { users, type DecryptedUser } from '@alphawolf/db';
import { isAdminUser } from './role';

export async function getSessionUser(): Promise<DecryptedUser | null> {
  const session = await auth();
  // auth-config sets session.user.id in its session callback but next-auth's
  // base types don't know it; cast (matching packages/auth/src/auth-config.ts).
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  return users.getOwnUser(id);
}

// Use in customer-facing server components/actions that require a logged-in
// user. Sends unauthenticated visitors to sign in and back.
export async function requireUser(returnTo: string): Promise<DecryptedUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/signin?next=${encodeURIComponent(returnTo)}`);
  return user;
}

// Use in every /admin route + admin action. 404s non-admins.
export async function requireAdmin(): Promise<DecryptedUser> {
  const user = await getSessionUser();
  if (!isAdminUser(user)) notFound();
  return user!;
}
