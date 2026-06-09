// Server-side gating for the shop dashboard (Goal 3b).
//
// requireShopUser() builds on requireUser() (which redirects unauthenticated
// visitors to sign in) and then requires the user to belong to at least one
// shop. A logged-in customer with no membership is sent to their own project
// list rather than shown an empty dashboard. The returned shopIds scope every
// dashboard query as defence-in-depth alongside the orders_shop_read RLS policy.

import { redirect } from 'next/navigation';
import { shops, type DecryptedUser } from '@alphawolf/db';
import { requireUser } from '../admin/guard';

type Membership = Awaited<ReturnType<typeof shops.listMembershipsForUser>>[number];

export type ShopSession = {
  user: DecryptedUser;
  memberships: Membership[];
  shopIds: string[];
};

export async function requireShopUser(returnTo: string): Promise<ShopSession> {
  const user = await requireUser(returnTo);
  const memberships = await shops.listMembershipsForUser(user.id);
  if (memberships.length === 0) redirect('/projects');
  return { user, memberships, shopIds: memberships.map((m) => m.shopId) };
}
