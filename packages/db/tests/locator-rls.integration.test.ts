// Integration test: proves the shop-locator public read (Goal 9 / D3) leaks no
// shop PII and respects the opt-in. Runs against the REAL Supabase dev DB,
// excluded from the unit run:
//   pnpm --filter @alphawolf/db db:migrate   # shop_public_listing migration
//   pnpm --filter @alphawolf/db test:integration
//
// The proof: listPublicShops returns ONLY public_listing=true shops, and ONLY
// the whitelisted columns (id, name, city) — never the encrypted address/
// website, the owner, or the receive_code.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { _resetClientForTests, withSystem } from '../src/client';
import { emailLookupHash } from '../src/crypto';
import { createUser } from '../src/repos/users';
import * as shops from '../src/repos/shops';

const EMAIL_OWNER = 'alpha-locator-owner@test.alphawolf.example';
const PUBLIC_NAME = 'Locator Public Wraps';
const PRIVATE_NAME = 'Locator Private Wraps';

let ownerId: string;
let publicShopId: string;
let privateShopId: string;

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error('locator-rls.integration: DATABASE_URL_APP must be set.');
  }
  // Clean any prior fixture rows.
  await withSystem(async (db) => {
    await db.shop.deleteMany({ where: { publicCity: 'Locatortown, TX' } });
    const hash = await emailLookupHash(db, EMAIL_OWNER);
    await db.user.deleteMany({ where: { emailLowerHash: hash } });
  });

  const owner = await createUser({
    email: EMAIL_OWNER,
    firstName: 'Loc',
    lastName: 'Owner',
    passwordHash: 'integration-test-not-a-real-hash',
    accountType: 'shop_user',
  });
  ownerId = owner.id;

  const pub = await shops.createShopWithAdminMembership({
    ownerUserId: ownerId,
    companyName: PUBLIC_NAME,
    phone: '+15125550100',
    address: '123 Secret St',
    website: 'https://secret.example',
  });
  const priv = await shops.createShopWithAdminMembership({
    ownerUserId: ownerId,
    companyName: PRIVATE_NAME,
    phone: '+15125550101',
  });
  publicShopId = pub.id;
  privateShopId = priv.id;

  // Opt ONE shop into the public locator.
  await withSystem((db) =>
    db.shop.update({
      where: { id: publicShopId },
      data: { publicListing: true, publicCity: 'Locatortown, TX' },
    }),
  );
});

afterAll(async () => {
  await withSystem(async (db) => {
    await db.shop.deleteMany({ where: { id: { in: [publicShopId, privateShopId] } } });
    const hash = await emailLookupHash(db, EMAIL_OWNER);
    await db.user.deleteMany({ where: { emailLowerHash: hash } });
  });
  await _resetClientForTests();
});

describe('listPublicShops — opt-in + whitelist', () => {
  test('returns ONLY the opted-in shop, with name + city', async () => {
    const list = await shops.listPublicShops();
    const mine = list.filter((s) => s.id === publicShopId || s.id === privateShopId);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toEqual({ id: publicShopId, name: PUBLIC_NAME, city: 'Locatortown, TX' });
  });

  test('the non-opted-in shop never appears', async () => {
    const list = await shops.listPublicShops();
    expect(list.some((s) => s.id === privateShopId)).toBe(false);
  });

  test('the payload leaks no PII keys (address/website/phone/owner/receiveCode)', async () => {
    const list = await shops.listPublicShops();
    const entry = list.find((s) => s.id === publicShopId)!;
    expect(Object.keys(entry).sort()).toEqual(['city', 'id', 'name']);
    const blob = JSON.stringify(entry);
    expect(blob).not.toContain('Secret St');
    expect(blob).not.toContain('secret.example');
    expect(blob).not.toContain('5550100');
    expect(blob).not.toContain('receiveCode');
  });
});
