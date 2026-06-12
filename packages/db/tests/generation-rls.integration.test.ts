// Integration test: proves the Goal 7 generation data layer + money rails
// (D4/D7) on the authenticated (withUser → app_user) connection.
//
// Same harness as briefs-rls / credits-rls. Runs against the REAL Supabase dev
// DB, excluded from the unit run:
//   pnpm --filter @alphawolf/db db:migrate        # both 202606122000* migrations
//   pnpm --filter @alphawolf/db db:apply-sql      # generation RLS + definer fns
//   pnpm --filter @alphawolf/db test:integration
//
// The proof: runs are invisible + unplantable cross-user; images are immutable
// even for their owner; credit_ledger INSERT stays denied to app_user;
// app_spend_credits debits atomically, fails closed on insufficient balance,
// and the per-run partial unique blocks a double-spend; app_refund_credits is
// idempotent (second call returns false) and works GUC-less from the system
// sweeper; the spend-sign CHECK rejects a positive 'spend' row.
//
// Review-fix proofs (PR #148 round 1): cross-user job/image INSERTs into a
// foreign run are denied by WITH CHECK; the lineage CHECKs reject finals/
// iterations without a parent; an UPDATE cannot re-point a run at a foreign
// project; a forged parent_run_id pointing at another tenant's run is denied;
// app_refund_credits refuses while the run is non-terminal.

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { _resetClientForTests, withSystem, withUser } from '../src/client';
import { emailLookupHash } from '../src/crypto';
import { createUser } from '../src/repos/users';
import * as credits from '../src/repos/credits';
import * as generation from '../src/repos/generation';
import { CREDIT_CONFIG } from '../src/credit-config';

const EMAIL_A = 'alpha-generation-owner@test.alphawolf.example';
const EMAIL_B = 'alpha-generation-other@test.alphawolf.example';
const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';
const GRANT = CREDIT_CONFIG.signupGrant;

let aId: string;
let bId: string;
let aProjectId: string;
let bProjectId: string;
let aRunId: string;

function runInput(
  overrides: Partial<generation.StartRunInput> & { clientToken: string },
): generation.StartRunInput {
  return {
    projectId: aProjectId,
    kind: 'initial',
    briefVersion: 1,
    estimatedCostUsd: 0.5,
    creditCost: 1,
    provider: 'mock',
    model: 'mock-v1',
    deadlineAt: new Date(Date.now() + 15 * 60_000),
    ...overrides,
  };
}

async function deleteFixtureUser(email: string): Promise<void> {
  await withSystem(async (db) => {
    const hash = await emailLookupHash(db, email);
    const users = await db.user.findMany({ where: { emailLowerHash: hash }, select: { id: true } });
    for (const u of users) {
      // Cascades generation_runs (project FK) → jobs → images.
      await db.project.deleteMany({ where: { ownerUserId: u.id } });
    }
    // Cascades credit_ledger + any remaining runs (user FK).
    await db.user.deleteMany({ where: { emailLowerHash: hash } });
  });
}

beforeAll(async () => {
  if (!process.env.DATABASE_URL_APP) {
    throw new Error(
      'generation-rls.integration: DATABASE_URL_APP (the app_user role) must be set.',
    );
  }
  await Promise.all([deleteFixtureUser(EMAIL_A), deleteFixtureUser(EMAIL_B)]);

  const [a, b] = await Promise.all([
    createUser({
      email: EMAIL_A,
      firstName: 'Gen',
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

  [aProjectId, bProjectId] = await withSystem(async (db) => {
    const pa = await db.project.create({
      data: { ownerUserId: aId, vehicleId: SEEDED_VEHICLE_ID, name: 'RLS generation project A' },
      select: { id: true },
    });
    const pb = await db.project.create({
      data: { ownerUserId: bId, vehicleId: SEEDED_VEHICLE_ID, name: 'RLS generation project B' },
      select: { id: true },
    });
    return [pa.id, pb.id];
  });

  await credits.grantSignupCredits(aId); // A starts with GRANT credits; B with 0
});

afterAll(async () => {
  await Promise.all([deleteFixtureUser(EMAIL_A), deleteFixtureUser(EMAIL_B)]);
  await _resetClientForTests();
});

describe('generation runs — ownership, idempotent start, atomic spend', () => {
  test('startRun creates the run AND debits exactly one credit atomically', async () => {
    const before = await generation.getRunContext(aId, aProjectId);
    expect(before).toMatchObject({ balance: GRANT, runsThisMonth: 0, activeRunId: null });

    const result = await generation.startRun(aId, runInput({ clientToken: 'tok-run-1' }));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.deduped).toBe(false);
    expect(result.run).toMatchObject({ kind: 'initial', status: 'queued', costUsd: 0.5 });
    aRunId = result.run.id;

    expect(await credits.getCreditBalance(aId)).toBe(GRANT - 1);
    const after = await generation.getRunContext(aId, aProjectId);
    expect(after).toMatchObject({ runsThisMonth: 1, activeRunId: aRunId });
  });

  test('clientToken replay returns the EXISTING run and spends nothing twice', async () => {
    const replay = await generation.startRun(aId, runInput({ clientToken: 'tok-run-1' }));
    expect(replay.ok).toBe(true);
    if (!replay.ok) return;
    expect(replay.deduped).toBe(true);
    expect(replay.run.id).toBe(aRunId);
    expect(await credits.getCreditBalance(aId)).toBe(GRANT - 1);
  });

  test('one non-terminal run per project+kind (partial unique)', async () => {
    const second = await generation.startRun(aId, runInput({ clientToken: 'tok-run-2' }));
    expect(second).toEqual({ ok: false, reason: 'active_run_exists' });
    // The rolled-back insert spent nothing.
    expect(await credits.getCreditBalance(aId)).toBe(GRANT - 1);
  });

  test('cross-user: B sees nothing and cannot plant a run on A’s project', async () => {
    const crossRead = await withUser(bId, (db) =>
      db.generationRun.findMany({ where: { projectId: aProjectId } }),
    );
    expect(crossRead).toHaveLength(0);
    expect(await generation.getRun(bId, aRunId)).toBeNull();

    // user_id GUC-forged insert: B claims A's project (WITH CHECK rejects).
    const planted = await generation.startRun(
      bId,
      runInput({ clientToken: 'tok-b-plant', creditCost: 0 }),
    );
    expect(planted).toEqual({ ok: false, reason: 'project_not_found' });
  });

  test('double-spend for the same run is blocked by the per-run partial unique', async () => {
    await expect(
      withUser(aId, (db) =>
        db.$queryRawUnsafe(`SELECT app_spend_credits('${aRunId}'::uuid, 1, 'generation_run')`),
      ),
    ).rejects.toThrow(/spend_once_per_run|duplicate key|already exists|23505/i);
    expect(await credits.getCreditBalance(aId)).toBe(GRANT - 1);
  });

  test('monthly gate: limit reached inside the startRun transaction', async () => {
    // A already has 1 initial run this month; a limit of 1 must refuse.
    const gated = await generation.startRun(
      aId,
      runInput({ clientToken: 'tok-gated', monthlyRunLimit: 1 }),
    );
    expect(gated).toEqual({ ok: false, reason: 'monthly_runs' });
  });
});

describe('generation jobs + images — resubmit guard and immutability', () => {
  let jobId: string;

  test('recordJobs is idempotent on (run, concept, view)', async () => {
    const first = await generation.recordJobs(aId, aRunId, [
      { conceptKey: 'c1', view: 'driver', prompt: 'p' },
      { conceptKey: 'c1', view: 'front', prompt: 'p' },
    ]);
    expect(first).toBe(2);
    const again = await generation.recordJobs(aId, aRunId, [
      { conceptKey: 'c1', view: 'driver', prompt: 'p' },
    ]);
    expect(again).toBe(0); // skipDuplicates: a resumed slice re-records nothing

    const jobs = await generation.listJobs(aId, aRunId);
    expect(jobs).toHaveLength(2);
    jobId = jobs[0].id;
  });

  test('markJobSubmitted persists the provider id ONCE (resubmit guard)', async () => {
    // PR #150 F2: a job must be CLAIMED (pending→submitting) before the
    // provider call; markJobSubmitted then CASes submitting→submitted.
    expect(await generation.claimJob(aId, jobId)).toBe(true);
    expect(await generation.claimJob(aId, jobId)).toBe(false); // claim is exclusive
    expect(await generation.markJobSubmitted(aId, jobId, 'fal-req-1', 0.04)).toBe(true);
    // Second submit attempt: provider_request_id is no longer NULL → no-op.
    expect(await generation.markJobSubmitted(aId, jobId, 'fal-req-2', 0.04)).toBe(false);

    const jobs = await generation.listJobs(aId, aRunId);
    const submitted = jobs.find((j) => j.id === jobId);
    expect(submitted).toMatchObject({ status: 'submitted', providerRequestId: 'fal-req-1' });
  });

  test('images: owner inserts + reads; UPDATE/DELETE denied even for the owner', async () => {
    expect(await generation.completeJob(aId, jobId, { costUsd: 0.04 })).toBe(true);
    const image = await generation.insertImage(aId, {
      runId: aRunId,
      jobId,
      conceptKey: 'c1',
      view: 'driver',
      storagePath: 'generated/a/run1/c1-driver.png',
      previewPath: 'generated/a/run1/c1-driver-preview.png',
      width: 1024,
      height: 768,
      provider: 'mock',
      model: 'mock-v1',
      providerRequestId: 'fal-req-1',
      costUsd: 0.04,
      provenance: { seed: 42 },
    });

    // B reads nothing through the run-owner join policy.
    const crossRead = await withUser(bId, (db) =>
      db.generationImage.findMany({ where: { runId: aRunId } }),
    );
    expect(crossRead).toHaveLength(0);

    // Even the OWNER cannot rewrite or erase provenance (brief_snapshots shape).
    let updated = 0;
    try {
      const res = await withUser(aId, (db) =>
        db.generationImage.updateMany({
          where: { id: image.id },
          data: { storagePath: 'rewritten.png' },
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
        db.generationImage.deleteMany({ where: { id: image.id } }),
      );
      deleted = res.count;
    } catch {
      // ditto
    }
    expect(deleted).toBe(0);

    const stillThere = await generation.listRunsForProject(aId, aProjectId);
    expect(stillThere[0].images).toHaveLength(1);
    expect(stillThere[0].images[0].storagePath).toBe('generated/a/run1/c1-driver.png');
  });

  test('runs are audit records: owner DELETE is denied', async () => {
    let deleted = 0;
    try {
      const res = await withUser(aId, (db) =>
        db.generationRun.deleteMany({ where: { id: aRunId } }),
      );
      deleted = res.count;
    } catch {
      // revoked grant → permission denied is acceptable (stronger)
    }
    expect(deleted).toBe(0);
    expect(await generation.getRun(aId, aRunId)).not.toBeNull();
  });
});

describe('money rails — refund idempotency, ledger lockout, sign CHECK', () => {
  test('failRun fails the run, stamps completed_at, and refunds exactly once', async () => {
    const failed = await generation.failRun(aId, aRunId, 'provider exploded');
    expect(failed).toEqual({ failed: true, refunded: true });
    expect(await credits.getCreditBalance(aId)).toBe(GRANT); // made whole

    const run = await generation.getRun(aId, aRunId);
    expect(run).toMatchObject({ status: 'failed', error: 'provider exploded' });
    expect(run?.completedAt).not.toBeNull();

    // Second refund attempt (direct, as the sweeper would race): no-op.
    const again = await withUser(aId, (db) =>
      db.$queryRawUnsafe<Array<{ refunded: boolean }>>(
        `SELECT app_refund_credits('${aRunId}'::uuid) AS refunded`,
      ),
    );
    expect(again[0].refunded).toBe(false);
    expect(await credits.getCreditBalance(aId)).toBe(GRANT);

    // failRun on a terminal run is a no-op too.
    expect(await generation.failRun(aId, aRunId, 'again')).toEqual({
      failed: false,
      refunded: false,
    });
  });

  test('insufficient balance rolls back the whole start (no run, no spend)', async () => {
    const result = await generation.startRun(
      aId,
      runInput({ clientToken: 'tok-too-rich', creditCost: 10_000 }),
    );
    expect(result).toEqual({ ok: false, reason: 'insufficient_credits' });
    expect(await credits.getCreditBalance(aId)).toBe(GRANT);
    const orphan = await withUser(aId, (db) =>
      db.generationRun.findFirst({ where: { clientToken: 'tok-too-rich' } }),
    );
    expect(orphan).toBeNull();
  });

  test('credit_ledger INSERT is still denied to app_user (no self-minting)', async () => {
    await expect(
      withUser(aId, (db) =>
        db.creditLedger.create({
          data: { userId: aId, delta: 1_000_000, source: 'refund', reason: 'exploit' },
        }),
      ),
    ).rejects.toThrow();
    expect(await credits.getCreditBalance(aId)).toBe(GRANT);
  });

  test('CHECK rejects a positive spend even on the system connection', async () => {
    await expect(
      withSystem((db) =>
        db.creditLedger.create({
          data: { userId: aId, delta: 5, source: 'spend', reason: 'sign-violation' },
        }),
      ),
    ).rejects.toThrow(/chk_credit_ledger_spend_sign|check constraint/i);
  });

  test('sweeper fails + refunds a stale run GUC-less (system maintenance path)', async () => {
    await withSystem(async (db) => {
      await db.creditLedger.create({
        data: { userId: bId, delta: 2, source: 'grant', reason: 'sweep-fixture' },
      });
    });
    const started = await generation.startRun(
      bId,
      runInput({
        projectId: bProjectId,
        clientToken: 'tok-b-stale',
        deadlineAt: new Date(Date.now() - 60_000), // already past deadline
      }),
    );
    expect(started.ok).toBe(true);
    expect(await credits.getCreditBalance(bId)).toBe(1);

    const swept = await generation.sweepStaleRuns(15);
    expect(swept).toBeGreaterThanOrEqual(1);

    expect(await credits.getCreditBalance(bId)).toBe(2); // refunded by the sweeper
    if (started.ok) {
      const run = await generation.getRun(bId, started.run.id);
      expect(run?.status).toBe('failed');
    }
  });

  test('spendToday sees the GLOBAL estimated spend through the definer fn', async () => {
    // A's failed run (0.5 est) + B's swept run (0.5 est) were created today.
    const viaUser = await generation.spendToday(aId);
    const viaSystem = await generation.spendTodaySystem();
    expect(viaUser).toBeGreaterThanOrEqual(1);
    expect(viaSystem).toBeGreaterThanOrEqual(1);
  });
});

describe('review fixes — lineage CHECKs, parent ownership, terminal refund guard', () => {
  // By this point: aRunId is failed (terminal) with 2 jobs; A's balance is
  // GRANT; B owns bProjectId with a swept (failed) run and a balance of 2.

  test('B cannot insert a JOB into A’s run (WITH CHECK on the run-owner join)', async () => {
    await expect(
      generation.recordJobs(bId, aRunId, [{ conceptKey: 'cx', view: 'rear', prompt: 'forged' }]),
    ).rejects.toThrow(/row-level security/i);
    expect(await generation.listJobs(aId, aRunId)).toHaveLength(2); // unchanged
  });

  test('B cannot insert an IMAGE into A’s run (WITH CHECK on the run-owner join)', async () => {
    const [job] = await generation.listJobs(aId, aRunId);
    await expect(
      generation.insertImage(bId, {
        runId: aRunId,
        jobId: job.id,
        conceptKey: 'c1',
        view: 'driver',
        storagePath: 'generated/b/forged.png',
        width: 1,
        height: 1,
        provider: 'mock',
        model: 'mock-v1',
        costUsd: 0,
      }),
    ).rejects.toThrow(/row-level security/i);
  });

  test('final-lineage CHECK rejects kind=final without parent/concept', async () => {
    await expect(
      generation.startRun(
        aId,
        runInput({ clientToken: 'tok-bad-final', kind: 'final', creditCost: 0 }),
      ),
    ).rejects.toThrow(/chk_generation_runs_final_lineage|constraint/i);
  });

  test('iteration-lineage CHECK rejects kind=iteration without a parent', async () => {
    await expect(
      generation.startRun(
        aId,
        runInput({ clientToken: 'tok-bad-iter', kind: 'iteration', creditCost: 0 }),
      ),
    ).rejects.toThrow(/chk_generation_runs_iteration_lineage|constraint/i);
  });

  test('UPDATE cannot re-point a run at a foreign project (WITH CHECK)', async () => {
    await expect(
      withUser(aId, (db) =>
        db.generationRun.updateMany({ where: { id: aRunId }, data: { projectId: bProjectId } }),
      ),
    ).rejects.toThrow(/row-level security/i);
    const run = await generation.getRun(aId, aRunId);
    expect(run?.projectId).toBe(aProjectId); // unchanged
  });

  test('B cannot attach parent_run_id = A’s run (parent-ownership WITH CHECK)', async () => {
    const forged = await generation.startRun(
      bId,
      runInput({
        projectId: bProjectId,
        clientToken: 'tok-b-parent-forge',
        kind: 'iteration',
        parentRunId: aRunId,
        conceptKey: 'c1',
        creditCost: 0,
      }),
    );
    // RLS WITH CHECK rejection maps to the same typed result as a foreign
    // project — indistinguishable by design.
    expect(forged).toEqual({ ok: false, reason: 'project_not_found' });
  });

  test('startRun throws on a negative estimatedCostUsd (caller bug, not a typed result)', async () => {
    await expect(
      generation.startRun(
        aId,
        runInput({ clientToken: 'tok-negative', estimatedCostUsd: -1, creditCost: 0 }),
      ),
    ).rejects.toThrow(/estimatedCostUsd must be >= 0/);
  });

  test('app_refund_credits refuses while the run is still in flight', async () => {
    const started = await generation.startRun(
      bId,
      runInput({ projectId: bProjectId, clientToken: 'tok-b-inflight', creditCost: 1 }),
    );
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(await credits.getCreditBalance(bId)).toBe(1);

    // Direct refund attempt on the queued (non-terminal) run: the definer fn
    // refuses — only failed runs are refundable.
    await expect(
      withUser(bId, (db) =>
        db.$queryRawUnsafe(`SELECT app_refund_credits('${started.run.id}'::uuid)`),
      ),
    ).rejects.toThrow(/not in a terminal failed status/i);
    expect(await credits.getCreditBalance(bId)).toBe(1); // nothing refunded

    // failRun CASes to failed THEN refunds in the same tx — still works.
    expect(await generation.failRun(bId, started.run.id, 'cleanup')).toEqual({
      failed: true,
      refunded: true,
    });
    expect(await credits.getCreditBalance(bId)).toBe(2);
  });
});
