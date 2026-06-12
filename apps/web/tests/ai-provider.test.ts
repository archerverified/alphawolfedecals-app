// Goal 7 D1 — provider adapter unit tests. ALL mock/offline: no fal calls, no
// spend, no FAL_KEY. The fal client module is vi.mock'd where needed.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AI_CONFIG, AI_MODELS, estimateImageCostUsd } from '@alphawolf/db';

const ENV_KEYS = ['AI_PROVIDER', 'FAL_KEY', 'VERCEL_ENV'] as const;
const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('ai-config', () => {
  it('every default points at a configured model with the right op', () => {
    // Draft may be a generate model OR a conditioned edit model (the 2026-06
    // bake-off picked nano-banana, which EDITS the template view render);
    // either way it must accept a conditioning image.
    expect(['generate', 'edit']).toContain(AI_MODELS[AI_CONFIG.defaults.draft].op);
    expect(AI_MODELS[AI_CONFIG.defaults.draft].imageField).not.toBe('none');
    expect(AI_MODELS[AI_CONFIG.defaults.iteration].op).toBe('edit');
    expect(AI_MODELS[AI_CONFIG.defaults.final].op).toBe('edit');
    expect(AI_MODELS[AI_CONFIG.defaults.upscale].op).toBe('upscale');
  });

  it('estimates megapixel pricing rounded UP (fal billing rule)', () => {
    // 1080×1920 = 2.0736 MP → fal rounds UP → bills as 3 MP.
    expect(estimateImageCostUsd({ kind: 'per_megapixel', usd: 0.04 }, 1024, 768)).toBeCloseTo(0.04);
    expect(estimateImageCostUsd({ kind: 'per_megapixel', usd: 0.04 }, 1080, 1920)).toBeCloseTo(0.12);
    expect(estimateImageCostUsd({ kind: 'per_image', usd: 0.039 }, 4096, 4096)).toBeCloseTo(0.039);
    expect(
      estimateImageCostUsd({ kind: 'flux2_pro_metered', firstMpUsd: 0.03, extraMpUsd: 0.015 }, 1600, 1200),
    ).toBeCloseTo(0.045);
  });

  it('bake-off self-caps are tight enough for the $6 fal budget', () => {
    // Worst case: every bake-off image at the priciest candidate price.
    const worstPerImage = Math.max(
      ...Object.values(AI_MODELS).map((m) =>
        estimateImageCostUsd(m.pricing, AI_CONFIG.draftImage.width, AI_CONFIG.draftImage.height),
      ),
    );
    expect(AI_CONFIG.bakeoff.maxTotalUsd).toBeLessThanOrEqual(2.5);
    expect(worstPerImage * AI_CONFIG.bakeoff.maxImagesPerInvocation).toBeLessThanOrEqual(1);
  });
});

describe('provider selection (fail closed)', () => {
  it('defaults to mock when AI_PROVIDER is unset', async () => {
    delete process.env.AI_PROVIDER;
    const { getImageProvider } = await import('../lib/ai/provider');
    expect((await getImageProvider()).name).toBe('mock');
  });

  it('throws loudly when AI_PROVIDER=fal but FAL_KEY is blank', async () => {
    process.env.AI_PROVIDER = 'fal';
    delete process.env.FAL_KEY;
    const { getImageProvider } = await import('../lib/ai/provider');
    await expect(getImageProvider()).rejects.toThrow(/FAL_KEY is empty/);
  });

  it('selects fal when configured with a key', async () => {
    process.env.AI_PROVIDER = 'fal';
    process.env.FAL_KEY = 'test-not-a-real-key';
    const { getImageProvider } = await import('../lib/ai/provider');
    expect((await getImageProvider()).name).toBe('fal');
  });
});

describe('mock provider', () => {
  it('is deterministic for identical requests and varies by seed', async () => {
    const { mockProvider } = await import('../lib/ai/mock');
    const req = {
      modelKey: 'flux_depth_dev' as const,
      prompt: 'navy contractor van, clean look',
      width: 256,
      height: 192,
      seed: 7,
    };
    const a = await mockProvider.run(req);
    const b = await mockProvider.run(req);
    const c = await mockProvider.run({ ...req, seed: 8 });
    expect(a.images[0]!.url).toBe(b.images[0]!.url);
    expect(a.images[0]!.url).not.toBe(c.images[0]!.url);
    expect(a.images[0]!.url.startsWith('data:image/png;base64,')).toBe(true);
    expect(a.costUsd).toBe(0);
    expect(a.requestId).toMatch(/^mock-/);
  });

  it('completes via the submit/check queue primitives', async () => {
    const { mockProvider } = await import('../lib/ai/mock');
    const sub = await mockProvider.submit({
      modelKey: 'kontext_dev',
      prompt: 'make the hood matte black',
      imageUrls: ['data:image/png;base64,x'],
      width: 128,
      height: 96,
    });
    const state = await mockProvider.check('kontext_dev', sub.requestId);
    expect(state.status).toBe('complete');
  });
});

describe('fal input mapping', () => {
  it('maps the image field per model config and never leaks the key in errors', async () => {
    const submitSpy = vi.fn().mockResolvedValue({ request_id: 'req-123' });
    vi.doMock('@fal-ai/client', () => ({
      fal: { queue: { submit: submitSpy, status: vi.fn(), result: vi.fn() } },
    }));
    const { falProvider } = await import('../lib/ai/fal');

    await falProvider.submit({
      modelKey: 'flux_depth_dev',
      prompt: 'p',
      imageUrls: ['https://example.com/view.png'],
      width: 1024,
      height: 768,
    });
    expect(submitSpy).toHaveBeenLastCalledWith(
      'fal-ai/flux-control-lora-depth',
      expect.objectContaining({
        input: expect.objectContaining({
          control_lora_image_url: 'https://example.com/view.png',
          preprocess_depth: true,
          image_size: { width: 1024, height: 768 },
        }),
      }),
    );

    await falProvider.submit({
      modelKey: 'nano_banana_edit',
      prompt: 'p',
      imageUrls: ['https://example.com/a.png', 'https://example.com/b.png'],
      width: 1024,
      height: 768,
    });
    const nanoInput = submitSpy.mock.calls.at(-1)![1].input;
    expect(nanoInput.image_urls).toEqual(['https://example.com/a.png', 'https://example.com/b.png']);
    expect(nanoInput.image_size).toBeUndefined(); // edit follows the input image

    await expect(
      falProvider.submit({ modelKey: 'kontext_dev', prompt: 'p', width: 10, height: 10 }),
    ).rejects.toThrow(/requires a source image/);
  });

  it('reports failed runs from a COMPLETED status with an error result', async () => {
    vi.doMock('@fal-ai/client', () => ({
      fal: {
        queue: {
          submit: vi.fn(),
          status: vi.fn().mockResolvedValue({ status: 'COMPLETED' }),
          result: vi.fn().mockRejectedValue(new Error('validation failed')),
        },
      },
    }));
    const { falProvider } = await import('../lib/ai/fal');
    const state = await falProvider.check('kontext_dev', 'req-x');
    expect(state).toEqual({ status: 'failed', error: 'validation failed' });
  });
});
