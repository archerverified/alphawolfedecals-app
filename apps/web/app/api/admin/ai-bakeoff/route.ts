// Bake-off / proof harness (Goal 7 D2). Admin-gated internal endpoint — real
// fal spend can ONLY be exercised server-side where Vercel injects FAL_KEY
// (the key is write-only sensitive; it exists nowhere a laptop can read).
//
// SELF-CAPPED (pipeline design §G1): this route ships BEFORE the D7 rails, so
// it carries its own hard limits from AI_CONFIG.bakeoff, enforced by the
// fail-closed ledger module (lib/ai/bakeoff-ledger.ts): projected image + USD
// caps, estimate-before-spend recording, true-up after store. Ledger errors
// other than object-missing → 503, no provider call.
//
// CSRF note (review item): this is a JSON-body route handler — HTML forms
// cannot produce an application/json POST cross-origin, the session cookie is
// SameSite=Strict, and we reject non-JSON content types below. The form
// double-submit token used by server actions doesn't apply here.
//
// Not linked from any UI. requireAdmin() 404s non-admins (same contract as
// /admin/vehicles). Grant-only credits are untouched: this is an operator
// harness, not a customer surface.

import { NextResponse } from 'next/server';

import { AI_CONFIG, AI_MODELS, storage, type AiModelKey } from '@alphawolf/db';

import { requireAdmin } from '../../../../lib/admin/guard';
import {
  checkCaps,
  hasLabelEntry,
  loadLedger,
  recordEstimate,
  recordFailure,
  saveLedger,
  trueUp,
  type LedgerStore,
} from '../../../../lib/ai/bakeoff-ledger';
import {
  estimateRequestCostUsd,
  getImageProvider,
  ProviderRunFailedError,
} from '../../../../lib/ai/provider';
import { captureServerEvent } from '../../../../lib/notifications/posthog-server';

export const dynamic = 'force-dynamic';
// Hobby-plan ceiling — Vercel rejects the whole DEPLOY above 60 (errorCode
// invalid_max_duration, learned 2026-06-12). Callers send ONE model per
// invocation; 1 × 45s fits with headroom for storage I/O.
export const maxDuration = 60;

const PER_MODEL_TIMEOUT_MS = 45_000;

const ledgerStore: LedgerStore = {
  download: (key) => storage.downloadAssetObject(key),
  upload: (key, data) => storage.uploadAssetObject(key, data, 'application/json').then(() => {}),
};

// Serialize invocations per instance so concurrent POSTs can't race the
// ledger read-modify-write. Multi-instance overlap remains theoretically
// possible (single-operator harness; D7's DB-backed rails are the real fix).
let invocationChain: Promise<unknown> = Promise.resolve();

function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

async function fetchImageBytes(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    if (comma === -1) throw new Error('malformed data URI');
    return Buffer.from(url.slice(comma + 1), 'base64');
  }
  // Only the provider's own CDN (or data URIs from the mock) are fetchable —
  // never an arbitrary URL (SSRF rail, security review F3).
  const parsed = new URL(url);
  const allowedHost = /(^|\.)fal\.(media|ai|run)$/.test(parsed.hostname);
  if (parsed.protocol !== 'https:' || !allowedHost) {
    throw new Error('image URL outside the provider CDN allowlist');
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

  if (!request.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'content-type must be application/json' }, { status: 415 });
  }
  let body: BakeoffBody;
  try {
    body = (await request.json()) as BakeoffBody;
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }

  const label = (typeof body.label === 'string' ? body.label : '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 60);
  const prompt = typeof body.prompt === 'string' ? body.prompt.trim().slice(0, 4000) : '';
  const seed = Number.isInteger(body.seed) ? (body.seed as number) : undefined;
  const controlImageUrl =
    typeof body.controlImageUrl === 'string' ? body.controlImageUrl : undefined;
  const modelKeys = [
    ...new Set(
      (Array.isArray(body.modelKeys) ? body.modelKeys : []).filter(
        (k): k is AiModelKey => typeof k === 'string' && k in AI_MODELS,
      ),
    ),
  ];
  if (!label || !prompt || modelKeys.length === 0) {
    return NextResponse.json(
      { error: 'label, prompt and at least one valid modelKey are required' },
      { status: 400 },
    );
  }

  const result = invocationChain.then(() =>
    runBakeoff({ admin: admin.id, label, prompt, modelKeys, controlImageUrl, seed }),
  );
  // Keep the chain alive regardless of this invocation's outcome.
  invocationChain = result.catch(() => {});
  return result;
}

async function runBakeoff(input: {
  admin: string;
  label: string;
  prompt: string;
  modelKeys: AiModelKey[];
  controlImageUrl?: string;
  seed?: number;
}): Promise<NextResponse> {
  const { width, height } = AI_CONFIG.draftImage;

  let ledger;
  try {
    ledger = await loadLedger(ledgerStore);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'ledger unavailable' },
      { status: 503 },
    );
  }

  for (const modelKey of input.modelKeys) {
    if (hasLabelEntry(ledger, input.label, modelKey)) {
      return NextResponse.json(
        { error: `label "${input.label}" already has a ${modelKey} entry — pick a new label` },
        { status: 409 },
      );
    }
  }

  const requests = input.modelKeys.map((modelKey) => ({
    modelKey,
    prompt: input.prompt,
    imageUrls: input.controlImageUrl ? [input.controlImageUrl] : undefined,
    width,
    height,
    seed: input.seed,
  }));
  const capDecision = checkCaps(ledger, requests.map(estimateRequestCostUsd));
  if (!capDecision.allowed) {
    return NextResponse.json(
      {
        error: capDecision.reason,
        cumulative: { images: ledger.totalImages, usd: ledger.totalUsd },
      },
      { status: 429 },
    );
  }

  const provider = await getImageProvider();
  const results: Array<Record<string, unknown>> = [];

  for (const req of requests) {
    // Re-check projection each iteration — earlier true-ups may have grown
    // the total past the cap mid-invocation.
    const stillAllowed = checkCaps(ledger, [estimateRequestCostUsd(req)]);
    if (!stillAllowed.allowed) {
      results.push({ modelKey: req.modelKey, ok: false, error: stillAllowed.reason });
      continue;
    }

    // ESTIMATE BEFORE SPEND: ledger row + persist BEFORE the provider call,
    // so a crash after submit never loses the spend record.
    const row = recordEstimate(ledger, {
      label: input.label,
      modelKey: req.modelKey,
      requestId: '',
      costUsd: estimateRequestCostUsd(req),
      storedPath: '',
    });
    await saveLedger(ledgerStore, ledger);

    try {
      const run = await provider.run(req, { timeoutMs: PER_MODEL_TIMEOUT_MS });
      const image = run.images[0];
      if (!image) throw new Error('provider returned no images');
      const bytes = await fetchImageBytes(image.url);
      const storedPath = `bakeoff/2026-06/${input.label}/${req.modelKey}.${extensionFor(image.contentType)}`;
      await storage.uploadAssetObject(storedPath, bytes, image.contentType);

      trueUp(ledger, row, { costUsd: run.costUsd, requestId: run.requestId, storedPath });

      await captureServerEvent('ai_bakeoff_call', input.admin, {
        label: input.label,
        modelKey: req.modelKey,
        model: AI_MODELS[req.modelKey].id,
        provider: provider.name,
        costUsd: run.costUsd,
        cumulativeUsd: ledger.totalUsd,
      });

      results.push({
        modelKey: req.modelKey,
        ok: true,
        storedPath,
        costUsd: run.costUsd,
        width: image.width,
        height: image.height,
      });
    } catch (err) {
      // Release the spend record ONLY on a provider-confirmed failure (fal
      // never bills those). Timeouts and fetch/store errors keep the
      // conservative estimate — the render may have happened and billed.
      if (err instanceof ProviderRunFailedError) recordFailure(ledger, row);
      results.push({
        modelKey: req.modelKey,
        ok: false,
        error: err instanceof Error ? err.message : 'unknown error',
        spendRecorded: !(err instanceof ProviderRunFailedError),
      });
    }
    await saveLedger(ledgerStore, ledger);
  }

  return NextResponse.json({
    provider: provider.name,
    results,
    cumulative: { images: ledger.totalImages, usd: ledger.totalUsd },
  });
}
