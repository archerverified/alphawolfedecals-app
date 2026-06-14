// Regression test for the rider-5 admin-elevation root cause (Goal 9 / 9.1 D5).
//
// The leak that put 8 is_admin=true customers in prod: /api/dev/make-admin was
// gated only on NODE_ENV (404 in prod) but local/E2E runtime points at the LIVE
// shared DB and the route had NO target restriction, so E2E specs elevated
// synthetic accounts on prod data. The fix restricts the route to the synthetic
// @e2e.alphawolf.test suffix (mirroring drain-credits) AND setUserAdminByEmail
// refuses a non-test elevation without an operator override. This test pins the
// ROUTE guard — the exact path that originally broke — so it can't regress.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ setAdminMock: vi.fn() }));

vi.mock('@alphawolf/db', () => ({ users: { setUserAdminByEmail: h.setAdminMock } }));

import { POST } from '@/app/api/dev/make-admin/route';

const savedNodeEnv = process.env.NODE_ENV;

function request(email?: string): Request {
  const url = email
    ? `https://example.test/api/dev/make-admin?email=${encodeURIComponent(email)}`
    : 'https://example.test/api/dev/make-admin';
  return new Request(url, { method: 'POST' });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.setAdminMock.mockResolvedValue({ isAdmin: true });
});

afterEach(() => {
  // NODE_ENV is readonly-typed; assign through the record to restore it.
  (process.env as Record<string, string | undefined>).NODE_ENV = savedNodeEnv;
});

describe('POST /api/dev/make-admin guard (rider-5 regression)', () => {
  it('is 404 in production runtime and never elevates anyone', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
    const res = await POST(request('anyone@e2e.alphawolf.test'));
    expect(res.status).toBe(404);
    expect(h.setAdminMock).not.toHaveBeenCalled();
  });

  it('rejects a NON-test email with 403 (the path that leaked is_admin to prod)', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const res = await POST(request('attacker@gmail.com'));
    expect(res.status).toBe(403);
    expect(h.setAdminMock).not.toHaveBeenCalled();
  });

  it('rejects a real operator domain with 403 too', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const res = await POST(request('archer@1stimpression.co'));
    expect(res.status).toBe(403);
    expect(h.setAdminMock).not.toHaveBeenCalled();
  });

  it('only a synthetic @e2e.alphawolf.test identity may be promoted (non-prod)', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const res = await POST(request('casey-123@e2e.alphawolf.test'));
    expect(res.status).toBe(200);
    expect(h.setAdminMock).toHaveBeenCalledWith('casey-123@e2e.alphawolf.test', true);
  });

  it('requires the email query param', async () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = 'test';
    const res = await POST(request());
    expect(res.status).toBe(400);
    expect(h.setAdminMock).not.toHaveBeenCalled();
  });
});
