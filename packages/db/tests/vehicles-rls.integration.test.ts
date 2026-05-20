// Integration test: Postgres RLS on the vehicle template tables, exercised on
// the authenticated (withUser -> app_user, NOBYPASSRLS) connection.
//
// Proves the GH-003/GH-004 access model from prisma/sql/auth_rls.sql:
//   * a non-admin user can read `published` vehicles but NOT `draft`/`retired`
//   * a non-admin user CANNOT insert a vehicle (admin-only write)
//   * an admin (users.is_admin) reads every status and can insert
//
// Runs against the real Supabase dev DB; not part of the default unit run.
//   pnpm --filter @alphawolf/db test:integration
//
// Requires DATABASE_URL_APP (app_user), DATABASE_URL (superuser, for fixtures),
// and PII_ENCRYPTION_KEY.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { _resetClientForTests, withSystem, withUser } from '../src/client';
import { emailLookupHash } from '../src/crypto';
import { createUser, setUserAdminByEmail } from '../src/repos/users';

const EMAIL_USER = 'alpha-veh-user@test.alphawolf.example';
const EMAIL_ADMIN = 'alpha-veh-admin@test.alphawolf.example';

const PUBLISHED_ID = 'b0000000-0000-4000-8000-0000000000a1';
const DRAFT_ID = 'b0000000-0000-4000-8000-0000000000a2';
const RETIRED_ID = 'b0000000-0000-4000-8000-0000000000a3';
const FIXTURE_IDS = [PUBLISHED_ID, DRAFT_ID, RETIRED_ID];

let userId: string;
let adminId: string;

async function deleteFixtureUser(email: string): Promise<void> {
  await withSystem(async (db) => {
    const hash = await emailLookupHash(db, email);
    await db.user.deleteMany({ where: { emailLowerHash: hash } });
  });
}

async function insertVehicle(id: string, status: 'published' | 'draft' | 'retired'): Promise<void> {
  await withSystem(async (db) => {
    await db.vehicle.create({
      data: {
        id,
        year: 2024,
        make: 'TestMake',
        model: `RLS-${status}`,
        bodyType: 'van',
        lengthMm: 5000,
        widthMm: 2000,
        heightMm: 2500,
        outlineSvgUrl: `/api/vehicle-assets/${id}/outline.svg`,
        thumbPngUrl: `/api/vehicle-assets/${id}/outline.svg`,
        sourceAuthority: 'manufacturer_spec',
        status,
      },
    });
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error(
      'vehicles-rls.integration: DATABASE_URL_APP (the app_user role) must be set — that connection is what this test exercises.',
    );
  }

  await withSystem(async (db) => {
    await db.vehicle.deleteMany({ where: { id: { in: FIXTURE_IDS } } });
  });
  await Promise.all([deleteFixtureUser(EMAIL_USER), deleteFixtureUser(EMAIL_ADMIN)]);

  const [user] = await Promise.all([
    createUser({
      email: EMAIL_USER,
      firstName: 'Non',
      lastName: 'Admin',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
    createUser({
      email: EMAIL_ADMIN,
      firstName: 'Is',
      lastName: 'Admin',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
  ]);
  userId = user.id;
  const promoted = await setUserAdminByEmail(EMAIL_ADMIN, true);
  adminId = promoted!.id;

  await insertVehicle(PUBLISHED_ID, 'published');
  await insertVehicle(DRAFT_ID, 'draft');
  await insertVehicle(RETIRED_ID, 'retired');
});

afterAll(async () => {
  await withSystem(async (db) => {
    await db.vehicle.deleteMany({ where: { id: { in: FIXTURE_IDS } } });
  });
  await Promise.all([deleteFixtureUser(EMAIL_USER), deleteFixtureUser(EMAIL_ADMIN)]);
  await _resetClientForTests();
});

test('non-admin reads published vehicles but not draft/retired', async () => {
  const rows = await withUser(userId, async (db) =>
    db.vehicle.findMany({ where: { id: { in: FIXTURE_IDS } }, select: { id: true, status: true } }),
  );
  const ids = rows.map((r) => r.id);
  expect(ids).toContain(PUBLISHED_ID);
  expect(ids).not.toContain(DRAFT_ID);
  expect(ids).not.toContain(RETIRED_ID);
});

test('non-admin cannot insert a vehicle (RLS WITH CHECK fails)', async () => {
  await expect(
    withUser(userId, async (db) =>
      db.vehicle.create({
        data: {
          year: 2024,
          make: 'Hacker',
          model: 'ShouldFail',
          bodyType: 'van',
          lengthMm: 5000,
          widthMm: 2000,
          heightMm: 2500,
          outlineSvgUrl: '/x',
          thumbPngUrl: '/x',
          sourceAuthority: 'manufacturer_spec',
          status: 'draft',
        },
      }),
    ),
  ).rejects.toThrow();
});

test('admin reads every status', async () => {
  const rows = await withUser(adminId, async (db) =>
    db.vehicle.findMany({ where: { id: { in: FIXTURE_IDS } }, select: { id: true } }),
  );
  const ids = rows.map((r) => r.id);
  expect(ids).toEqual(expect.arrayContaining(FIXTURE_IDS));
});

test('admin can insert a vehicle', async () => {
  const created = await withUser(adminId, async (db) =>
    db.vehicle.create({
      data: {
        year: 2024,
        make: 'TestMake',
        model: 'AdminInsert',
        bodyType: 'van',
        lengthMm: 5000,
        widthMm: 2000,
        heightMm: 2500,
        outlineSvgUrl: '/x',
        thumbPngUrl: '/x',
        sourceAuthority: 'manufacturer_spec',
        status: 'draft',
      },
      select: { id: true },
    }),
  );
  expect(created.id).toBeTruthy();
  // Clean up the admin-inserted row.
  await withSystem(async (db) => {
    await db.vehicle.deleteMany({ where: { id: created.id } });
  });
});
