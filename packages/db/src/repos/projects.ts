// Customer project + canvas-version + uploaded-asset repository (GH-005 / GH-008).
//
// All access is per-user and RLS-enforced: every function runs under
// withUser(userId), so the policies in prisma/sql/auth_rls.sql scope rows to the
// session user. Never expose the Prisma client; callers get plain row objects.
//
// canvas_state is treated as OPAQUE JSON here (Prisma.JsonValue in / InputJsonValue
// out). This repo deliberately does NOT depend on @alphawolf/canvas — the apps/web
// Server Action runs the canvas migrate/validate round-trip before any JSON reaches
// the DB (ADR-0006 §4), so the geometry package never gets dragged into the server
// bundle.
//
// Persistence model (ADR-0006 §4): each project has exactly one mutable "working"
// project_versions row (approval_state='working', the highest version). Debounced
// autosave UPDATEs it with optimistic `rev` concurrency for single-editor
// last-write-wins. A milestone freezes the working row (submitted/approved/rejected)
// and clones a fresh working row forward at version+1.

import { Prisma } from '@prisma/client';
import type { ProjectStatus, ApprovalState, AssetParseStatus } from '@prisma/client';
import { withUser } from '../client.js';

export type { ProjectStatus, ApprovalState, AssetParseStatus };

export type ProjectRow = {
  id: string;
  ownerUserId: string;
  ownerShopId: string | null;
  vehicleId: string;
  name: string;
  status: ProjectStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type WorkingVersionRow = {
  id: string;
  projectId: string;
  version: number;
  canvasState: Prisma.JsonValue;
  approvalState: ApprovalState;
  rev: number;
  updatedAt: Date;
};

export type AssetRow = {
  assetId: string;
  projectId: string;
  mimeType: string;
  sourceUrl: string;
  parsedUrl: string | null;
  parseStatus: AssetParseStatus;
  parseMetadata: Prisma.JsonValue | null;
  version: number;
};

const PROJECT_SELECT = {
  id: true,
  ownerUserId: true,
  ownerShopId: true,
  vehicleId: true,
  name: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ProjectSelect;

const WORKING_VERSION_SELECT = {
  id: true,
  projectId: true,
  version: true,
  canvasState: true,
  approvalState: true,
  rev: true,
  updatedAt: true,
} satisfies Prisma.ProjectVersionSelect;

// ----------------------------------------------------------------------------
// Projects
// ----------------------------------------------------------------------------

// Create a project and its initial working version (version 1) atomically. The
// caller passes the already-serialized initial canvas document (an empty doc for
// the chosen vehicle); validation/serialization happens in apps/web.
export function createProject(
  userId: string,
  input: {
    vehicleId: string;
    name: string;
    ownerShopId?: string | null;
    // Plain JSON object (a serialized @alphawolf/canvas document). Cast to Prisma's
    // input JSON type internally so apps/web needn't import @prisma/client.
    initialCanvasState: Record<string, unknown>;
  },
): Promise<{ projectId: string; versionId: string }> {
  return withUser(userId, async (db) => {
    const project = await db.project.create({
      data: {
        ownerUserId: userId,
        ownerShopId: input.ownerShopId ?? null,
        vehicleId: input.vehicleId,
        name: input.name,
        status: 'draft',
        versions: {
          create: {
            version: 1,
            canvasState: input.initialCanvasState as unknown as Prisma.InputJsonValue,
            approvalState: 'working',
            rev: 0,
          },
        },
      },
      select: { id: true, versions: { select: { id: true } } },
    });
    const versionId = project.versions[0]?.id;
    if (!versionId) throw new Error('[db] createProject: initial version not created');
    return { projectId: project.id, versionId };
  });
}

export function getProject(userId: string, projectId: string): Promise<ProjectRow | null> {
  return withUser(userId, async (db) => {
    return db.project.findUnique({ where: { id: projectId }, select: PROJECT_SELECT });
  });
}

// Active (non-deleted) projects, newest first. RLS already scopes to the owner.
export function listProjects(userId: string): Promise<ProjectRow[]> {
  return withUser(userId, async (db) => {
    return db.project.findMany({
      where: { status: { not: 'deleted' } },
      select: PROJECT_SELECT,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  });
}

export function renameProject(userId: string, projectId: string, name: string): Promise<void> {
  return withUser(userId, async (db) => {
    await db.project.updateMany({ where: { id: projectId }, data: { name } });
  });
}

// Soft delete: status='deleted' + deletedAt stamp drives the 30-day recovery
// window (PRD §8.2). RLS keeps the row readable by its owner so recovery works.
export function softDeleteProject(userId: string, projectId: string): Promise<void> {
  return withUser(userId, async (db) => {
    await db.project.updateMany({
      where: { id: projectId },
      data: { status: 'deleted', deletedAt: new Date() },
    });
  });
}

// ----------------------------------------------------------------------------
// Versions
// ----------------------------------------------------------------------------

// The current editable version (highest `version` whose approval_state='working').
export function getWorkingVersion(
  userId: string,
  projectId: string,
): Promise<WorkingVersionRow | null> {
  return withUser(userId, async (db) => {
    return db.projectVersion.findFirst({
      where: { projectId, approvalState: 'working' },
      orderBy: { version: 'desc' },
      select: WORKING_VERSION_SELECT,
    });
  });
}

export type SaveResult =
  | { ok: true; rev: number; updatedAt: Date }
  | { ok: false; reason: 'stale' | 'not_found' };

// Debounced autosave target. Optimistic concurrency: the UPDATE only matches when
// the stored rev equals expectedRev, so a second writer (other tab/device) can't
// silently clobber — it gets `stale` and the client reloads. Distinguishes
// not_found (no such working row) from stale (row exists, rev advanced).
export function saveWorkingCanvas(
  userId: string,
  input: {
    versionId: string;
    expectedRev: number;
    canvasState: Record<string, unknown>;
  },
): Promise<SaveResult> {
  return withUser(userId, async (db) => {
    const result = await db.projectVersion.updateMany({
      where: { id: input.versionId, rev: input.expectedRev, approvalState: 'working' },
      data: {
        canvasState: input.canvasState as unknown as Prisma.InputJsonValue,
        rev: { increment: 1 },
      },
    });
    if (result.count === 1) {
      const row = await db.projectVersion.findUnique({
        where: { id: input.versionId },
        select: { rev: true, updatedAt: true },
      });
      // Row must exist — we just updated it inside this txn.
      return {
        ok: true,
        rev: row?.rev ?? input.expectedRev + 1,
        updatedAt: row?.updatedAt ?? new Date(),
      };
    }
    const exists = await db.projectVersion.findUnique({
      where: { id: input.versionId },
      select: { id: true },
    });
    return { ok: false, reason: exists ? 'stale' : 'not_found' };
  });
}

// Milestone: freeze the current working row to `freezeAs` and clone its canvas
// state forward into a new working row at version+1. Atomic within one withUser
// transaction so a reader never sees zero or two working rows.
export function snapshotVersion(
  userId: string,
  input: { projectId: string; freezeAs: Exclude<ApprovalState, 'working'> },
): Promise<{ frozenVersion: number; newWorkingVersionId: string; newVersion: number }> {
  return withUser(userId, async (db) => {
    const working = await db.projectVersion.findFirst({
      where: { projectId: input.projectId, approvalState: 'working' },
      orderBy: { version: 'desc' },
      select: { id: true, version: true, canvasState: true },
    });
    if (!working) throw new Error('[db] snapshotVersion: no working version to snapshot');

    await db.projectVersion.update({
      where: { id: working.id },
      data: { approvalState: input.freezeAs },
    });

    const newVersion = working.version + 1;
    const created = await db.projectVersion.create({
      data: {
        projectId: input.projectId,
        version: newVersion,
        canvasState: working.canvasState as Prisma.InputJsonValue,
        approvalState: 'working',
        rev: 0,
      },
      select: { id: true },
    });

    return {
      frozenVersion: working.version,
      newWorkingVersionId: created.id,
      newVersion,
    };
  });
}

export function listVersions(
  userId: string,
  projectId: string,
): Promise<Array<{ id: string; version: number; approvalState: ApprovalState; createdAt: Date }>> {
  return withUser(userId, async (db) => {
    return db.projectVersion.findMany({
      where: { projectId },
      select: { id: true, version: true, approvalState: true, createdAt: true },
      orderBy: { version: 'desc' },
    });
  });
}

// ----------------------------------------------------------------------------
// Assets (uploaded source files; parse output is written back by services/parse)
// ----------------------------------------------------------------------------

export function createAsset(
  userId: string,
  input: { assetId?: string; projectId: string; mimeType: string; sourceUrl: string },
): Promise<{ assetId: string }> {
  return withUser(userId, async (db) => {
    const asset = await db.projectAsset.create({
      data: {
        // Caller may pre-generate the id so the storage key can be built before
        // insert (mirrors CreateVehicleInput.id); otherwise the DB default fires.
        ...(input.assetId ? { assetId: input.assetId } : {}),
        projectId: input.projectId,
        ownerUserId: userId,
        mimeType: input.mimeType,
        sourceUrl: input.sourceUrl,
        parseStatus: 'pending',
      },
      select: { assetId: true },
    });
    return { assetId: asset.assetId };
  });
}

export function getAsset(userId: string, assetId: string): Promise<AssetRow | null> {
  return withUser(userId, async (db) => {
    return db.projectAsset.findUnique({
      where: { assetId },
      select: {
        assetId: true,
        projectId: true,
        mimeType: true,
        sourceUrl: true,
        parsedUrl: true,
        parseStatus: true,
        parseMetadata: true,
        version: true,
      },
    });
  });
}

// Worker-side write-back of parse results. parsedUrl is null when status is
// 'failed' or 'queued_missing_cli'. Bumps version so the editor can invalidate
// any cached canvas reference to a now-superseded parse (ADR-0009 version vectors).
export function setAssetParseResult(
  userId: string,
  input: {
    assetId: string;
    parseStatus: AssetParseStatus;
    parsedUrl?: string | null;
    // Plain JSON-serialisable object from the worker (dimensions, bbox, rembg,
    // error, etc.). Cast to Prisma's input JSON type internally so callers
    // outside @alphawolf/db don't need a Prisma dependency.
    parseMetadata?: Record<string, unknown> | null;
  },
): Promise<void> {
  return withUser(userId, async (db) => {
    await db.projectAsset.updateMany({
      where: { assetId: input.assetId },
      data: {
        parseStatus: input.parseStatus,
        parsedUrl: input.parsedUrl ?? null,
        ...(input.parseMetadata !== undefined
          ? {
              parseMetadata:
                input.parseMetadata === null
                  ? Prisma.JsonNull
                  : (input.parseMetadata as unknown as Prisma.InputJsonValue),
            }
          : {}),
        version: { increment: input.parseStatus === 'parsed' ? 1 : 0 },
      },
    });
  });
}

export function listAssets(userId: string, projectId: string): Promise<AssetRow[]> {
  return withUser(userId, async (db) => {
    return db.projectAsset.findMany({
      where: { projectId },
      select: {
        assetId: true,
        projectId: true,
        mimeType: true,
        sourceUrl: true,
        parsedUrl: true,
        parseStatus: true,
        parseMetadata: true,
        version: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  });
}
