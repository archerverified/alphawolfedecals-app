// Referral surface (Goal 9). Authenticated "give 2, get 2" page: the customer's
// own share link + QR (reusing the export-pack QR library) and their running
// referral stats. The link points at /signup?ref=<code>; a verified new signup
// grants 2 credits to each side.

import { CREDIT_CONFIG, referrals } from '@alphawolf/db';
import { Eyebrow } from '@alphawolf/ui/components/ui/eyebrow';

import { requireUser } from '../../lib/admin/guard';
import { captureServerEvent } from '../../lib/notifications/posthog-server';
import { referralUrl } from '../../lib/actions/referral';
import { qrSvg } from '../../lib/qr';
import { ReferralPanel } from '../../components/referral/ReferralPanel';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Refer a friend',
};

export default async function ReferPage() {
  const user = await requireUser('/refer');

  let stats = await referrals.getReferralStats(user.id);
  if (!stats.code) {
    const code = await referrals.ensureReferralCode(user.id);
    if (code) {
      // Fires once per user — the first time their code is minted.
      await captureServerEvent('referral_link_created', user.id, {});
      stats = { ...stats, code };
    }
  }

  if (!stats.code) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Eyebrow>Referrals</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Refer a friend</h1>
        <p className="mt-3 text-sm text-zinc-600">
          We couldn’t create your referral link right now. Please try again in a moment.
        </p>
      </main>
    );
  }

  const url = referralUrl(stats.code);
  const grant = CREDIT_CONFIG.referralGrant;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header>
        <Eyebrow>Referrals</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
          Give {grant}, get {grant}
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Share your link. When a friend signs up and verifies their email, you each get {grant}{' '}
          design credits. No limit on how many friends — invite your whole crew.
        </p>
      </header>

      <div className="mt-8">
        <ReferralPanel
          url={url}
          qrSvg={qrSvg(url)}
          referredCount={stats.referredCount}
          creditsEarned={stats.creditsEarned}
        />
      </div>
    </main>
  );
}
