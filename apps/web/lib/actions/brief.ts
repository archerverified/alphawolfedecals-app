'use server';

// Brief wizard server actions (Goal 5 / B2C-002). RPC-style like
// saveCanvasAction: Next's Server-Action origin check + requireUser + RLS (the
// brief row is only writable by the project owner). Client JSON never reaches
// the JSONB column unvalidated — parseBriefData is the boundary.

import { briefs } from '@alphawolf/db';
import { requireUser } from '../admin/guard';
import { parseBriefData } from '../brief/schema';
import { captureServerEvent } from '../notifications/posthog-server';

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
