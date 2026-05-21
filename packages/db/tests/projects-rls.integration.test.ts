// Integration test: proves RLS cross-tenant isolation for the GH-005/008 tenant
// tables — projects, project_versions, project_assets — on the authenticated
// (withUser → app_user) connection.
//
// Same harness as rls.integration.test.ts. Runs against the REAL Supabase dev DB:
//   pnpm --filter @alphawolf/db test:integration
// Requires DATABASE_URL_APP (the NOBYPASSRLS app_user role under test),
// DATABASE_URL (superuser, for bootstrap + teardown), PII_ENCRYPTION_KEY.
//
// The proof: a project (and its version + asset) created by user A is invisible
// to user B through every repo read path, and B cannot autosave into A's version.

import { afterAll, beforeAll, expect, test } from 'vitest';
import { _resetClientForTests, withSystem } from '../src/client';
import { emailLookupHash } from '../src/crypto';
import { createUser } from '../src/repos/users';
import * as projects from '../src/repos/projects';

const EMAIL_A = 'alpha-proj-A@test.alphawolf.example';
const EMAIL_B = 'alpha-proj-B@test.alphawolf.example';
// Seeded Transit (the only vehicle in dev). Projects FK to vehicles.id.
const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';

const EMPTY_CANVAS = {
  schemaVersion: 1,
  vehicleId: SEEDED_VEHICLE_ID,
  panels: {},
  elements: {},
  selection: [],
  seq: 0,
};

let userAId: string;
let userBId: string;
let projectAId: string;
let versionAId: string;
let assetAId: string;

async function deleteFixtureUser(email: string): Promise<void> {
  await withSystem(async (db) => {
    const hash = await emailLookupHash(db, email);
    const users = await db.user.findMany({ where: { emailLowerHash: hash }, select: { id: true } });
    for (const u of users) {
      await db.project.deleteMany({ where: { ownerUserId: u.id } }); // cascades versions+assets
    }
    await db.user.deleteMany({ where: { emailLowerHash: hash } });
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error('projects-rls.integration: DATABASE_URL_APP (app_user role) must be set.');
  }
  await Promise.all([deleteFixtureUser(EMAIL_A), deleteFixtureUser(EMAIL_B)]);

  const [a, b] = await Promise.all([
    createUser({
      email: EMAIL_A,
      firstName: 'Alpha',
      lastName: 'ProjA',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
    createUser({
      email: EMAIL_B,
      firstName: 'Bravo',
      lastName: 'ProjB',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
  ]);
  userAId = a.id;
  userBId = b.id;

  const created = await projects.createProject(userAId, {
    vehicleId: SEEDED_VEHICLE_ID,
    name: 'Alpha RLS project',
    initialCanvasState: EMPTY_CANVAS,
  });
  projectAId = created.projectId;
  versionAId = created.versionId;

  const asset = await projects.createAsset(userAId, {
    projectId: projectAId,
    mimeType: 'image/png',
    sourceUrl: `${projectAId}/src/logo.png`,
  });
  assetAId = asset.assetId;
});

afterAll(async () => {
  await Promise.all([deleteFixtureUser(EMAIL_A), deleteFixtureUser(EMAIL_B)]);
  await _resetClientForTests();
});

test('owner A sees their own project; B does not', async () => {
  const aList = await projects.listProjects(userAId);
  expect(aList.map((p) => p.id)).toContain(projectAId);

  const bList = await projects.listProjects(userBId);
  expect(bList.map((p) => p.id)).not.toContain(projectAId);

  expect(await projects.getProject(userAId, projectAId)).not.toBeNull();
  expect(await projects.getProject(userBId, projectAId)).toBeNull();
});

test('project_versions: B cannot read A’s working version', async () => {
  expect(await projects.getWorkingVersion(userAId, projectAId)).not.toBeNull();
  expect(await projects.getWorkingVersion(userBId, projectAId)).toBeNull();
});

test('project_assets: B cannot list or read A’s asset', async () => {
  const aAssets = await projects.listAssets(userAId, projectAId);
  expect(aAssets.map((x) => x.assetId)).toContain(assetAId);

  const bAssets = await projects.listAssets(userBId, projectAId);
  expect(bAssets).toHaveLength(0);

  expect(await projects.getAsset(userBId, assetAId)).toBeNull();
});

test('optimistic concurrency: correct rev saves, stale rev is rejected', async () => {
  const wv = await projects.getWorkingVersion(userAId, projectAId);
  expect(wv).not.toBeNull();
  const rev = wv!.rev;

  const ok = await projects.saveWorkingCanvas(userAId, {
    versionId: versionAId,
    expectedRev: rev,
    canvasState: { ...EMPTY_CANVAS, seq: 1 },
  });
  expect(ok.ok).toBe(true);
  if (ok.ok) expect(ok.rev).toBe(rev + 1);

  // Re-using the now-stale rev must be rejected (last-write-wins guard).
  const stale = await projects.saveWorkingCanvas(userAId, {
    versionId: versionAId,
    expectedRev: rev,
    canvasState: { ...EMPTY_CANVAS, seq: 2 },
  });
  expect(stale.ok).toBe(false);
  if (!stale.ok) expect(stale.reason).toBe('stale');
});

test('B cannot autosave into A’s version (RLS blocks the update)', async () => {
  const wv = await projects.getWorkingVersion(userAId, projectAId);
  const rev = wv!.rev;
  // B targets A's version id with the correct rev — RLS must still prevent the
  // update, so the result is not_found (the row is invisible to B).
  const res = await projects.saveWorkingCanvas(userBId, {
    versionId: versionAId,
    expectedRev: rev,
    canvasState: { ...EMPTY_CANVAS, seq: 99 },
  });
  expect(res.ok).toBe(false);
  if (!res.ok) expect(res.reason).toBe('not_found');
});
