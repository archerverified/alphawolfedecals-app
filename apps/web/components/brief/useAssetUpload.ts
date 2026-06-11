'use client';

// Wizard-side upload hook (Goal 5 / B2C-004). Same pipeline the editor's
// UploadPanel drives — signed-URL direct PUT → finalize → poll until parse
// terminal (ADR-0007) — without the canvas-placement/crop concerns. Used by
// the brief's photos + logo steps.

import { useCallback, useRef, useState } from 'react';
import {
  requestAssetUploadAction,
  finalizeAssetUploadAction,
  getAssetAction,
  type AssetView,
} from '@/lib/actions/asset';
import { readUploadMeta, type UploadMeta } from '@/lib/brief/quality';

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // mirror @alphawolf/parse

// Everything the parse pipeline takes (logo step).
export const LOGO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/svg+xml',
  'application/pdf',
  'application/postscript',
  'application/illustrator',
]);

// Vehicle photos are camera output — raster only.
export const PHOTO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
]);

const TERMINAL = new Set(['parsed', 'failed', 'queued_missing_cli']);
const POLL_DEADLINE_MS = 120_000;
const POLL_INTERVAL_MS = 1200;

export type UploadPhase = 'idle' | 'uploading' | 'parsing';

export interface UploadedAsset {
  view: AssetView;
  meta: UploadMeta;
}

export type UploadResult = { ok: true; asset: UploadedAsset } | { ok: false; message: string };

export function useAssetUpload(projectId: string) {
  const [phase, setPhase] = useState<UploadPhase>('idle');
  // Re-entrancy guard: state updates are async, double-clicks are not.
  const busyRef = useRef(false);

  const poll = useCallback(
    async (assetId: string, accept: (view: AssetView) => boolean): Promise<UploadResult> => {
      const deadline = Date.now() + POLL_DEADLINE_MS;
      for (;;) {
        const view = await getAssetAction({ projectId, assetId });
        if (!view) return { ok: false, message: 'The file disappeared during processing.' };
        if (TERMINAL.has(view.parseStatus) && accept(view)) {
          if (view.parseStatus === 'failed') {
            return { ok: false, message: "We couldn't process that file. Try another one." };
          }
          if (view.parseStatus === 'queued_missing_cli') {
            // AI/EPS need a converter the deployed worker doesn't have yet
            // (inkscape deferred — deploy topology). Don't present raw bytes
            // as a parsed result.
            return {
              ok: false,
              message:
                "That format needs extra processing we can't run yet — a PNG, JPG, or SVG works right away.",
            };
          }
          return { ok: true, asset: { view, meta: readUploadMeta(view.parseMetadata) } };
        }
        if (Date.now() > deadline) {
          return { ok: false, message: 'Processing is taking too long. Try again in a minute.' };
        }
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      }
    },
    [projectId],
  );

  const upload = useCallback(
    async (file: File, allowedMime: Set<string>): Promise<UploadResult> => {
      if (!allowedMime.has(file.type)) {
        return {
          ok: false,
          message: `That file type isn't supported (${file.type || 'unknown'}).`,
        };
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return { ok: false, message: 'File is over the 50 MB limit.' };
      }
      if (busyRef.current) return { ok: false, message: 'Another upload is still running.' };
      busyRef.current = true;
      setPhase('uploading');
      try {
        const grant = await requestAssetUploadAction({
          projectId,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        });
        const put = await fetch(grant.signedUrl, {
          method: 'PUT',
          headers: { 'content-type': file.type, 'x-upsert': 'true' },
          body: file,
        });
        if (!put.ok) return { ok: false, message: `Upload failed (${put.status}).` };

        await finalizeAssetUploadAction({
          projectId,
          assetId: grant.assetId,
          mimeType: file.type,
        });
        setPhase('parsing');
        return await poll(grant.assetId, () => true);
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Upload failed.',
        };
      } finally {
        busyRef.current = false;
        setPhase('idle');
      }
    },
    [projectId, poll],
  );

  // One-click background removal on an ALREADY-parsed asset: re-enqueue the
  // same source with rembg and poll for the NEW result. The accept predicate
  // keys on the asset VERSION (bumped each time a re-parse completes) — a
  // metadata-based predicate returns stale on RETRY, because a failed first
  // attempt already left rembg.requested=true in the stored row (PR #125
  // review finding #2, queued-mode only so no test can see it).
  const removeBackground = useCallback(
    async (assetId: string, mimeType: string): Promise<UploadResult> => {
      if (busyRef.current) return { ok: false, message: 'Another upload is still running.' };
      busyRef.current = true;
      setPhase('parsing');
      try {
        const before = await getAssetAction({ projectId, assetId });
        if (!before) return { ok: false, message: 'The file disappeared during processing.' };
        await finalizeAssetUploadAction({ projectId, assetId, mimeType, rembg: true });
        return await poll(assetId, (view) => view.version > before.version);
      } catch (err) {
        return {
          ok: false,
          message: err instanceof Error ? err.message : 'Background removal failed.',
        };
      } finally {
        busyRef.current = false;
        setPhase('idle');
      }
    },
    [projectId, poll],
  );

  return { phase, upload, removeBackground };
}
