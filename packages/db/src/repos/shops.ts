// Shop + membership repository. Creates a shop and the owning admin membership
// in a single transaction (PRD §10.2 AC).

import { randomBytes } from 'node:crypto';
import { encryptPii } from '../crypto';
import { withSystem, withUser, type TxClient } from '../client';

export type MembershipRole = 'shop_admin' | 'shop_designer';

type CreateShopWithAdminInput = {
  ownerUserId: string;
  companyName: string;
  phone: string;
  website?: string | null;
  address?: string | null;
};

export type ShopSummary = {
  id: string;
  receiveCode: string;
  createdAt: Date;
};

function generateReceiveCode(): string {
  // 12-char base32-ish handoff code. Used for project transfer (GH-012).
  // Uses crypto.randomBytes so it's safe against guessing.
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += alphabet[bytes[i]! % alphabet.length];
  }
  return out;
}

export async function createShopWithAdminMembership(
  input: CreateShopWithAdminInput,
): Promise<ShopSummary> {
  // System path: signup transaction includes shop creation + membership in one
  // unit of work. RLS does not yet apply (user just verified, no session yet).
  return withSystem(async (db) => {
    const companyNameEnc = await encryptPii(db, input.companyName);
    const websiteEnc = input.website ? await encryptPii(db, input.website) : null;
    const addressEnc = input.address ? await encryptPii(db, input.address) : null;
    const phoneEnc = await encryptPii(db, input.phone);

    const shop = await db.shop.create({
      data: {
        companyNameEncrypted: companyNameEnc,
        websiteEncrypted: websiteEnc,
        addressEncrypted: addressEnc,
        receiveCode: generateReceiveCode(),
      },
    });

    // Phone goes on the owner user record. Caller is expected to have already
    // created the user; we set the phone here so we don't accept a separate
    // arg path through createUser for shop-only fields.
    await db.user.update({
      where: { id: input.ownerUserId },
      data: { phoneEncrypted: phoneEnc },
    });

    await db.membership.create({
      data: {
        userId: input.ownerUserId,
        shopId: shop.id,
        role: 'shop_admin',
      },
    });

    return { id: shop.id, receiveCode: shop.receiveCode, createdAt: shop.createdAt };
  });
}

export async function listMembershipsForUser(
  userId: string,
): Promise<Array<{ shopId: string; role: MembershipRole }>> {
  return withUser(userId, async (db: TxClient) => {
    const rows = await db.membership.findMany({
      where: { userId },
      select: { shopId: true, role: true },
    });
    return rows;
  });
}
