// Referral link helper (Goal 9). PURE module — NOT a 'use server' file: it
// exports a synchronous URL builder, which a Server Action file may not do
// (Next 15 marks every export of a 'use server' module as an async action and
// fails the build otherwise). The /refer page mints the code server-side
// (referrals.ensureReferralCode) and renders the QR from this URL.

import { appBaseUrl } from '../base-url';

export function referralUrl(code: string): string {
  return `${appBaseUrl()}/signup?ref=${encodeURIComponent(code)}`;
}
