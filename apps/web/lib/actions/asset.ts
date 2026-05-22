'use server';

// Asset upload + parse actions (GH-005). The browser uploads bytes DIRECTLY to a
// short-lived signed Storage URL (so large files never stream through a Server
// Action); these actions mint that URL and kick off parsing. Every action
// re-checks requireUser and project ownership (getProject is RLS-scoped, so it
// returns null for a project the session user doesn't own — that's the auth
// boundary for the otherwise service-role-signed Storage access; ADR-0007).

import { randomUUID } from 'node:crypto';
import { projects, storage } from '@alphawolf/db';
import { enqueue, isAllowedMime, MAX_FILE_SIZE_BYTES } from '@alphawolf/parse';
import { requireUser } from '../admin/guard';

async function assertOwnsProject(userId: string, projectId: string): Promise<void> {
  const project = await projects.getProject(userId, projectId);
  if (!project) throw new Error('Project not found.');
}

export type UploadGrant = {
  assetId: string;
  sourceKey: string;
  signedUrl: string;
  token: string;
};

// Validate + reserve an asset row, return a signed UPLOAD url for the browser.
export async function requestAssetUploadAction(input: {
  projectId: string;
  filename: string;
  mimeType: string;
  size: number;
}): Promise<UploadGrant> {
  const user = await requireUser(`/projects/${input.projectId}/editor`);
  await assertOwnsProject(user.id, input.projectId);

  if (!isAllowedMime(input.mimeType)) {
    throw new Error(`Unsupported file type: ${input.mimeType}`);
  }
  if (input.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('File exceeds the 50 MB limit.');
  }

  const assetId = randomUUID();
  const safeName = input.filename.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 100) || 'upload';
  const sourceKey = storage.assetKey(input.projectId, assetId, `source-${safeName}`);

  await projects.createAsset(user.id, {
    assetId,
    projectId: input.projectId,
    mimeType: input.mimeType,
    sourceUrl: sourceKey,
  });

  const signed = await storage.signedAssetUploadUrl(sourceKey);
  return { assetId, sourceKey, signedUrl: signed.signedUrl, token: signed.token };
}

// Called after the browser finishes the direct upload. Enqueues the parse job
// (inline or BullMQ depending on REDIS_URL). rembg toggles background removal.
export async function finalizeAssetUploadAction(input: {
  projectId: string;
  assetId: string;
  mimeType: string;
  rembg?: boolean;
}): Promise<{ mode: 'queued' | 'inline' }> {
  const user = await requireUser(`/projects/${input.projectId}/editor`);
  await assertOwnsProject(user.id, input.projectId);

  const asset = await projects.getAsset(user.id, input.assetId);
  if (!asset) throw new Error('Asset not found.');

  const { mode } = await enqueue({
    assetId: input.assetId,
    ownerUserId: user.id,
    projectId: input.projectId,
    sourceKey: asset.sourceUrl,
    mimeType: input.mimeType,
    options: { rembg: Boolean(input.rembg) },
  });
  return { mode };
}

export type AssetView = {
  assetId: string;
  mimeType: string;
  parseStatus: string;
  parseMetadata: unknown;
  url: string | null; // signed read url of the parsed (or source) object
};

// Resolve a single asset's signed read URL + status (editor polls this after upload
// to swap the placeholder for the parsed result).
export async function getAssetAction(input: {
  projectId: string;
  assetId: string;
}): Promise<AssetView | null> {
  const user = await requireUser(`/projects/${input.projectId}/editor`);
  const asset = await projects.getAsset(user.id, input.assetId);
  if (!asset || asset.projectId !== input.projectId) return null;

  const key = asset.parsedUrl ?? asset.sourceUrl;
  const url = key ? await storage.signedAssetReadUrl(key) : null;
  return {
    assetId: asset.assetId,
    mimeType: asset.mimeType,
    parseStatus: asset.parseStatus,
    parseMetadata: asset.parseMetadata,
    url,
  };
}

// All assets for a project, each with a signed read URL — the editor's one warming
// read on project open (ADR-0009 §5: held in the client store for the session).
export async function listAssetsAction(input: { projectId: string }): Promise<AssetView[]> {
  const user = await requireUser(`/projects/${input.projectId}/editor`);
  await assertOwnsProject(user.id, input.projectId);

  const rows = await projects.listAssets(user.id, input.projectId);
  return Promise.all(
    rows.map(async (a) => {
      const key = a.parsedUrl ?? a.sourceUrl;
      return {
        assetId: a.assetId,
        mimeType: a.mimeType,
        parseStatus: a.parseStatus,
        parseMetadata: a.parseMetadata,
        url: key ? await storage.signedAssetReadUrl(key) : null,
      };
    }),
  );
}
