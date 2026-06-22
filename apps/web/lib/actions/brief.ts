'use server';

// Brief wizard server actions (Goal 5 / B2C-002). RPC-style like
// saveCanvasAction: Next's Server-Action origin check + requireUser + RLS (the
// brief row is only writable by the project owner). Client JSON never reaches
// the JSONB column unvalidated — parseBriefData is the boundary.

import { briefs, projects } from '@alphawolf/db';
import { requireUser } from '../admin/guard';
import { parseBriefData } from '../brief/schema';
import { captureServerEvent } from '../notifications/posthog-server';

const MAX_BRIEF_PHOTOS = 12; // mirrors briefSchema photos.max

export type SaveBriefResult =
  | { ok: true; rev: number }
  | { ok: false; reason: 'stale' | 'not_found' | 'invalid_brief' };

export async function saveBriefAction(input: {
  projectId: string;
  briefId: string;
  expectedRev: number;
  data: unknown;
  currentStep?: string;
}): Promise<SaveBriefResult> {
  const user = await requireUser(`/projects/${input.projectId}/brief`);

  const parsed = parseBriefData(input.data);
  if (!parsed.ok) return { ok: false, reason: 'invalid_brief' };

  const res = await briefs.saveBrief(user.id, {
    briefId: input.briefId,
    expectedRev: input.expectedRev,
    data: parsed.data,
    currentStep: typeof input.currentStep === 'string' ? input.currentStep.slice(0, 40) : undefined,
  });
  return res;
}

// ---------------------------------------------------------------------------
// Goal 21 T7: append a vehicle photo to the brief from the generation studio.
// Lets a customer who skipped the brief's photo step still feed an on-photo
// render. Owner-scoped (requireUser + RLS on the brief + asset ownership);
// deduped and capped exactly like PhotosStep.
// ---------------------------------------------------------------------------

export type AddProjectPhotoResult =
  | { ok: true; rev: number; count: number }
  | { ok: false; reason: 'not_found' | 'invalid_brief' | 'stale' | 'full' };

export async function addProjectPhotoAction(input: {
  projectId: string;
  assetId: string;
}): Promise<AddProjectPhotoResult> {
  const user = await requireUser(`/projects/${input.projectId}/generate`);

  if (typeof input.assetId !== 'string' || input.assetId.length === 0) {
    return { ok: false, reason: 'invalid_brief' };
  }

  // Asset must exist and belong to THIS project (RLS-scoped read).
  const asset = await projects.getAsset(user.id, input.assetId);
  if (!asset || asset.projectId !== input.projectId) return { ok: false, reason: 'not_found' };

  const brief = await briefs.getBrief(user.id, input.projectId);
  if (!brief) return { ok: false, reason: 'not_found' };

  const parsed = parseBriefData(brief.data ?? {});
  if (!parsed.ok) return { ok: false, reason: 'invalid_brief' };

  const existing = parsed.data.photos ?? [];
  if (existing.some((p) => p.assetId === input.assetId)) {
    // Already present: a successful no-op so the client stays in sync.
    return { ok: true, rev: brief.rev, count: existing.length };
  }
  if (existing.length >= MAX_BRIEF_PHOTOS) return { ok: false, reason: 'full' };

  const nextData = { ...parsed.data, photos: [...existing, { assetId: input.assetId }] };
  const reparsed = parseBriefData(nextData);
  if (!reparsed.ok) return { ok: false, reason: 'invalid_brief' };

  const res = await briefs.saveBrief(user.id, {
    briefId: brief.id,
    expectedRev: brief.rev,
    data: reparsed.data,
  });
  if (!res.ok) return { ok: false, reason: res.reason };
  return { ok: true, rev: res.rev, count: existing.length + 1 };
}

export type SnapshotBriefResult =
  | { ok: true; version: number }
  | { ok: false; reason: 'not_found' };

// "Save brief" on the Review step: freeze the current data as a numbered,
// immutable version. Phase 2's Generate button calls the same path with
// label 'generation_run' so every concept stays traceable to its brief.
export async function snapshotBriefAction(input: {
  projectId: string;
  briefId: string;
}): Promise<SnapshotBriefResult> {
  const user = await requireUser(`/projects/${input.projectId}/brief`);
  const res = await briefs.snapshotBrief(user.id, input.briefId, 'review_save');
  if (res.ok) {
    await captureServerEvent('brief_saved', user.id, {
      projectId: input.projectId,
      briefVersion: res.version,
    });
  }
  return res;
}
