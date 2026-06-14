// Integration test: proves the share-for-feedback boundary (Goal 9 / growth
// loops) on the authenticated (withUser → app_user) connection — the role that
// enforces RLS in production.
//
// Same harness as generation-rls / credits-rls. Runs against the REAL Supabase
// dev DB, EXCLUDED from the default unit run:
//   pnpm --filter @alphawolf/db db:migrate        # concept_votes migration
//   pnpm --filter @alphawolf/db db:apply-sql      # concept_votes RLS lockout
//   pnpm --filter @alphawolf/db test:integration
//
// The proof:
//   * ensureShareToken is owner-scoped — B cannot mint a token on A's project;
//     a repeat call returns the SAME token (idempotent, race-safe).
//   * loadPublicShare returns ONLY whitelisted, non-PII columns; null for an
//     unknown token.
//   * recordConceptVote is idempotent per visitor (one ballot, changeable) and
//     rejects a concept_key that isn't one of the project's real directions.
//   * concept_votes is a sealed ballot box: app_user can neither read nor write
//     it (RLS enabled with no policy + revoked grants) — even the project owner.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { _resetClientForTests, withSystem, withUser } from '../src/client';
import { emailLookupHash } from '../src/crypto';
import { createUser } from '../src/repos/users';
import * as share from '../src/repos/share';

const EMAIL_A = 'alpha-share-owner@test.alphawolf.example';
const EMAIL_B = 'alpha-share-other@test.alphawolf.example';
const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';

let aId: string;
let bId: string;
let aProjectId: string;
let aToken: string;

async function deleteFixtureUser(email: string): Promise<void> {
  await withSystem(async (db) => {
    const hash = await emailLookupHash(db, email);
    const users = await db.user.findMany({ where: { emailLowerHash: hash }, select: { id: true } });
    for (const u of users) {
      // Cascades projects → generation_runs → concept_votes (project FK).
      await db.project.deleteMany({ where: { ownerUserId: u.id } });
    }
    await db.user.deleteMany({ where: { emailLowerHash: hash } });
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error('share-rls.integration: DATABASE_URL_APP (the app_user role) must be set.');
  }
  await Promise.all([deleteFixtureUser(EMAIL_A), deleteFixtureUser(EMAIL_B)]);

  const [a, b] = await Promise.all([
    createUser({
      email: EMAIL_A,
      firstName: 'Share',
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

  aProjectId = await withSystem(async (db) => {
    const pa = await db.project.create({
      data: { ownerUserId: aId, vehicleId: SEEDED_VEHICLE_ID, name: 'RLS share project A' },
      select: { id: true },
    });
    // One initial run with 3 directions so vote validation has real keys.
    await db.generationRun.create({
      data: {
        projectId: pa.id,
        userId: aId,
        kind: 'initial',
        briefVersion: 1,
        directions: {
          promptVersion: 'test',
          orchestratorCostUsd: 0,
          directions: [
            { key: 'c1', title: 'One', summary: 'first', viewPrompts: {} },
            { key: 'c2', title: 'Two', summary: 'second', viewPrompts: {} },
            { key: 'c3', title: 'Three', summary: 'third', viewPrompts: {} },
          ],
        },
      },
    });
    return pa.id;
  });
});

afterAll(async () => {
  await Promise.all([deleteFixtureUser(EMAIL_A), deleteFixtureUser(EMAIL_B)]);
  await _resetClientForTests();
});

describe('share token — owner-scoped minting', () => {
  test('owner mints a 12-char token; a repeat returns the same token', async () => {
    aToken = (await share.ensureShareToken(aId, aProjectId))!;
    expect(aToken).toMatch(/^[A-Z2-9]{12}$/);
    expect(await share.ensureShareToken(aId, aProjectId)).toBe(aToken);
  });

  test('a non-owner cannot mint a token on the project (RLS)', async () => {
    expect(await share.ensureShareToken(bId, aProjectId)).toBeNull();
  });
});

describe('public share payload — whitelisted, token-gated', () => {
  test('loads the 3 concepts + vehicle label, no PII; null for an unknown token', async () => {
    const data = (await share.loadPublicShare(aToken))!;
    expect(data.projectId).toBe(aProjectId);
    expect(data.vehicle).not.toBeNull();
    expect(data.concepts.map((c) => c.conceptKey)).toEqual(['c1', 'c2', 'c3']);
    // No PII keys anywhere in the payload.
    const blob = JSON.stringify(data);
    expect(blob).not.toContain('owner');
    expect(blob).not.toContain('email');
    expect(blob).not.toContain('storagePath');

    expect(await share.loadPublicShare('NOPENOPENOPE')).toBeNull();
  });
});

describe('voting — idempotent per visitor + concept validation', () => {
  test('a forged concept_key is rejected', async () => {
    const res = await share.recordConceptVote({
      token: aToken,
      conceptKey: 'not-a-real-concept',
      voterToken: 'visitor-x',
    });
    expect(res).toEqual({ ok: false, reason: 'invalid_concept' });
  });

  test('one visitor = one ballot; re-voting moves it, never stacks', async () => {
    const first = await share.recordConceptVote({
      token: aToken,
      conceptKey: 'c1',
      voterToken: 'visitor-1',
    });
    expect(first.ok).toBe(true);

    // Same visitor moves their vote to c2 — total stays 1.
    const moved = await share.recordConceptVote({
      token: aToken,
      conceptKey: 'c2',
      voterToken: 'visitor-1',
    });
    expect(moved.ok && moved.totalVotes).toBe(1);

    // A second visitor adds a ballot — total is now 2.
    const second = await share.recordConceptVote({
      token: aToken,
      conceptKey: 'c2',
      voterToken: 'visitor-2',
    });
    expect(second.ok && second.totalVotes).toBe(2);
  });
});

describe('concept_votes — sealed ballot box (app_user has zero access)', () => {
  test('the project owner cannot read votes via the app_user connection', async () => {
    // app_user's grants on concept_votes are REVOKED (auth_rls.sql), not merely
    // RLS-filtered — so the read is denied at the GRANT level (a permission error),
    // a strictly stronger seal than an empty result set.
    await expect(
      withUser(aId, (db) => db.conceptVote.findMany({ where: { projectId: aProjectId } })),
    ).rejects.toThrow(/permission denied/i);
  });

  test('app_user cannot INSERT a vote (no ballot stuffing through the app role)', async () => {
    let inserted = false;
    try {
      await withUser(aId, (db) =>
        db.conceptVote.create({
          data: { projectId: aProjectId, conceptKey: 'c1', voterToken: 'app-user-forced' },
        }),
      );
      inserted = true;
    } catch {
      // RLS WITH CHECK / revoked grant → rejected (the expected outcome)
    }
    expect(inserted).toBe(false);
  });

  test('the real tally (read by the system loader) is unaffected by the app_user attempts', async () => {
    const data = (await share.loadPublicShare(aToken))!;
    expect(data.totalVotes).toBe(2);
  });
});

describe('share token is view+vote ONLY — never project-claim/transfer authority (GH-012)', () => {
  test('holding the token yields no ownership and its only write path cannot transfer the project', async () => {
    // projects.transfer_token was spec'd for project transfer but is reused purely
    // as the public share token (share.ts capability-creep note). Lock the boundary:
    // the public surface exposes NO owner identity (the precondition for a claim),
    // and the token's single mutation (a vote) never changes who owns the project.
    const before = await withSystem((db) =>
      db.project.findUnique({
        where: { id: aProjectId },
        select: { ownerUserId: true, transferToken: true },
      }),
    );
    expect(before?.ownerUserId).toBe(aId);
    expect(before?.transferToken).toBe(aToken);

    // The public payload never carries the owner id — a token holder can't even
    // learn who to claim from, let alone become the owner.
    const payload = (await share.loadPublicShare(aToken))!;
    expect(JSON.stringify(payload)).not.toContain(aId);
    expect((payload as Record<string, unknown>).ownerUserId).toBeUndefined();

    // Exercise the token's ONLY write path; it must not touch ownership/transfer.
    await share.recordConceptVote({ token: aToken, conceptKey: 'c1', voterToken: 'visitor-3' });

    const after = await withSystem((db) =>
      db.project.findUnique({
        where: { id: aProjectId },
        select: { ownerUserId: true, transferToken: true },
      }),
    );
    expect(after?.ownerUserId).toBe(aId); // owner unchanged by token use
    expect(after?.transferToken).toBe(aToken); // token not consumed/rotated into a transfer
  });
});
