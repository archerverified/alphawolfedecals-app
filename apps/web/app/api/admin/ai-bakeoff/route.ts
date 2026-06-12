// Bake-off / proof harness (Goal 7 D2). Admin-gated internal endpoint — real
// fal spend can ONLY be exercised server-side where Vercel injects FAL_KEY
// (the key is write-only sensitive; it exists nowhere a laptop can read).
//
// SELF-CAPPED (pipeline design §G1): this route ships BEFORE the D7 rails, so
// it carries its own hard limits from AI_CONFIG.bakeoff — per-invocation image
// cap, cumulative image cap, cumulative USD cap — persisted in a ledger object
// in the private project-assets bucket. Every call logs cost to PostHog.
//
// Not linked from any UI. requireAdmin() 404s non-admins (same contract as
// /admin/vehicles). Grant-only credits are untouched: this is an operator
// harness, not a customer surface.

import { NextResponse } from 'next/server';

import { AI_CONFIG, AI_MODELS, storage, type AiModelKey } from '@alphawolf/db';

import { requireAdmin } from '../../../../lib/admin/guard';
import { getImageProvider } from '../../../../lib/ai/provider';
import { captureServerEvent } from '../../../../lib/notifications/posthog-server';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const LEDGER_KEY = 'bakeoff/2026-06/ledger.json';

interface BakeoffLedger {
  totalImages: number;
  totalUsd: number;
  calls: Array<{
    at: string;
    label: string;
    modelKey: string;
    requestId: string;
    costUsd: number;
    storedPath: string;
  }>;
}

async function loadLedger(): Promise<BakeoffLedger> {
  try {
    const buf = await storage.downloadAssetObject(LEDGER_KEY);
    return JSON.parse(buf.toString('utf8')) as BakeoffLedger;
  } catch {
    return { totalImages: 0, totalUsd: 0, calls: [] };
  }
}

async function saveLedger(ledger: BakeoffLedger): Promise<void> {
  await storage.uploadAssetObject(
    LEDGER_KEY,
    Buffer.from(JSON.stringify(ledger, null, 2)),
    'application/json',
  );
}

async function fetchImageBytes(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) {
    return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64');
  }
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

interface BakeoffBody {
  label?: string;
  prompt?: string;
  modelKeys?: string[];
  controlImageUrl?: string;
  seed?: number;
}

export async function POST(request: Request): Promise<NextResponse> {
  const admin = await requireAdmin();

  let body: BakeoffBody;
  try {
    body = (await request.json()) as BakeoffBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const label = (body.label ?? '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 60);
  const prompt = body.prompt?.trim();
  const modelKeys = (body.modelKeys ?? []).filter(
    (k): k is AiModelKey => k in AI_MODELS,
  );
  if (!label || !prompt || modelKeys.length === 0) {
    return NextResponse.json(
      { error: 'label, prompt and at least one valid modelKey are required' },
      { status: 400 },
    );
  }
  if (modelKeys.length > AI_CONFIG.bakeoff.maxImagesPerInvocation) {
    return NextResponse.json(
      { error: `max ${AI_CONFIG.bakeoff.maxImagesPerInvocation} images per invocation` },
      { status: 400 },
    );
  }

  const ledger = await loadLedger();
  if (
    ledger.totalImages + modelKeys.length > AI_CONFIG.bakeoff.maxTotalImages ||
    ledger.totalUsd >= AI_CONFIG.bakeoff.maxTotalUsd
  ) {
    return NextResponse.json(
      { error: 'bake-off cumulative cap reached', ledger: { images: ledger.totalImages, usd: ledger.totalUsd } },
      { status: 429 },
    );
  }

  const provider = await getImageProvider();
  const { width, height } = AI_CONFIG.draftImage;
  const results: Array<Record<string, unknown>> = [];

  for (const modelKey of modelKeys) {
    try {
      const run = await provider.run({
        modelKey,
        prompt,
        imageUrls: body.controlImageUrl ? [body.controlImageUrl] : undefined,
        width,
        height,
        seed: body.seed,
      });
      const image = run.images[0];
      if (!image) throw new Error('provider returned no images');
      const bytes = await fetchImageBytes(image.url);
      const storedPath = `bakeoff/2026-06/${label}/${modelKey}.png`;
      await storage.uploadAssetObject(storedPath, bytes, image.contentType);

      ledger.totalImages += 1;
      ledger.totalUsd = Number((ledger.totalUsd + run.costUsd).toFixed(4));
      ledger.calls.push({
        at: new Date().toISOString(),
        label,
        modelKey,
        requestId: run.requestId,
        costUsd: run.costUsd,
        storedPath,
      });

      await captureServerEvent('ai_bakeoff_call', admin.id, {
        label,
        modelKey,
        model: AI_MODELS[modelKey].id,
        provider: provider.name,
        costUsd: run.costUsd,
        cumulativeUsd: ledger.totalUsd,
      });

      results.push({ modelKey, ok: true, storedPath, costUsd: run.costUsd, width: image.width, height: image.height });
    } catch (err) {
      results.push({
        modelKey,
        ok: false,
        error: err instanceof Error ? err.message : 'unknown error',
      });
    }
    // Persist after each image so a mid-run crash never loses spend records.
    await saveLedger(ledger);
  }

  return NextResponse.json({
    provider: provider.name,
    results,
    cumulative: { images: ledger.totalImages, usd: ledger.totalUsd },
  });
}
