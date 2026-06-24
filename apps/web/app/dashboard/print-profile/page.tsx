// Shop print-profile settings (Goal 22 / D1). Server Component: gate to a shop
// member, read this shop's saved profile (RLS-scoped), and render the editor
// form. The first membership is the active shop, mirroring the rest of the
// dashboard. The engine always tiles to the EFFECTIVE printable width, so the
// page explains why the nominal media width is not the number that matters.

import { notFound } from 'next/navigation';
import { printProfiles } from '@alphawolf/db';
import { Eyebrow } from '@alphawolf/ui/components/ui/eyebrow';
import { requireShopUser } from '@/lib/shop/guard';
import { PrintProfileForm } from './PrintProfileForm';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Print profile',
};

export default async function PrintProfilePage() {
  const { user, shopIds } = await requireShopUser('/dashboard/print-profile');
  // requireShopUser redirects members-of-nothing to /projects, so shopIds is
  // non-empty here; the guard keeps the type honest.
  const shopId = shopIds[0];
  if (!shopId) notFound();
  const profile = await printProfiles.getShopPrintProfile(user.id, shopId);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Eyebrow>Alpha Wolf · Shop</Eyebrow>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">Print profile</h1>
        <p className="mt-2 max-w-2xl text-sm text-zinc-600">
          We tile every wrap to the width your printer can actually lay down, the effective
          printable width. The grit rollers eat 1 to 2 inches off the nominal media, so a 54 inch
          Roland prints about 52 to 53 inches of usable image. Set your machine here once and every
          print pack uses it.
        </p>
      </div>

      <PrintProfileForm shopId={shopId} initial={profile} />
    </div>
  );
}
