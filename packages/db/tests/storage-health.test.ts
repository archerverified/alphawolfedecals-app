import { afterEach, describe, expect, it } from 'vitest';
import { checkAssetsBucketReachable, storageMisconfigHint } from '../src/storage/supabase';

// Goal 20 D3: a parse worker pointed at the WRONG Supabase project reports
// "Bucket not found" on every download while uploads land in the correct
// project, a silent partial outage. These helpers turn that opaque failure into
// an actionable, self-diagnosing one and let the worker self-check at boot.

describe('storageMisconfigHint', () => {
  it('flags a "Bucket not found" error with an actionable hint', () => {
    const hint = storageMisconfigHint('Bucket not found');
    expect(hint).toBeTruthy();
    expect(hint).toMatch(/project-assets/);
    expect(hint).toMatch(/wrong project/i);
  });

  it('is case-insensitive', () => {
    expect(storageMisconfigHint('bucket NOT FOUND')).toBeTruthy();
  });

  it('returns null for an object-missing error (not a bucket misconfig)', () => {
    expect(storageMisconfigHint('Object not found')).toBeNull();
  });

  it('returns null for a generic/transient error', () => {
    expect(storageMisconfigHint('fetch failed: ECONNRESET')).toBeNull();
  });
});

describe('checkAssetsBucketReachable', () => {
  const saved = {
    url: process.env.SUPABASE_URL,
    key: process.env.SUPABASE_SERVICE_ROLE_KEY,
  };
  afterEach(() => {
    if (saved.url === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = saved.url;
    if (saved.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = saved.key;
  });

  it('reports unconfigured (never throws) when storage env is absent', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const health = await checkAssetsBucketReachable();
    expect(health.ok).toBe(false);
    if (health.ok) return;
    expect(health.reason).toBe('unconfigured');
  });
});
