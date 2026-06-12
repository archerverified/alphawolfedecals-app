// Goal 7 — sweeper cron route: fail-closed auth (x-vercel-cron OR CRON_SECRET
// bearer), system sweep with the SERVER-constant TTL, PostHog count event.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sweepMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock('@alphawolf/db', () => ({ generation: { sweepStaleRuns: h.sweepMock } }));
vi.mock('@/lib/notifications/posthog-server', () => ({ captureServerEvent: h.captureMock }));

import { GET, maxDuration } from '@/app/api/cron/sweep-generation/route';

const savedSecret = process.env.CRON_SECRET;

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CRON_SECRET;
  h.sweepMock.mockResolvedValue(2);
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = savedSecret;
});

function request(headers: Record<string, string> = {}): Request {
  return new Request('https://example.test/api/cron/sweep-generation', { headers });
}

describe('GET /api/cron/sweep-generation', () => {
  it('FAILS CLOSED: no cron header, no secret configured → 401, no sweep', async () => {
    const res = await GET(request());
    expect(res.status).toBe(401);
    expect(h.sweepMock).not.toHaveBeenCalled();
  });

  it('rejects a bearer when CRON_SECRET is unset (no open fallback)', async () => {
    const res = await GET(request({ authorization: 'Bearer anything' }));
    expect(res.status).toBe(401);
    expect(h.sweepMock).not.toHaveBeenCalled();
  });

  it('rejects a WRONG bearer when CRON_SECRET is set', async () => {
    process.env.CRON_SECRET = 's3cret';
    const res = await GET(request({ authorization: 'Bearer wrong' }));
    expect(res.status).toBe(401);
    expect(h.sweepMock).not.toHaveBeenCalled();
  });

  it('accepts the Vercel cron header and sweeps with the 15-minute TTL', async () => {
    const res = await GET(request({ 'x-vercel-cron': '1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, swept: 2 });
    expect(h.sweepMock).toHaveBeenCalledWith(15);
    expect(h.captureMock).toHaveBeenCalledWith('generation_swept', 'system', { count: 2 });
  });

  it('accepts the CRON_SECRET bearer for manual/ops invocations', async () => {
    process.env.CRON_SECRET = 's3cret';
    const res = await GET(request({ authorization: 'Bearer s3cret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, swept: 2 });
  });

  it('stays inside the hobby-plan function ceiling', () => {
    expect(maxDuration).toBeLessThanOrEqual(60);
  });
});
