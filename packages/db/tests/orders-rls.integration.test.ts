// Integration test: proves the shop-dashboard RLS boundary on orders (Goal 3b
// PR3) on the authenticated (withUser → app_user) connection — the role that
// actually enforces RLS in production.
//
// Same harness as projects-rls.integration.test.ts. Runs against the REAL
// Supabase dev DB and is EXCLUDED from the default unit run (it is a
// *.integration.test.ts):
//   pnpm --filter @alphawolf/db db:apply-sql     # apply orders_shop_update first
//   pnpm --filter @alphawolf/db test:integration
// Requires DATABASE_URL_APP (the NOBYPASSRLS app_user role under test),
// DATABASE_URL (superuser, for fixtures), PII_ENCRYPTION_KEY. The orders_shop_update
// policy added in this PR must be applied to the target DB or the "shop A can
// transition" / raw-UPDATE assertions fail.
//
// The proof: an order routed to shop A is readable + updatable by a shop-A
// member, invisible + un-updatable to a shop-B member, and cannot be re-routed
// to a shop the member doesn't belong to (WITH CHECK).

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Prisma } from '@prisma/client';
import { _resetClientForTests, withSystem, withUser } from '../src/client';
import { emailLookupHash } from '../src/crypto';
import { createUser } from '../src/repos/users';
import { createShopWithAdminMembership } from '../src/repos/shops';
import * as orders from '../src/repos/orders';

const EMAIL_CUST = 'alpha-order-cust@test.alphawolf.example';
const EMAIL_A = 'alpha-order-shopA@test.alphawolf.example';
const EMAIL_B = 'alpha-order-shopB@test.alphawolf.example';
// Seeded Transit (the only vehicle in dev). Projects FK to vehicles.id.
const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';

const EMPTY_CANVAS = {
  schemaVersion: 1,
  vehicleId: SEEDED_VEHICLE_ID,
  panels: {},
  elements: {},
  selection: [],
  seq: 0,
} as Prisma.InputJsonValue;

let custId: string;
let aMemberId: string;
let bMemberId: string;
let shopAId: string;
let shopBId: string;
let orderId: string;

async function deleteFixtureUser(email: string): Promise<void> {
  await withSystem(async (db) => {
    const hash = await emailLookupHash(db, email);
    const users = await db.user.findMany({ where: { emailLowerHash: hash }, select: { id: true } });
    for (const u of users) {
      await db.project.deleteMany({ where: { ownerUserId: u.id } }); // cascades versions + orders
    }
    await db.user.deleteMany({ where: { emailLowerHash: hash } }); // cascades memberships
  });
}

async function deleteShop(id: string | undefined): Promise<void> {
  if (!id) return;
  await withSystem(async (db) => {
    await db.shop.deleteMany({ where: { id } }); // cascades memberships
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error('orders-rls.integration: DATABASE_URL_APP (the app_user role) must be set.');
  }
  await Promise.all([
    deleteFixtureUser(EMAIL_CUST),
    deleteFixtureUser(EMAIL_A),
    deleteFixtureUser(EMAIL_B),
  ]);

  const [cust, aMember, bMember] = await Promise.all([
    createUser({
      email: EMAIL_CUST,
      firstName: 'Cust',
      lastName: 'Omer',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
    createUser({
      email: EMAIL_A,
      firstName: 'Aaron',
      lastName: 'ShopA',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'shop_user',
    }),
    createUser({
      email: EMAIL_B,
      firstName: 'Bella',
      lastName: 'ShopB',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'shop_user',
    }),
  ]);
  custId = cust.id;
  aMemberId = aMember.id;
  bMemberId = bMember.id;

  // Each member is the admin of their own shop.
  const [shopA, shopB] = await Promise.all([
    createShopWithAdminMembership({
      ownerUserId: aMemberId,
      companyName: 'Shop A',
      phone: '5550000001',
    }),
    createShopWithAdminMembership({
      ownerUserId: bMemberId,
      companyName: 'Shop B',
      phone: '5550000002',
    }),
  ]);
  shopAId = shopA.id;
  shopBId = shopB.id;

  // A customer order routed to shop A. Built on the system connection so the
  // fixture itself doesn't depend on the very policies under test.
  await withSystem(async (db) => {
    const project = await db.project.create({
      data: {
        ownerUserId: custId,
        ownerShopId: shopAId,
        vehicleId: SEEDED_VEHICLE_ID,
        name: 'RLS order project',
      },
      select: { id: true },
    });
    const version = await db.projectVersion.create({
      data: {
        projectId: project.id,
        version: 1,
        canvasState: EMPTY_CANVAS,
        approvalState: 'submitted',
        rev: 0,
      },
      select: { id: true },
    });
    const order = await db.order.create({
      data: {
        projectId: project.id,
        projectVersionId: version.id,
        ownerUserId: custId,
        ownerShopId: shopAId,
        status: 'submitted',
        contactName: 'Cust Omer',
        contactEmail: 'cust@example.com',
      },
      select: { id: true },
    });
    orderId = order.id;
  });
});

afterAll(async () => {
  await Promise.all([
    deleteFixtureUser(EMAIL_CUST),
    deleteFixtureUser(EMAIL_A),
    deleteFixtureUser(EMAIL_B),
  ]);
  await Promise.all([deleteShop(shopAId), deleteShop(shopBId)]);
  await _resetClientForTests();
});

describe('orders RLS — shop dashboard read + cross-shop isolation', () => {
  test('shop A member reads the order through the shop path; shop B member cannot', async () => {
    const aList = await orders.listShopOrders(aMemberId, [shopAId]);
    expect(aList.map((o) => o.id)).toContain(orderId);

    const bList = await orders.listShopOrders(bMemberId, [shopBId]);
    expect(bList.map((o) => o.id)).not.toContain(orderId);

    expect(await orders.getShopOrder(aMemberId, orderId, [shopAId])).not.toBeNull();
    expect(await orders.getShopOrder(bMemberId, orderId, [shopBId])).toBeNull();
  });

  test('shop A member can transition the order (orders_shop_update permits it)', async () => {
    const res = await orders.transitionOrderStatus(aMemberId, {
      orderId,
      shopIds: [shopAId],
      to: 'in_production',
    });
    expect(res).toEqual({ ok: true, status: 'in_production' });

    const after = await orders.getShopOrder(aMemberId, orderId, [shopAId]);
    expect(after?.status).toBe('in_production');
  });

  test('shop B member cannot transition shop A’s order (repo returns not_found)', async () => {
    const res = await orders.transitionOrderStatus(bMemberId, {
      orderId,
      shopIds: [shopBId],
      to: 'fulfilled',
    });
    expect(res).toEqual({ ok: false, reason: 'not_found' });
  });

  test('RLS blocks a raw cross-shop UPDATE under app_user, but allows the owning shop', async () => {
    // Shop B member targets shop A's order directly, bypassing the repo guards.
    // orders_shop_update.USING matches no row for B → zero rows updated.
    const blocked = await withUser(bMemberId, (db) =>
      db.order.updateMany({ where: { id: orderId }, data: { status: 'fulfilled' } }),
    );
    expect(blocked.count).toBe(0);

    // The owning shop's identical raw UPDATE is permitted.
    const allowed = await withUser(aMemberId, (db) =>
      db.order.updateMany({ where: { id: orderId }, data: { status: 'fulfilled' } }),
    );
    expect(allowed.count).toBe(1);
  });

  test('WITH CHECK blocks re-routing an order to a shop the member is not in', async () => {
    // Shop A member tries to reassign the order to shop B (not their shop). USING
    // passes (they own the current row) but WITH CHECK on the new owner_shop_id
    // fails → zero rows updated.
    const res = await withUser(aMemberId, (db) =>
      db.order.updateMany({ where: { id: orderId }, data: { ownerShopId: shopBId } }),
    );
    expect(res.count).toBe(0);

    const stillA = await withSystem((db) =>
      db.order.findUnique({ where: { id: orderId }, select: { ownerShopId: true } }),
    );
    expect(stillA?.ownerShopId).toBe(shopAId);
  });
});
