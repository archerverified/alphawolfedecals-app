// Goal 7 — sweeper cron route: fail-closed auth (x-vercel-cron OR CRON_SECRET
// bearer), system sweep with the SERVER-constant TTL, PostHog count event.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sweepMock: vi.fn(),
  sweepTestDataMock: vi.fn(),
  spendTodayMock: vi.fn(),
  captureMock: vi.fn(),
}));

vi.mock('@alphawolf/db', () => ({
  generation: { sweepStaleRuns: h.sweepMock, spendTodaySystem: h.spendTodayMock },
  maintenance: { sweepTestData: h.sweepTestDataMock },
  AI_CONFIG: { dailySpendCapUsd: 5 },
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
  orphanShops: 0,
  adminTripwire: 0,
};

// Goal 10 D3: the cron also emits the daily global spend-cap status. Default the
// spend read to $1 of the $5 cap → 20%, no alert.
const SPEND_STATUS = { spentTodayUsd: 1, capUsd: 5, pctOfCap: 20, alert: false };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CRON_SECRET;
  h.sweepMock.mockResolvedValue(2);
  h.sweepTestDataMock.mockResolvedValue(NO_OP_SWEEP);
  h.spendTodayMock.mockResolvedValue(1);
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
    expect(await res.json()).toEqual({
      ok: true,
      swept: 2,
      maintenance: NO_OP_SWEEP,
      spendStatus: SPEND_STATUS,
    });
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
    // Goal 10 D3: the daily global spend-cap status is emitted as its own event.
    expect(h.captureMock).toHaveBeenCalledWith('ai_daily_spend_status', 'system', {
      auth: 'header',
      ...SPEND_STATUS,
    });
  });

  it('accepts the CRON_SECRET bearer for manual/ops invocations', async () => {
    process.env.CRON_SECRET = 's3cret';
    const res = await GET(request({ authorization: 'Bearer s3cret' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      swept: 2,
      maintenance: NO_OP_SWEEP,
      spendStatus: SPEND_STATUS,
    });
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
    expect(await res.json()).toEqual({
      ok: true,
      swept: 2,
      maintenance: null,
      spendStatus: SPEND_STATUS,
    });
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
