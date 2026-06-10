// Integration test: proves the design-brief RLS boundary (Goal 5 / B2C-002)
// on the authenticated (withUser → app_user) connection.
//
// Same harness as orders-rls / credits-rls. Runs against the REAL Supabase dev
// DB, excluded from the unit run:
//   pnpm --filter @alphawolf/db db:apply-sql
//   pnpm --filter @alphawolf/db test:integration
//
// The proof: a brief is invisible + unwritable to a non-owner; a brief cannot
// be created against (or re-pointed at) a foreign project; snapshots are
// append-only even for their owner.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Prisma } from '@prisma/client';
import { _resetClientForTests, withSystem, withUser } from '../src/client';
import { emailLookupHash } from '../src/crypto';
import { createUser } from '../src/repos/users';
import * as briefs from '../src/repos/briefs';

const EMAIL_A = 'alpha-brief-owner@test.alphawolf.example';
const EMAIL_B = 'alpha-brief-other@test.alphawolf.example';
const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';

let aId: string;
let bId: string;
let aProjectId: string;
let bProjectId: string;
let aBriefId: string;

async function deleteFixtureUser(email: string): Promise<void> {
  await withSystem(async (db) => {
    const hash = await emailLookupHash(db, email);
    const users = await db.user.findMany({ where: { emailLowerHash: hash }, select: { id: true } });
    for (const u of users) {
      await db.project.deleteMany({ where: { ownerUserId: u.id } }); // cascades briefs + snapshots
    }
    await db.user.deleteMany({ where: { emailLowerHash: hash } });
  });
}

async function createFixtureProject(ownerId: string, name: string): Promise<string> {
  return withSystem(async (db) => {
    const project = await db.project.create({
      data: { ownerUserId: ownerId, vehicleId: SEEDED_VEHICLE_ID, name },
      select: { id: true },
    });
    return project.id;
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error('briefs-rls.integration: DATABASE_URL_APP (the app_user role) must be set.');
  }
  await Promise.all([deleteFixtureUser(EMAIL_A), deleteFixtureUser(EMAIL_B)]);

  const [a, b] = await Promise.all([
    createUser({
      email: EMAIL_A,
      firstName: 'Brief',
      lastName: 'Owner',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
    createUser({
      email: EMAIL_B,
      firstName: 'Other',
      lastName: 'User',
      passwordHash: 'integration-test-not-a-real-hash',
      accountType: 'customer',
    }),
  ]);
  aId = a.id;
  bId = b.id;
  aProjectId = await createFixtureProject(aId, 'RLS brief project A');
  bProjectId = await createFixtureProject(bId, 'RLS brief project B');
});

afterAll(async () => {
  await Promise.all([deleteFixtureUser(EMAIL_A), deleteFixtureUser(EMAIL_B)]);
  await _resetClientForTests();
});

describe('design briefs RLS — project-anchored ownership + append-only snapshots', () => {
  test('owner creates + reads their brief; non-owner sees nothing', async () => {
    const created = await briefs.getOrCreateBrief(aId, aProjectId);
    expect(created).not.toBeNull();
    aBriefId = created!.id;

    // B cannot create a brief on A's project (RLS pre-check 404s)…
    expect(await briefs.getOrCreateBrief(bId, aProjectId)).toBeNull();

    // …and B cannot read A's brief even with a raw query.
    const crossRead = await withUser(bId, (db) =>
      db.designBrief.findMany({ where: { projectId: aProjectId } }),
    );
    expect(crossRead).toHaveLength(0);
  });

  test('non-owner cannot write A’s brief; saves stay rev-consistent', async () => {
    const blocked = await withUser(bId, (db) =>
      db.designBrief.updateMany({
        where: { id: aBriefId },
        data: { data: { aiNotes: 'hijacked' } as Prisma.InputJsonValue },
      }),
    );
    expect(blocked.count).toBe(0);

    const saved = await briefs.saveBrief(aId, {
      briefId: aBriefId,
      expectedRev: 0,
      data: { aiNotes: 'legit' } as Prisma.InputJsonValue,
    });
    expect(saved).toEqual({ ok: true, rev: 1 });

    // A stale rev is rejected, not clobbered.
    const stale = await briefs.saveBrief(aId, {
      briefId: aBriefId,
      expectedRev: 0,
      data: { aiNotes: 'stale write' } as Prisma.InputJsonValue,
    });
    expect(stale).toEqual({ ok: false, reason: 'stale' });
  });

  test('brief cannot be re-pointed at a foreign project (WITH CHECK)', async () => {
    let blocked = false;
    try {
      const res = await withUser(aId, (db) =>
        db.designBrief.updateMany({
          where: { id: aBriefId },
          data: { projectId: bProjectId },
        }),
      );
      blocked = res.count === 0;
    } catch (error) {
      blocked = error instanceof Error && /row-level security/i.test(error.message);
    }
    expect(blocked).toBe(true);
  });

  test('snapshots: owner-only read, append-only even for the owner', async () => {
    const snap = await briefs.snapshotBrief(aId, aBriefId, 'review_save');
    expect(snap).toEqual({ ok: true, version: 1 });

    // B reads nothing through the join policy.
    const crossRead = await withUser(bId, (db) =>
      db.briefSnapshot.findMany({ where: { briefId: aBriefId } }),
    );
    expect(crossRead).toHaveLength(0);

    // Even the OWNER cannot rewrite or delete a saved version.
    let updated = 0;
    try {
      const res = await withUser(aId, (db) =>
        db.briefSnapshot.updateMany({
          where: { briefId: aBriefId },
          data: { label: 'rewritten' },
        }),
      );
      updated = res.count;
    } catch {
      // permission denied from the revoked grant is the stronger outcome
    }
    expect(updated).toBe(0);

    let deleted = 0;
    try {
      const res = await withUser(aId, (db) =>
        db.briefSnapshot.deleteMany({ where: { briefId: aBriefId } }),
      );
      deleted = res.count;
    } catch {
      // ditto
    }
    expect(deleted).toBe(0);

    const stillThere = await briefs.listBriefSnapshots(aId, aBriefId);
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0]).toMatchObject({ version: 1, label: 'review_save' });
  });
});
