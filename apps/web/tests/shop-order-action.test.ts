// transitionOrderAction (Goal 3b PR2). The action is a thin authenticated
// pass-through: requireShopUser supplies the user + shopIds (and redirects
// non-shop visitors), then the repo's transitionOrderStatus enforces the
// transition under RLS. We mock both so this exercises only the action's wiring
// — that it forwards the right args and returns the repo result verbatim.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireShopUserMock, transitionMock } = vi.hoisted(() => ({
  requireShopUserMock: vi.fn(),
  transitionMock: vi.fn(),
}));

vi.mock('@/lib/shop/guard', () => ({ requireShopUser: requireShopUserMock }));
vi.mock('@alphawolf/db', () => ({ orders: { transitionOrderStatus: transitionMock } }));

import { transitionOrderAction } from '@/lib/actions/shop-order';

beforeEach(() => {
  requireShopUserMock.mockReset().mockResolvedValue({
    user: { id: 'user-1' },
    memberships: [{ shopId: 'shop-1', role: 'shop_admin' }],
    shopIds: ['shop-1'],
  });
  transitionMock.mockReset().mockResolvedValue({ ok: true, status: 'in_production' });
});

describe('transitionOrderAction', () => {
  it('forwards the caller user id + shopIds to the repo and returns its result', async () => {
    const res = await transitionOrderAction({ orderId: 'order-1', to: 'in_production' });
    expect(transitionMock).toHaveBeenCalledWith('user-1', {
      orderId: 'order-1',
      shopIds: ['shop-1'],
      to: 'in_production',
    });
    expect(res).toEqual({ ok: true, status: 'in_production' });
  });

  it('gates on the order-scoped return-to path', async () => {
    await transitionOrderAction({ orderId: 'order-9', to: 'cancelled' });
    expect(requireShopUserMock).toHaveBeenCalledWith('/dashboard/orders/order-9');
  });

  it('propagates a repo conflict result unchanged', async () => {
    transitionMock.mockResolvedValueOnce({ ok: false, reason: 'conflict' });
    const res = await transitionOrderAction({ orderId: 'order-1', to: 'fulfilled' });
    expect(res).toEqual({ ok: false, reason: 'conflict' });
  });
});
