'use server';

// Referral surface server action (Goal 9). RPC-style; the session user mints
// their own code (withUser/RLS). Used by the /refer page's copy button to
// guarantee a link exists.

import { referrals } from '@alphawolf/db';

import { getSessionUser } from '../admin/guard';
import { appBaseUrl } from '../base-url';

export type ReferralLinkResult = { ok: true; code: string; url: string } | { ok: false };

export function referralUrl(code: string): string {
  return `${appBaseUrl()}/signup?ref=${encodeURIComponent(code)}`;
}

export async function ensureReferralLinkAction(): Promise<ReferralLinkResult> {
  const user = await getSessionUser();
  if (!user) return { ok: false };
  const code = await referrals.ensureReferralCode(user.id);
  if (!code) return { ok: false };
  return { ok: true, code, url: referralUrl(code) };
}
