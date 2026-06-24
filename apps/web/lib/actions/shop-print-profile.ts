'use server';

// Shop print-profile save action (Goal 22 / D1). Mirrors the shop-order action
// shape: Next.js's built-in Server-Action origin check + requireShopUser (which
// layers requireUser) + RLS. The pure validation + never-short width derivation
// lives in lib/print/profile-input.ts (unit-tested); this layer adds auth, a
// defence-in-depth shop-membership check, and the RLS-scoped upsert.

import { printProfiles } from '@alphawolf/db';
import { requireShopUser } from '../shop/guard';
import { validatePrintProfileInput } from '@/lib/print/profile-input';

export type SaveProfileResult =
  | { ok: true }
  | { ok: false; reason: 'invalid' | 'bad_width' | 'forbidden' };

export async function saveShopPrintProfileAction(raw: unknown): Promise<SaveProfileResult> {
  const validated = validatePrintProfileInput(raw);
  if (!validated.ok) return validated;

  const { user, shopIds } = await requireShopUser('/dashboard/print-profile');
  // Defence-in-depth alongside the shop_print_profiles RLS WITH CHECK: a member
  // can only write their own shop's profile.
  if (!shopIds.includes(validated.shopId)) return { ok: false, reason: 'forbidden' };

  await printProfiles.upsertShopPrintProfile(user.id, validated.shopId, validated.value);
  return { ok: true };
}
