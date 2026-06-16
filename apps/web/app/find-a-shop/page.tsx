// Shop locator (Goal 9 / D3). "No shop? Find one near you" — reached from the
// export/handoff flow. Shows opted-in platform shops first, then the curated
// static directory, then a maps fallback for "near you". Feeds the B2B funnel
// and lays the QR-attribution groundwork (no affiliate program yet — out of scope).
//
// PII-safe: platform shops come from shops.listPublicShops(), which returns ONLY
// opted-in shops and only the consented columns (name + coarse public_city + the
// public receive_code) — never the encrypted address/website/phone or the owner.

import { shops } from '@alphawolf/db';
import { Eyebrow } from '@alphawolf/ui/components/ui/eyebrow';

import { requireUser } from '../../lib/admin/guard';
import { captureServerEvent } from '../../lib/notifications/posthog-server';
import { LOCATOR_DIRECTORY } from '../../lib/locator/directory';
import { ShopLocator } from '../../components/locator/ShopLocator';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Find a wrap shop — Alpha Wolf Wrap Studio',
};

export default async function FindAShopPage() {
  const user = await requireUser('/find-a-shop');
  const platformShops = await shops.listPublicShops();

  await captureServerEvent('locator_opened', user.id, {
    platform_shops: platformShops.length,
    directory: LOCATOR_DIRECTORY.length,
  });

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header>
        <Eyebrow>Print &amp; install</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">
          Find a wrap shop
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Take your finished design to a shop to get it printed and installed. Browse our partners
          or search for a shop near you.
        </p>
      </header>
      <div className="mt-8">
        <ShopLocator platformShops={platformShops} directory={LOCATOR_DIRECTORY} />
      </div>
    </main>
  );
}
