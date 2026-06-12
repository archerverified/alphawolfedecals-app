// Goal 7 D1 — bake-off ledger money-rail tests (added per fresh-context
// review: the one component with real-dollar consequences must be tested).
// Regression cases mirror the review findings: fail-open ledger load, NaN
// comparisons, projection-less cap checks, estimate-vs-true-up ordering.

import { describe, expect, it } from 'vitest';

import { AI_CONFIG } from '@alphawolf/db';

import {
  BAKEOFF_LEDGER_KEY,
  checkCaps,
  hasLabelEntry,
  loadLedger,
  recordEstimate,
  recordFailure,
  saveLedger,
  trueUp,
  type BakeoffLedger,
  type LedgerStore,
} from '../lib/ai/bakeoff-ledger';

function memoryStore(initial?: Record<string, Buffer>): LedgerStore & { objects: Map<string, Buffer> } {
  const objects = new Map(Object.entries(initial ?? {}));
  return {
    objects,
    async download(key) {
      const found = objects.get(key);
      if (!found) throw new Error(`[db/storage] downloadAssetObject failed for ${key}: Object not found`);
      return found;
    },
    async upload(key, data) {
      objects.set(key, data);
    },
  };
}

describe('loadLedger (fail closed)', () => {
  it('initializes fresh ONLY for object-missing errors', async () => {
    const ledger = await loadLedger(memoryStore());
    expect(ledger).toEqual({ totalImages: 0, totalUsd: 0, calls: [] });
  });

  it('throws on any other storage error instead of zeroing the caps', async () => {
    const store: LedgerStore = {
      download: async () => {
        throw new Error('fetch failed: ECONNRESET');
      },
      upload: async () => {},
    };
    await expect(loadLedger(store)).rejects.toThrow(/fail closed/);
  });

  it('throws on corrupt/NaN ledger contents', async () => {
    const store = memoryStore({
      [BAKEOFF_LEDGER_KEY]: Buffer.from(JSON.stringify({ totalImages: 'lots', totalUsd: null, calls: [] })),
    });
    await expect(loadLedger(store)).rejects.toThrow(/corrupt/);
  });

  it('round-trips through save', async () => {
    const store = memoryStore();
    const ledger: BakeoffLedger = { totalImages: 2, totalUsd: 0.08, calls: [] };
    await saveLedger(store, ledger);
    expect(await loadLedger(store)).toEqual(ledger);
  });
});

describe('checkCaps (projected)', () => {
  it('blocks when planned spend would exceed the USD cap, not only after', () => {
    const nearCap: BakeoffLedger = {
      totalImages: 1,
      totalUsd: AI_CONFIG.bakeoff.maxTotalUsd - 0.01,
      calls: [],
    };
    expect(checkCaps(nearCap, [0.04]).allowed).toBe(false);
    expect(checkCaps(nearCap, [0.005]).allowed).toBe(true);
  });

  it('blocks when planned images would exceed the cumulative image cap', () => {
    const ledger: BakeoffLedger = {
      totalImages: AI_CONFIG.bakeoff.maxTotalImages - 1,
      totalUsd: 0,
      calls: [],
    };
    expect(checkCaps(ledger, [0.01, 0.01]).allowed).toBe(false);
    expect(checkCaps(ledger, [0.01]).allowed).toBe(true);
  });

  it('enforces the per-invocation image cap', () => {
    const ledger: BakeoffLedger = { totalImages: 0, totalUsd: 0, calls: [] };
    const tooMany = Array(AI_CONFIG.bakeoff.maxImagesPerInvocation + 1).fill(0.001);
    expect(checkCaps(ledger, tooMany).allowed).toBe(false);
  });
});

describe('estimate / true-up / failure accounting', () => {
  it('records the estimate before spend and trues up to actual cost', () => {
    const ledger: BakeoffLedger = { totalImages: 0, totalUsd: 0, calls: [] };
    const row = recordEstimate(ledger, {
      label: 'brief1',
      modelKey: 'flux_depth_dev',
      requestId: '',
      costUsd: 0.04,
      storedPath: '',
    });
    expect(ledger.totalImages).toBe(1);
    expect(ledger.totalUsd).toBe(0.04);
    expect(row.status).toBe('estimated');

    trueUp(ledger, row, { costUsd: 0.08, requestId: 'req-1', storedPath: 'bakeoff/x.png' });
    expect(ledger.totalUsd).toBe(0.08);
    expect(row.status).toBe('stored');
    expect(row.requestId).toBe('req-1');
  });

  it('releases the estimate only on confirmed provider failure', () => {
    const ledger: BakeoffLedger = { totalImages: 0, totalUsd: 0, calls: [] };
    const row = recordEstimate(ledger, {
      label: 'brief1',
      modelKey: 'nano_banana_edit',
      requestId: '',
      costUsd: 0.039,
      storedPath: '',
    });
    recordFailure(ledger, row);
    expect(ledger.totalUsd).toBe(0);
    expect(ledger.totalImages).toBe(0);
    expect(row.status).toBe('failed');
  });

  it('detects label/model duplicates so evidence is never overwritten', () => {
    const ledger: BakeoffLedger = { totalImages: 0, totalUsd: 0, calls: [] };
    recordEstimate(ledger, {
      label: 'brief1',
      modelKey: 'flux2_dev',
      requestId: '',
      costUsd: 0.012,
      storedPath: '',
    });
    expect(hasLabelEntry(ledger, 'brief1', 'flux2_dev')).toBe(true);
    expect(hasLabelEntry(ledger, 'brief1', 'flux_depth_dev')).toBe(false);
    expect(hasLabelEntry(ledger, 'brief2', 'flux2_dev')).toBe(false);
  });
});

describe('flux2_pro_metered input megapixels', () => {
  it('prices reference images into the estimate', async () => {
    const { estimateImageCostUsd } = await import('@alphawolf/db');
    const pricing = { kind: 'flux2_pro_metered', firstMpUsd: 0.03, extraMpUsd: 0.015 } as const;
    expect(estimateImageCostUsd(pricing, 1024, 768, 0)).toBeCloseTo(0.03);
    expect(estimateImageCostUsd(pricing, 1024, 768, 1)).toBeCloseTo(0.045);
    expect(estimateImageCostUsd(pricing, 1600, 1200, 1)).toBeCloseTo(0.06);
  });
});
