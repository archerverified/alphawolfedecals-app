// Integration test: Postgres RLS for the Goal 6 Template Studio surface,
// exercised on the authenticated (withUser -> app_user, NOBYPASSRLS) connection.
//
// Proves the access model from prisma/sql/auth_rls.sql:
//   * template_sources is admin-only on EVERY verb (fail-closed for customers)
//   * vehicles.setVehiclePanels replaces a panel set atomically for an admin
//     and is rejected for a non-admin (vehicle_panels admin-only writes)
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
import { createSource, listForVehicle } from '../src/repos/template-sources';
import { setVehiclePanels, type PanelInput } from '../src/repos/vehicles';

const EMAIL_USER = 'alpha-studio-user@test.alphawolf.example';
const EMAIL_ADMIN = 'alpha-studio-admin@test.alphawolf.example';

const VEHICLE_ID = 'b0000000-0000-4000-8000-0000000000b1';

let userId: string;
let adminId: string;

const PANELS: PanelInput[] = [
  {
    name: 'Port Hull',
    view: 'driver',
    svgPath: 'M0 0 L100 0 L100 80 L0 80 Z',
    wrapSafeZone: { clip_path: 'M10 10 L90 10 L90 70 L10 70 Z', inset_mm: 12 },
    printableAreaMm2: 4800,
    finishHint: 'gloss',
    installOrder: 1,
  },
  {
    name: 'Starboard Hull',
    view: 'passenger',
    svgPath: 'M0 0 L100 0 L100 80 L0 80 Z',
    wrapSafeZone: { clip_path: 'M10 10 L90 10 L90 70 L10 70 Z', inset_mm: 12 },
    printableAreaMm2: 4800,
    finishHint: 'gloss',
    installOrder: 2,
  },
];

async function deleteFixtureUser(email: string): Promise<void> {
  await withSystem(async (db) => {
    const hash = await emailLookupHash(db, email);
    await db.user.deleteMany({ where: { emailLowerHash: hash } });
  });
}

async function cleanup(): Promise<void> {
  await withSystem(async (db) => {
    await db.templateSource.deleteMany({ where: { vehicleId: VEHICLE_ID } });
    await db.vehicle.deleteMany({ where: { id: VEHICLE_ID } });
  });
  await Promise.all([deleteFixtureUser(EMAIL_USER), deleteFixtureUser(EMAIL_ADMIN)]);
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error(
      'template-studio-rls.integration: DATABASE_URL_APP (the app_user role) must be set — that connection is what this test exercises.',
    );
  }

  await cleanup();

  const user = await createUser({
    email: EMAIL_USER,
    firstName: 'Non',
    lastName: 'Admin',
    passwordHash: 'integration-test-not-a-real-hash',
    accountType: 'customer',
  });
  userId = user.id;
  await createUser({
    email: EMAIL_ADMIN,
    firstName: 'Is',
    lastName: 'Admin',
    passwordHash: 'integration-test-not-a-real-hash',
    accountType: 'customer',
  });
  const promoted = await setUserAdminByEmail(EMAIL_ADMIN, true);
  adminId = promoted!.id;

  await withSystem(async (db) => {
    await db.vehicle.create({
      data: {
        id: VEHICLE_ID,
        year: 2024,
        make: 'TestMake',
        model: 'Studio-RLS',
        bodyType: 'boat',
        lengthMm: 11125,
        widthMm: 3050,
        heightMm: 2400,
        outlineSvgUrl: `/api/vehicle-assets/${VEHICLE_ID}/outline.svg`,
        thumbPngUrl: `/api/vehicle-assets/${VEHICLE_ID}/outline.svg`,
        sourceAuthority: 'licensed',
        status: 'published',
      },
    });
  });
});

afterAll(async () => {
  await cleanup();
  await _resetClientForTests();
});

test('non-admin cannot insert a template_sources row (fail-closed)', async () => {
  await expect(
    withUser(userId, async (db) =>
      db.templateSource.create({
        data: {
          vehicleId: VEHICLE_ID,
          kind: 'owned_svg',
          storageKey: `${VEHICLE_ID}/sources/should-fail.svg`,
          createdById: userId,
        },
      }),
    ),
  ).rejects.toThrow();
});

test('non-admin sees zero template_sources rows', async () => {
  // Seed one row as system so there is something a leak would reveal.
  await withSystem(async (db) => {
    await db.templateSource.create({
      data: {
        vehicleId: VEHICLE_ID,
        kind: 'photo',
        storageKey: `${VEHICLE_ID}/sources/seeded.jpg`,
        createdById: adminId,
      },
    });
  });
  const rows = await withUser(userId, async (db) =>
    db.templateSource.findMany({ where: { vehicleId: VEHICLE_ID } }),
  );
  expect(rows).toHaveLength(0);
});

test('admin creates and lists template_sources via the repo', async () => {
  const created = await createSource(adminId, {
    vehicleId: VEHICLE_ID,
    kind: 'owned_svg',
    storageKey: `${VEHICLE_ID}/sources/wrapped.svg`,
    measurements: { overall_length_mm: 11125, wrap_height_mm: 1200 },
    notes: 'integration fixture',
  });
  expect(created.kind).toBe('owned_svg');
  expect(created.createdById).toBe(adminId);

  const rows = await listForVehicle(adminId, VEHICLE_ID);
  expect(rows.map((r) => r.storageKey)).toContain(`${VEHICLE_ID}/sources/wrapped.svg`);
  const withMeasurements = rows.find((r) => r.storageKey.endsWith('wrapped.svg'));
  expect(withMeasurements?.measurements?.overall_length_mm).toBe(11125);
});

test('non-admin cannot replace a panel set', async () => {
  await expect(setVehiclePanels(userId, VEHICLE_ID, PANELS)).rejects.toThrow();
});

test('admin replaces a panel set atomically (replace-all, not merge)', async () => {
  await setVehiclePanels(adminId, VEHICLE_ID, PANELS);
  const first = await withSystem(async (db) =>
    db.vehiclePanel.findMany({
      where: { vehicleId: VEHICLE_ID },
      orderBy: { installOrder: 'asc' },
    }),
  );
  expect(first.map((p) => p.name)).toEqual(['Port Hull', 'Starboard Hull']);

  // Replacing with a single panel leaves exactly that panel.
  await setVehiclePanels(adminId, VEHICLE_ID, [PANELS[0]!]);
  const second = await withSystem(async (db) =>
    db.vehiclePanel.findMany({ where: { vehicleId: VEHICLE_ID } }),
  );
  expect(second.map((p) => p.name)).toEqual(['Port Hull']);
});

test('setVehiclePanels refuses an empty replacement set', async () => {
  await expect(setVehiclePanels(adminId, VEHICLE_ID, [])).rejects.toThrow(/empty set/);
});
