// Wrap-image provider adapter (Goal 7 D1, PRD §10). ONE thin seam between the
// generation pipeline and whoever renders pixels: fal.ai in production, a
// deterministic mock everywhere else. Server-side modules only — imported from
// server actions / route handlers, never client components. Keys come from env
// and are NEVER logged (security review item).
//
// Two call styles:
//  - submit()/check(): the queue primitives the run pipeline uses. submit
//    returns the provider request id, which MUST be persisted before any
//    polling (resume harvests by id, never resubmits — double-spend guard,
//    pipeline design §B3).
//  - run(): submit + poll to completion. Convenience for the bake-off harness
//    and tests; the customer pipeline does not block on it.

import 'server-only';

import { AI_MODELS, estimateImageCostUsd, type AiModelKey } from '@alphawolf/db';

export interface ProviderImage {
  /** https URL or data: URI. Always copy to our storage immediately — fal CDN URLs are not permanent. */
  url: string;
  width: number;
  height: number;
  contentType: string;
}

export interface ProviderRequest {
  modelKey: AiModelKey;
  prompt: string;
  /** conditioning/source image(s); mapped to the model's input field per AI_MODELS config */
  imageUrls?: string[];
  width: number;
  height: number;
  seed?: number;
}

export type ProviderCheck =
  | { status: 'pending' }
  | { status: 'complete'; images: ProviderImage[]; costUsd: number }
  | { status: 'failed'; error: string };

export interface ProviderSubmission {
  requestId: string;
  /** estimated, from config prices; trued up against actual output dims at harvest */
  estimatedCostUsd: number;
}

export interface ProviderRunResult {
  images: ProviderImage[];
  costUsd: number;
  requestId: string;
}

/**
 * The provider CONFIRMED the job failed (fal does not bill failed runs).
 * Distinct from timeouts/storage errors, where money may already be spent —
 * callers must only release spend records on this error.
 */
export class ProviderRunFailedError extends Error {}

export interface WrapImageProvider {
  readonly name: 'fal' | 'mock';
  submit(req: ProviderRequest): Promise<ProviderSubmission>;
  check(modelKey: AiModelKey, requestId: string): Promise<ProviderCheck>;
  /** submit + poll to completion (bake-off/tests; not the customer pipeline) */
  run(req: ProviderRequest, opts?: { timeoutMs?: number }): Promise<ProviderRunResult>;
}

export function estimateRequestCostUsd(req: ProviderRequest): number {
  return estimateImageCostUsd(
    AI_MODELS[req.modelKey].pricing,
    req.width,
    req.height,
    req.imageUrls?.length ?? 0,
  );
}

/**
 * Provider selection — FAIL CLOSED (pipeline design §5):
 *  - AI_PROVIDER=fal → fal adapter; a blank FAL_KEY throws loudly at first use
 *    rather than silently serving placeholder art in production.
 *  - anything else → mock. In production, the mock emits a PostHog event per
 *    request so a misconfigured prod can't pass smoke silently.
 * CI never sets AI_PROVIDER, so CI can never spend real money.
 */
export async function getImageProvider(): Promise<WrapImageProvider> {
  if (process.env.AI_PROVIDER === 'fal') {
    if (!process.env.FAL_KEY?.trim()) {
      throw new Error('AI_PROVIDER=fal but FAL_KEY is empty — refusing to fall back to mock');
    }
    const { falProvider } = await import('./fal');
    return falProvider;
  }
  const { mockProvider } = await import('./mock');
  return mockProvider;
}
