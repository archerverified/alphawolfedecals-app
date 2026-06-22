// Share-for-feedback repository (Goal 9 / growth loops). A project's owner mints
// a public share link; unauthenticated visitors view the 3 AI concept directions
// and 👍 one of them.
//
// SECURITY MODEL (the point of this feature):
//   * ensureShareToken runs on the withUser connection — only the project owner
//     can mint/read the token (RLS-scoped). The token reuses the existing
//     projects.transfer_token ("not secret" public handoff token) — no parallel
//     token scheme.
//     CAPABILITY-CREEP NOTE (Goal 9 reviews / for GH-012): transfer_token was
//     spec'd for project transfer but is currently UNUSED by any feature. This
//     feature makes it public-by-distribution (every share link carries it).
//     When GH-012 project transfer is built it MUST NOT treat "holds the token"
//     as authority to claim/transfer a project — transfer needs a separate
//     secret or an authenticated confirmation step. Flagged for the Goal 10
//     audit so the two features don't silently share one capability.
//   * loadPublicShare + recordConceptVote run on the withSystem connection,
//     gated by the token. They return ONLY whitelisted, non-PII columns: the
//     public vehicle label (catalogue data), each concept's key/title/summary,
//     the WATERMARKED preview path (never storage_path), and vote tallies.
//     Owner name/email, the brief, contact details, and the unwatermarked
//     originals never cross this boundary.
//   * concept_votes has no app_user policy (auth_rls.sql) — the system role is
//     the only reader/writer of the ballot box.

import { randomBytes } from 'node:crypto';

import { withSystem, withUser } from '../client.js';

// 12-char base32-ish code, same generator shape as shops.receiveCode. Safe
// against guessing (crypto.randomBytes); unambiguous alphabet (no I/O/0/1).
const SHARE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateShareToken(): string {
  const bytes = randomBytes(12);
  let out = '';
  for (let i = 0; i < 12; i++) {
    out += SHARE_CODE_ALPHABET[bytes[i]! % SHARE_CODE_ALPHABET.length];
  }
  return out;
}

export type ShareConcept = {
  conceptKey: string;
  title: string;
  summary: string;
  /** Bucket-relative path of the WATERMARKED preview; the app resolves a signed
   *  read URL. Null until the concept's images have rendered. */
  previewPath: string | null;
  votes: number;
};

export type PublicShare = {
  projectId: string;
  vehicle: { year: number; make: string; model: string } | null;
  concepts: ShareConcept[];
  totalVotes: number;
};

export type VoteResult =
  | { ok: true; concepts: Array<{ conceptKey: string; votes: number }>; totalVotes: number }
  | { ok: false; reason: 'not_found' | 'invalid_concept' };

export type ShareDirection = { key: string; title: string; summary: string };

// Minimal, defensive parse of the directions JSONB the orchestrator wrote — the
// repo only needs key/title/summary, never the per-view prompts. Never trust the
// round-tripped shape. Exported for unit coverage.
export function parseShareDirections(value: unknown): ShareDirection[] {
  if (typeof value !== 'object' || value === null) return [];
  const directions = (value as Record<string, unknown>).directions;
  if (!Array.isArray(directions)) return [];
  const out: ShareDirection[] = [];
  for (const d of directions) {
    if (typeof d !== 'object' || d === null) continue;
    const dir = d as Record<string, unknown>;
    if (
      typeof dir.key === 'string' &&
      typeof dir.title === 'string' &&
      typeof dir.summary === 'string'
    ) {
      out.push({ key: dir.key, title: dir.title, summary: dir.summary });
    }
  }
  return out;
}

// Pure assembly of the PUBLIC concept payload: the ONLY place the share shape is
// built, so the whitelist (conceptKey/title/summary/previewPath/votes — nothing
// else) is provable in one unit test. No PII, no storage_path.
export function assembleConcepts(
  directions: ShareDirection[],
  previewByConcept: Map<string, string>,
  votesByConcept: Map<string, number>,
): ShareConcept[] {
  return directions.map((d) => ({
    conceptKey: d.key,
    title: d.title,
    summary: d.summary,
    previewPath: previewByConcept.get(d.key) ?? null,
    votes: votesByConcept.get(d.key) ?? 0,
  }));
}

// Mint (or return) the owner-scoped public share token for a project. Lazy: the
// token only exists once the owner decides to share. Race-safe — a guarded
// updateMany means concurrent first-shares converge on a single token.
export async function ensureShareToken(userId: string, projectId: string): Promise<string | null> {
  return withUser(userId, async (db) => {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { id: true, transferToken: true, status: true },
    });
    if (!project || project.status === 'deleted') return null;
    if (project.transferToken) return project.transferToken;

    for (let attempt = 0; attempt < 5; attempt++) {
      const token = generateShareToken();
      // Only claims the token if still unset; loses the race harmlessly.
      const updated = await db.project.updateMany({
        where: { id: projectId, transferToken: null },
        data: { transferToken: token },
      });
      if (updated.count === 1) return token;
      // Lost the race (or a prior attempt set it) — re-read the winner.
      const fresh = await db.project.findUnique({
        where: { id: projectId },
        select: { transferToken: true },
      });
      if (fresh?.transferToken) return fresh.transferToken;
      // Otherwise an astronomically-unlikely token collision; loop and retry.
    }
    throw new Error('[share] could not allocate a unique share token');
  });
}

// Read the project's newest INITIAL run that carries concept directions, with
// just the columns the share view exposes. System connection — token-gated by
// the caller.
async function readShareSource(
  db: Parameters<Parameters<typeof withSystem>[0]>[0],
  projectId: string,
): Promise<{ directions: ShareDirection[]; previewByConcept: Map<string, string> }> {
  const run = await db.generationRun.findFirst({
    where: { projectId, kind: 'initial' },
    orderBy: { createdAt: 'desc' },
    select: {
      directions: true,
      images: {
        // Only the watermarked preview path: the unwatermarked storage_path is
        // never selected, so it can never leak to the public page.
        // render_target='template' ONLY (Goal 21): on-photo renders are derived
        // from the customer's PRIVATE uploaded vehicle photo and must never be
        // published on an unauthenticated share link. The pure assembly below
        // also skips them as a second guard.
        where: { renderTarget: 'template' },
        select: { conceptKey: true, view: true, previewPath: true, renderTarget: true },
        orderBy: { view: 'asc' },
      },
    },
  });
  const directions = parseShareDirections(run?.directions);
  const previewByConcept = previewByConceptFrom(run?.images ?? []);
  return { directions, previewByConcept };
}

// Pure: pick the first watermarked preview per concept for the public share,
// excluding on-photo renders (Goal 21). Exported for unit testing. A photo
// render (render_target='photo' or the PHOTO_VIEW sentinel) is derived from the
// customer's private vehicle photo and must never reach the public share page,
// even if it sorts before the template views.
export function previewByConceptFrom(
  images: Array<{
    conceptKey: string;
    view: string;
    previewPath: string | null;
    renderTarget?: string | null;
  }>,
): Map<string, string> {
  const previewByConcept = new Map<string, string>();
  for (const img of images) {
    if (img.renderTarget === 'photo' || img.view === 'photo') continue;
    if (img.previewPath && !previewByConcept.has(img.conceptKey)) {
      previewByConcept.set(img.conceptKey, img.previewPath);
    }
  }
  return previewByConcept;
}

// Vote count per concept_key for a project. System connection.
async function tallyVotes(
  db: Parameters<Parameters<typeof withSystem>[0]>[0],
  projectId: string,
): Promise<Map<string, number>> {
  const rows = await db.conceptVote.groupBy({
    by: ['conceptKey'],
    where: { projectId },
    _count: { _all: true },
  });
  const out = new Map<string, number>();
  for (const r of rows) out.set(r.conceptKey, r._count._all);
  return out;
}

// Public share payload, scoped by the share token. Returns null for an unknown
// or deleted project. NO PII — see the module security note.
export async function loadPublicShare(token: string): Promise<PublicShare | null> {
  if (!token || token.length > 64) return null;
  return withSystem(async (db) => {
    const project = await db.project.findUnique({
      where: { transferToken: token },
      select: {
        id: true,
        status: true,
        vehicle: { select: { year: true, make: true, model: true } },
      },
    });
    if (!project || project.status === 'deleted') return null;

    const { directions, previewByConcept } = await readShareSource(db, project.id);

    const votesByConcept = await tallyVotes(db, project.id);
    const concepts = assembleConcepts(directions, previewByConcept, votesByConcept);
    const totalVotes = concepts.reduce((sum, c) => sum + c.votes, 0);

    return {
      projectId: project.id,
      vehicle: project.vehicle,
      concepts,
      totalVotes,
    };
  });
}

// Cast or move a visitor's 👍. Idempotent per (project, voter): the unique index
// turns a repeat into an UPDATE (move the vote), never a second ballot. Validates
// the concept_key against the project's real directions so a forged key can't
// pollute the tally. Token-gated; returns the fresh tally.
export async function recordConceptVote(input: {
  token: string;
  conceptKey: string;
  voterToken: string;
}): Promise<VoteResult> {
  if (!input.token || !input.voterToken || !input.conceptKey) {
    return { ok: false, reason: 'not_found' };
  }
  return withSystem(async (db) => {
    const project = await db.project.findUnique({
      where: { transferToken: input.token },
      select: { id: true, status: true },
    });
    if (!project || project.status === 'deleted') return { ok: false, reason: 'not_found' };

    const { directions } = await readShareSource(db, project.id);
    if (!directions.some((d) => d.key === input.conceptKey)) {
      return { ok: false, reason: 'invalid_concept' };
    }

    await db.conceptVote.upsert({
      where: { projectId_voterToken: { projectId: project.id, voterToken: input.voterToken } },
      update: { conceptKey: input.conceptKey },
      create: { projectId: project.id, conceptKey: input.conceptKey, voterToken: input.voterToken },
    });

    const votesByConcept = await tallyVotes(db, project.id);
    const concepts = directions.map((d) => ({
      conceptKey: d.key,
      votes: votesByConcept.get(d.key) ?? 0,
    }));
    const totalVotes = concepts.reduce((sum, c) => sum + c.votes, 0);
    return { ok: true, concepts, totalVotes };
  });
}
