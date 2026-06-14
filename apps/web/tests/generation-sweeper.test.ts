// Goal 7 — sweeper cron route: fail-closed auth (x-vercel-cron OR CRON_SECRET
// bearer), system sweep with the SERVER-constant TTL, PostHog count event.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sweepMock: vi.fn(),
  sweepTestDataMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock('@alphawolf/db', () => ({
  generation: { sweepStaleRuns: h.sweepMock },
  maintenance: { sweepTestData: h.sweepTestDataMock },
}));
vi.mock('@/lib/notifications/posthog-server', () => ({ captureServerEvent: h.captureMock }));

import { GET, maxDuration } from '@/app/api/cron/sweep-generation/route';

const savedSecret = process.env.CRON_SECRET;

// Goal 9.1 D1: the cron also runs the test-data maintenance sweep. Default it to
// a no-op result so the existing generation-sweep assertions stay focused.
const NO_OP_SWEEP = {
  projectsPurged: 0,
  storagePurged: 0,
  accountsRetired: 0,
  accountProjects: 0,
  accountsFailed: 0,
  adminTripwire: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CRON_SECRET;
  h.sweepMock.mockResolvedValue(2);
  h.sweepTestDataMock.mockResolvedValue(NO_OP_SWEEP);
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
    expect(await res.json()).toEqual({ ok: true, swept: 2, maintenance: NO_OP_SWEEP });
    expect(h.sweepMock).toHaveBeenCalledWith(15);
    expect(h.sweepTestDataMock).toHaveBeenCalledTimes(1);
    // F6: the event carries WHICH auth path fired, so the header-only path
    // is observable (and alertable) in PostHog.
    expect(h.captureMock).toHaveBeenCalledWith('generation_swept', 'system', {
      count: 2,
      auth: 'header',
    });
    // Goal 9.1 D1: the test-data sweep result is reported on its own event.
    expect(h.captureMock).toHaveBeenCalledWith('test_data_swept', 'system', {
      auth: 'header',
      ...NO_OP_SWEEP,
    });
  });

  it('accepts the CRON_SECRET bearer for manual/ops invocations', async () => {
    process.env.CRON_SECRET = 's3cret';
    const res = await GET(request({ authorization: 'Bearer s3cret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, swept: 2, maintenance: NO_OP_SWEEP });
    expect(h.captureMock).toHaveBeenCalledWith('generation_swept', 'system', {
      count: 2,
      auth: 'bearer',
    });
  });

  it('isolates a maintenance-sweep failure from the generation sweep (Goal 9.1 D1)', async () => {
    // The refund sweep already ran; a test-data maintenance error must NOT fail
    // the cron or undo it — it returns 200 with maintenance: null and an event.
    h.sweepTestDataMock.mockRejectedValue(new Error('decrypt blew up'));
    const res = await GET(request({ 'x-vercel-cron': '1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, swept: 2, maintenance: null });
    expect(h.captureMock).toHaveBeenCalledWith('generation_swept', 'system', {
      count: 2,
      auth: 'header',
    });
    expect(h.captureMock).toHaveBeenCalledWith('test_data_sweep_failed', 'system', {
      auth: 'header',
      error: 'decrypt blew up',
    });
  });

  it('stays inside the hobby-plan function ceiling', () => {
    expect(maxDuration).toBeLessThanOrEqual(60);
  });
});
