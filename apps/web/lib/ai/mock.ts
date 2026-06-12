// Deterministic mock provider (Goal 7 D1). The DEFAULT everywhere AI_PROVIDER
// is not 'fal' — unit tests, CI, local dev, and (loudly, never silently) a
// misconfigured prod. Zero network, zero spend.
//
// Output: an SVG-rendered PNG data URI — a colored panel carrying the model
// key, a short prompt excerpt, and the seed, so e2e screenshots show WHICH
// request produced WHICH image. Deterministic for a given request (same
// prompt+seed+model → same bytes), which the unit tests assert.

import { createHash } from 'node:crypto';

import sharp from 'sharp';

import type {
  ProviderCheck,
  ProviderRequest,
  ProviderRunResult,
  ProviderSubmission,
  WrapImageProvider,
} from './provider';

// Mock renders are free, but cost-tracking code paths still exercise real
// arithmetic — report $0 so ledgers stay truthful.
const MOCK_COST_USD = 0;

// Pending submissions; the mock "queue" completes on first check() so the
// state machine's pending→complete transition is exercised in tests. Entries
// stay resident so re-entrant check() calls (the advance route is idempotent)
// keep succeeding; a size cap stops unbounded growth in long dev sessions.
const pending = new Map<string, ProviderRequest>();
const PENDING_CAP = 500;

function hueFor(text: string): number {
  return createHash('sha256').update(text).digest().readUInt8(0) * 1.40625; // 0..359
}

function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

async function renderPng(req: ProviderRequest): Promise<string> {
  const hue = hueFor(`${req.modelKey}:${req.seed ?? 0}`);
  const excerpt = escapeXml(req.prompt.slice(0, 90));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${req.width}" height="${req.height}">
  <rect width="100%" height="100%" fill="hsl(${hue.toFixed(0)}, 45%, 38%)"/>
  <rect x="4%" y="6%" width="92%" height="30%" fill="hsl(${hue.toFixed(0)}, 45%, 24%)" rx="12"/>
  <text x="6%" y="16%" font-family="sans-serif" font-size="${Math.round(req.height * 0.05)}" fill="#fff" font-weight="bold">MOCK · ${escapeXml(req.modelKey)}</text>
  <text x="6%" y="24%" font-family="sans-serif" font-size="${Math.round(req.height * 0.03)}" fill="#cfd8dc">seed ${req.seed ?? 0} · ${req.width}×${req.height}</text>
  <text x="6%" y="31%" font-family="sans-serif" font-size="${Math.round(req.height * 0.026)}" fill="#eceff1">${excerpt}</text>
</svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return `data:image/png;base64,${png.toString('base64')}`;
}

function requestIdFor(req: ProviderRequest): string {
  const digest = createHash('sha256')
    .update(
      JSON.stringify([
        req.modelKey,
        req.prompt,
        req.seed ?? 0,
        req.width,
        req.height,
        req.imageUrls ?? [],
      ]),
    )
    .digest('hex')
    .slice(0, 20);
  return `mock-${digest}`;
}

async function submit(req: ProviderRequest): Promise<ProviderSubmission> {
  const requestId = requestIdFor(req);
  if (pending.size >= PENDING_CAP) {
    const oldest = pending.keys().next().value;
    if (oldest) pending.delete(oldest);
  }
  pending.set(requestId, req);
  await emitMockServedInProd();
  return { requestId, estimatedCostUsd: MOCK_COST_USD };
}

async function check(_modelKey: string, requestId: string): Promise<ProviderCheck> {
  const req = pending.get(requestId);
  if (!req) return { status: 'failed', error: `unknown mock request ${requestId}` };
  const url = await renderPng(req);
  return {
    status: 'complete',
    images: [{ url, width: req.width, height: req.height, contentType: 'image/png' }],
    costUsd: MOCK_COST_USD,
  };
}

async function run(req: ProviderRequest): Promise<ProviderRunResult> {
  const { requestId } = await submit(req);
  const state = await check(req.modelKey, requestId);
  if (state.status !== 'complete') throw new Error('mock provider failed to render');
  return { images: state.images, costUsd: state.costUsd, requestId };
}

// Silent-mock-in-prod tripwire (pipeline design §5): mock art served from a
// production deployment is a misconfiguration we want to SEE, not discover in
// a customer screenshot. Best-effort, never throws.
async function emitMockServedInProd(): Promise<void> {
  if (process.env.VERCEL_ENV !== 'production') return;
  try {
    const { captureServerEvent } = await import('../notifications/posthog-server');
    await captureServerEvent('ai_mock_served_in_prod', 'system', {});
  } catch {
    // observability is best-effort
  }
}

export const mockProvider: WrapImageProvider = { name: 'mock', submit, check, run };
