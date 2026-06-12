// fal.ai implementation of the wrap-image provider (Goal 7 D1).
//
// Uses fal's hosted queue (submit → request_id → status → result) so OUR state
// machine never blocks on render time. The FAL_KEY is read by @fal-ai/client
// from env at call time; it is never logged, never echoed in errors, and never
// reaches the client bundle (this module is server-side only).
//
// fal gotchas encoded here, verified 2026-06-12:
//  - The image input field name differs per endpoint (config-driven, AI_MODELS).
//  - Megapixels bill ROUNDED UP per image.
//  - Output URLs are not permanent — callers copy to our storage immediately.
//  - COMPLETED is terminal even on model error; the result fetch surfaces it.

import 'server-only';

import { fal } from '@fal-ai/client';

import { AI_MODELS, estimateImageCostUsd, type AiModelKey } from '@alphawolf/db';

import {
  ProviderRunFailedError,
  type ProviderCheck,
  type ProviderImage,
  type ProviderRequest,
  type ProviderRunResult,
  type ProviderSubmission,
  type WrapImageProvider,
} from './provider';

interface FalImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

function buildInput(req: ProviderRequest): Record<string, unknown> {
  const model = AI_MODELS[req.modelKey];
  const input: Record<string, unknown> = {
    prompt: req.prompt,
    num_images: 1,
  };
  if (req.seed !== undefined) input.seed = req.seed;

  // Size: FLUX-family generate endpoints take image_size {width,height}; edit
  // endpoints (Kontext, nano-banana, flux-2-pro/edit) follow the input image,
  // so we only pass size where the op generates from scratch.
  if (model.op === 'generate') {
    input.image_size = { width: req.width, height: req.height };
  }

  const urls = req.imageUrls ?? [];
  switch (model.imageField) {
    case 'control_lora_image_url':
      if (!urls[0]) throw new Error(`${req.modelKey} requires a control image`);
      input.control_lora_image_url = urls[0];
      // We pass the template view RENDER, not a depth map; fal derives depth.
      input.preprocess_depth = true;
      break;
    case 'image_url':
      if (!urls[0]) throw new Error(`${req.modelKey} requires a source image`);
      input.image_url = urls[0];
      break;
    case 'image_urls':
      if (urls.length === 0) throw new Error(`${req.modelKey} requires source image(s)`);
      input.image_urls = urls;
      break;
  }
  return input;
}

// @fal-ai/client ships endpoint-specific input typings keyed by model id; our
// model ids are config data, so we go through loosely-typed views of the queue
// methods rather than pinning the compile-time endpoint map.
const queue = fal.queue as unknown as {
  submit: (id: string, opts: { input: Record<string, unknown> }) => Promise<{ request_id: string }>;
  status: (id: string, opts: { requestId: string; logs: boolean }) => Promise<{ status: string }>;
  result: (id: string, opts: { requestId: string }) => Promise<{ data: unknown }>;
};

function mapImages(data: unknown, fallbackW: number, fallbackH: number): ProviderImage[] {
  const d = data as { images?: FalImage[]; image?: FalImage };
  const list = d.images ?? (d.image ? [d.image] : []);
  return list.map((img) => ({
    url: img.url,
    width: img.width ?? fallbackW,
    height: img.height ?? fallbackH,
    contentType: img.content_type ?? 'image/jpeg',
  }));
}

// Actual cost from real output dimensions (megapixels round UP per image).
function actualCostUsd(modelKey: AiModelKey, images: ProviderImage[]): number {
  const pricing = AI_MODELS[modelKey].pricing;
  return images.reduce((sum, img) => sum + estimateImageCostUsd(pricing, img.width, img.height), 0);
}

async function submit(req: ProviderRequest): Promise<ProviderSubmission> {
  const model = AI_MODELS[req.modelKey];
  const { request_id } = await queue.submit(model.id, { input: buildInput(req) });
  return {
    requestId: request_id,
    estimatedCostUsd: estimateImageCostUsd(
      model.pricing,
      req.width,
      req.height,
      req.imageUrls?.length ?? 0,
    ),
  };
}

async function check(modelKey: AiModelKey, requestId: string): Promise<ProviderCheck> {
  const model = AI_MODELS[modelKey];
  let status: { status: string };
  try {
    status = await queue.status(model.id, { requestId, logs: false });
  } catch (err) {
    // Only DETERMINISTIC rejections fail fast (bad/unknown request id).
    // 429/401/403 on the STATUS endpoint are not failed runs — the render may
    // still complete and bill, so releasing spend on them would fail open.
    // Those and 5xx/network stay pending; the run deadline is the backstop.
    const httpStatus = (err as { status?: number }).status;
    if (httpStatus === 404 || httpStatus === 422) {
      return { status: 'failed', error: `provider status check rejected (HTTP ${httpStatus})` };
    }
    return { status: 'pending' };
  }
  if (status.status !== 'COMPLETED') return { status: 'pending' };

  try {
    const result = await queue.result(model.id, { requestId });
    const images = mapImages(result.data, 0, 0);
    if (images.length === 0) return { status: 'failed', error: 'provider returned no images' };
    return { status: 'complete', images, costUsd: actualCostUsd(modelKey, images) };
  } catch (err) {
    // COMPLETED + result error = the model run itself failed (fal surfaces
    // validation/model errors here). Terminal for this request id.
    const message = err instanceof Error ? err.message : 'provider result fetch failed';
    return { status: 'failed', error: message };
  }
}

async function run(
  req: ProviderRequest,
  opts?: { timeoutMs?: number },
): Promise<ProviderRunResult> {
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const submission = await submit(req);
  const startedAt = Date.now();
  for (;;) {
    const state = await check(req.modelKey, submission.requestId);
    if (state.status === 'complete') {
      // fal occasionally omits dims on the result; fall back to the request's
      // so stored metadata and cost true-up never see 0×0.
      const images = state.images.map((img) => ({
        ...img,
        width: img.width || req.width,
        height: img.height || req.height,
      }));
      return { images, costUsd: state.costUsd, requestId: submission.requestId };
    }
    if (state.status === 'failed') {
      throw new ProviderRunFailedError(`fal run ${submission.requestId} failed: ${state.error}`);
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`fal run ${submission.requestId} timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }
}

export const falProvider: WrapImageProvider = { name: 'fal', submit, check, run };
