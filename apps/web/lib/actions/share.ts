'use server';

// Share-for-feedback server action (Goal 9 / growth loops). RPC-style like the
// generation actions: Next's built-in Server-Action origin check + the session
// user + RLS (ensureShareToken runs on the withUser connection, so only the
// project owner can mint/read its token). Returns a typed result, never a throw.

import { share } from '@alphawolf/db';

import { getSessionUser } from '../admin/guard';
import { appBaseUrl } from '../base-url';

export type ShareLinkResult = { ok: true; token: string; url: string } | { ok: false };

// Mint (or fetch) the public share link for a project the caller owns. The link
// is the existing transfer_token surfaced as a /share/<token> URL — no PII, just
// the 3 concepts + a vote tally on the far side.
export async function createShareLinkAction(projectId: string): Promise<ShareLinkResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const token = await share.ensureShareToken(user.id, projectId);
  if (!token) return { ok: false };
  return { ok: true, token, url: `${appBaseUrl()}/share/${token}` };
}
