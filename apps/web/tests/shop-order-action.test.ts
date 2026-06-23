// transitionOrderAction (Goal 3b PR2 + Goal 20 D2). The action is a thin
// authenticated pass-through: requireShopUser supplies the user + shopIds (and
// redirects non-shop visitors), then the repo's transitionOrderStatus enforces
// the transition under RLS. Goal 20 D2 adds a best-effort customer status email
// on accept/complete. We mock the guard, the repo, and the email dispatch so
// this exercises only the action's wiring.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireShopUserMock, transitionMock, getShopOrderMock, dispatchStatusEmailMock } =
  vi.hoisted(() => ({
    requireShopUserMock: vi.fn(),
    transitionMock: vi.fn(),
    getShopOrderMock: vi.fn(),
    dispatchStatusEmailMock: vi.fn(),
  }));

vi.mock('@/lib/shop/guard', () => ({ requireShopUser: requireShopUserMock }));
vi.mock('@alphawolf/db', () => ({
  orders: { transitionOrderStatus: transitionMock, getShopOrder: getShopOrderMock },
}));
vi.mock('@/lib/notifications/order-emails', () => ({
  dispatchOrderStatusEmail: dispatchStatusEmailMock,
}));

import { transitionOrderAction } from '@/lib/actions/shop-order';

const SHOP_ORDER = {
  id: 'order-1',
  ownerShopId: 'shop-1',
  ownerUserId: 'customer-9',
  projectId: 'project-7',
  status: 'in_production' as const,
  contactName: 'Casey Customer',
  contactEmail: 'casey@example.com',
};

beforeEach(() => {
  requireShopUserMock.mockReset().mockResolvedValue({
    user: { id: 'user-1' },
    memberships: [{ shopId: 'shop-1', role: 'shop_admin' }],
    shopIds: ['shop-1'],
  });
  transitionMock.mockReset().mockResolvedValue({ ok: true, status: 'in_production' });
  getShopOrderMock.mockReset().mockResolvedValue(SHOP_ORDER);
  dispatchStatusEmailMock.mockReset().mockResolvedValue(undefined);
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
    expect(dispatchStatusEmailMock).not.toHaveBeenCalled();
  });

  // Goal 20 D2: dispatchOrderStatusEmail was built as a Goal-3b seam but never
  // wired in, so customers never heard that their order was accepted/completed.
  it('emails the customer when the order moves to in_production', async () => {
    await transitionOrderAction({ orderId: 'order-1', to: 'in_production' });
    expect(dispatchStatusEmailMock).toHaveBeenCalledWith(
      {
        orderId: 'order-1',
        ownerUserId: 'customer-9',
        projectId: 'project-7',
        customerEmail: 'casey@example.com',
        customerName: 'Casey Customer',
      },
      'in_production',
    );
  });

  it('emails the customer when the order moves to fulfilled', async () => {
    transitionMock.mockResolvedValueOnce({ ok: true, status: 'fulfilled' });
    await transitionOrderAction({ orderId: 'order-1', to: 'fulfilled' });
    expect(dispatchStatusEmailMock).toHaveBeenCalledWith(expect.anything(), 'fulfilled');
  });

  it('does NOT email the customer on a cancellation', async () => {
    transitionMock.mockResolvedValueOnce({ ok: true, status: 'cancelled' });
    await transitionOrderAction({ orderId: 'order-1', to: 'cancelled' });
    expect(dispatchStatusEmailMock).not.toHaveBeenCalled();
  });

  it('still returns the successful transition even if the email throws', async () => {
    dispatchStatusEmailMock.mockRejectedValueOnce(new Error('resend down'));
    const res = await transitionOrderAction({ orderId: 'order-1', to: 'in_production' });
    expect(res).toEqual({ ok: true, status: 'in_production' });
  });
});
