// The parse-asset job processor (GH-005). Shared by both queue modes (BullMQ
// worker and inline fallback) — this is the single place a parse actually runs.
//
// Flow: mark processing -> download original from Storage -> size/CLI preflight ->
// convert by kind -> upload result to project-assets -> write parse_status + metadata
// back to the DB under the owner's RLS scope. Any throw -> parse_status='failed'
// with the error captured in parse_metadata (never leaves a row stuck in 'processing').

import { projects, storage } from '@alphawolf/db';
import { classifyMime, sourceExtFor, MAX_FILE_SIZE_BYTES } from './mime';
import { bytesMatchKind, describeSignature } from './sniff';
import { commandExists } from './cli';
import { aiToSvg, pdfToSvg, sanitizeSvg, rasterToPng } from './converters';
import type { ParseAssetPayload, ParseOutcome } from './types';

export async function processParseAsset(payload: ParseAssetPayload): Promise<ParseOutcome> {
  const { assetId, ownerUserId, projectId, sourceKey, mimeType, options } = payload;
  const kind = classifyMime(mimeType);

  if (kind === 'unsupported') {
    const error = `unsupported mime: ${mimeType}`;
    await projects.setAssetParseResult(ownerUserId, {
      assetId,
      parseStatus: 'failed',
      parseMetadata: { error },
    });
    return { status: 'failed', error };
  }

  await projects.setAssetParseResult(ownerUserId, { assetId, parseStatus: 'processing' });

  try {
    const source = await storage.downloadAssetObject(sourceKey);
    if (source.byteLength > MAX_FILE_SIZE_BYTES) {
      const error = `file exceeds ${MAX_FILE_SIZE_BYTES} bytes (${source.byteLength})`;
      await projects.setAssetParseResult(ownerUserId, {
        assetId,
        parseStatus: 'failed',
        parseMetadata: { error },
      });
      return { status: 'failed', error };
    }

    // Magic-byte sniff: the declared MIME is client-controlled, so reject files
    // whose bytes contradict it before they reach a converter (defence-in-depth
    // on top of the MIME allowlist). A sniff *miss* is allowed through.
    if (!bytesMatchKind(kind, source)) {
      const sniffed = describeSignature(source);
      const error = `declared ${mimeType} (${kind}) but the file header looks like ${sniffed}`;
      await projects.setAssetParseResult(ownerUserId, {
        assetId,
        parseStatus: 'failed',
        parseMetadata: { error, reason: 'mime_mismatch', claimedMime: mimeType, sniffed },
      });
      return { status: 'failed', error };
    }

    // Vector formats need a CLI on PATH. Absent -> 'queued_missing_cli' (not a
    // failure): the upload is preserved and the editor shows "waiting on
    // dependency"; a re-parse resolves it once the CLI is installed.
    if (kind === 'vector-ai' && !(await commandExists('inkscape'))) {
      await projects.setAssetParseResult(ownerUserId, {
        assetId,
        parseStatus: 'queued_missing_cli',
        parseMetadata: { missing: 'inkscape' },
      });
      return { status: 'queued_missing_cli', missing: 'inkscape' };
    }
    if (kind === 'vector-pdf' && !(await commandExists('pdf2svg'))) {
      await projects.setAssetParseResult(ownerUserId, {
        assetId,
        parseStatus: 'queued_missing_cli',
        parseMetadata: { missing: 'pdf2svg' },
      });
      return { status: 'queued_missing_cli', missing: 'pdf2svg' };
    }

    let outBuf: Buffer;
    let outExt: string;
    let contentType: string;
    let metadata: Record<string, unknown>;

    switch (kind) {
      case 'vector-ai': {
        const ext = sourceExtFor(mimeType) === 'eps' ? 'eps' : 'ai';
        outBuf = sanitizeSvg(await aiToSvg(source, ext));
        outExt = 'svg';
        contentType = 'image/svg+xml';
        metadata = { vector: true, via: 'inkscape' };
        break;
      }
      case 'vector-pdf': {
        outBuf = sanitizeSvg(await pdfToSvg(source));
        outExt = 'svg';
        contentType = 'image/svg+xml';
        metadata = { vector: true, via: 'pdf2svg' };
        break;
      }
      case 'svg': {
        outBuf = sanitizeSvg(source);
        outExt = 'svg';
        contentType = 'image/svg+xml';
        metadata = { vector: true, via: 'passthrough' };
        break;
      }
      case 'raster': {
        const r = await rasterToPng(source, { rembg: Boolean(options?.rembg) });
        outBuf = r.buffer;
        outExt = 'png';
        contentType = r.contentType;
        metadata = { vector: false, ...r.metadata };
        break;
      }
    }

    const parsedKey = storage.assetKey(projectId, assetId, `parsed.${outExt}`);
    await storage.uploadAssetObject(parsedKey, outBuf, contentType);
    await projects.setAssetParseResult(ownerUserId, {
      assetId,
      parseStatus: 'parsed',
      parsedUrl: parsedKey,
      parseMetadata: metadata,
    });
    return { status: 'parsed', parsedKey };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await projects.setAssetParseResult(ownerUserId, {
      assetId,
      parseStatus: 'failed',
      parseMetadata: { error },
    });
    return { status: 'failed', error };
  }
}
