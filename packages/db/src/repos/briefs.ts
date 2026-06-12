// Design-brief repository (Goal 5 / B2C-002). All paths run on the withUser
// connection — RLS anchors every row to the parent project's owner. `data` is
// opaque JSONB here; shape validation lives at the app layer
// (apps/web/lib/brief/schema.ts), mirroring the canvas_state pattern.

import type { Prisma } from '@prisma/client';
import { withUser } from '../client.js';

export type BriefRow = {
  id: string;
  projectId: string;
  data: unknown;
  rev: number;
  currentStep: string | null;
  updatedAt: Date;
};

export type BriefSaveResult =
  | { ok: true; rev: number }
  | { ok: false; reason: 'stale' | 'not_found' };

export type BriefSnapshotResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'not_found' };

const BRIEF_SELECT = {
  id: true,
  projectId: true,
  data: true,
  rev: true,
  currentStep: true,
  updatedAt: true,
} as const;

// Load the project's brief, creating an empty one on first visit. The create
// runs under RLS: WITH CHECK rejects it unless the caller owns the project, so
// a guessed foreign projectId 404s instead of planting a brief.
// Read-only fetch — for surfaces (e.g. the export GET) that must not insert.
export async function getBrief(userId: string, projectId: string): Promise<BriefRow | null> {
  return withUser(userId, async (db) => {
    const row = await db.designBrief.findUnique({ where: { projectId }, select: BRIEF_SELECT });
    return (row as BriefRow | null) ?? null;
  });
}

export async function getOrCreateBrief(
  userId: string,
  projectId: string,
): Promise<BriefRow | null> {
  return withUser(userId, async (db) => {
    const existing = await db.designBrief.findUnique({
      where: { projectId },
      select: BRIEF_SELECT,
    });
    if (existing) return existing as BriefRow;

    const project = await db.project.findUnique({ where: { id: projectId }, select: { id: true } });
    if (!project) return null;

    try {
      return (await db.designBrief.create({
        data: { projectId, ownerUserId: userId },
        select: BRIEF_SELECT,
      })) as BriefRow;
    } catch {
      // Unique-violation race (two tabs creating simultaneously): the loser
      // re-reads the winner's row.
      const raced = await db.designBrief.findUnique({
        where: { projectId },
        select: BRIEF_SELECT,
      });
      return raced as BriefRow | null;
    }
  });
}

// Per-step autosave target. Optimistic concurrency on rev, identical to
// saveWorkingCanvas: a stale client reloads rather than clobbering.
export async function saveBrief(
  userId: string,
  input: {
    briefId: string;
    expectedRev: number;
    data: Prisma.InputJsonValue;
    currentStep?: string | null;
  },
): Promise<BriefSaveResult> {
  return withUser(userId, async (db) => {
    const updated = await db.designBrief.updateMany({
      where: { id: input.briefId, rev: input.expectedRev },
      data: {
        data: input.data,
        rev: { increment: 1 },
        ...(input.currentStep !== undefined ? { currentStep: input.currentStep } : {}),
      },
    });
    if (updated.count === 1) return { ok: true, rev: input.expectedRev + 1 };

    const exists = await db.designBrief.findUnique({
      where: { id: input.briefId },
      select: { id: true },
    });
    return { ok: false, reason: exists ? 'stale' : 'not_found' };
  });
}

// Freeze the current brief data as the next numbered snapshot ("Save brief" on
// the Review step today; before each generation run in Phase 2).
export async function snapshotBrief(
  userId: string,
  briefId: string,
  label: string,
): Promise<BriefSnapshotResult> {
  return withUser(userId, async (db) => {
    const brief = await db.designBrief.findUnique({
      where: { id: briefId },
      select: { id: true, data: true },
    });
    if (!brief) return { ok: false, reason: 'not_found' };

    // Two concurrent saves can compute the same next version; the
    // (brief_id, version) unique constraint rejects the loser, who re-reads
    // and retries once (review finding, PR #120 — single-editor model makes
    // a second collision practically impossible).
    for (let attempt = 0; attempt < 2; attempt++) {
      const last = await db.briefSnapshot.findFirst({
        where: { briefId },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const version = (last?.version ?? 0) + 1;
      try {
        await db.briefSnapshot.create({
          data: { briefId, version, data: brief.data as Prisma.InputJsonValue, label },
        });
        return { ok: true, version };
      } catch (error) {
        const isUniqueViolation =
          typeof error === 'object' &&
          error !== null &&
          (error as { code?: string }).code === 'P2002';
        if (!isUniqueViolation || attempt === 1) throw error;
      }
    }
    // Unreachable: the loop either returns or throws.
    return { ok: false, reason: 'not_found' };
  });
}

export type BriefSnapshotRow = {
  briefId: string;
  version: number;
  data: unknown;
  label: string | null;
  createdAt: Date;
};

// Load one frozen snapshot by version (the generation pipeline renders FROM
// the snapshot a run was started against, never the live brief — provenance).
export async function getBriefSnapshot(
  userId: string,
  briefId: string,
  version: number,
): Promise<BriefSnapshotRow | null> {
  return withUser(userId, (db) =>
    db.briefSnapshot.findUnique({
      where: { briefId_version: { briefId, version } },
      select: { briefId: true, version: true, data: true, label: true, createdAt: true },
    }),
  );
}

export async function listBriefSnapshots(
  userId: string,
  briefId: string,
): Promise<Array<{ version: number; label: string | null; createdAt: Date }>> {
  return withUser(userId, (db) =>
    db.briefSnapshot.findMany({
      where: { briefId },
      orderBy: { version: 'desc' },
      select: { version: true, label: true, createdAt: true },
    }),
  );
}
