// order-emails orchestration (Goal 3c): narrows an order to PII-safe fields,
// resolves the vehicle label, and routes the right templates to the right
// recipients. We keep firstNameOf/orderNumberFromId real (the PII rule under
// test) and spy on the notify* dispatchers + stub the DB.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as NotificationsModule from '@alphawolf/notifications';

const { getProjectMock, getVehicleMock } = vi.hoisted(() => ({
  getProjectMock: vi.fn(),
  getVehicleMock: vi.fn(),
}));

const { effectsSentinel } = vi.hoisted(() => ({ effectsSentinel: { __sentinel: 'effects' } }));

vi.mock('@alphawolf/db', () => ({
  projects: { getProject: getProjectMock },
  vehicles: { getPublishedDetail: getVehicleMock },
}));

vi.mock('@/lib/notifications/effects', () => ({
  buildNotificationEffects: vi.fn(() => effectsSentinel),
}));

const notifyMocks = vi.hoisted(() => ({
  notifyOrderSubmitted: vi.fn().mockResolvedValue({ sent: true }),
  notifyOrderReceived: vi.fn().mockResolvedValue({ sent: true }),
  notifyOrderInProduction: vi.fn().mockResolvedValue({ sent: true }),
  notifyOrderFulfilled: vi.fn().mockResolvedValue({ sent: true }),
}));

vi.mock('@alphawolf/notifications', async (importActual) => {
  const actual = await importActual<typeof NotificationsModule>();
  return { ...actual, ...notifyMocks };
});

import {
  dispatchOrderStatusEmail,
  dispatchOrderSubmittedEmails,
} from '@/lib/notifications/order-emails';

const CTX = {
  orderId: 'order-1',
  ownerUserId: 'user-1',
  projectId: 'p1',
  customerEmail: 'casey@example.com',
  customerName: 'Casey Jordan',
};

beforeEach(() => {
  for (const m of Object.values(notifyMocks)) m.mockClear();
  getProjectMock.mockReset().mockResolvedValue({ name: 'My Van', vehicleId: 'v1' });
  getVehicleMock.mockReset().mockResolvedValue({ year: 2021, make: 'Ford', model: 'Transit' });
  process.env.ORDERS_OPS_EMAIL = 'ops@alphawolf.test';
});

describe('dispatchOrderSubmittedEmails', () => {
  it('sends the customer receipt + the shop notification with PII-narrowed data', async () => {
    await dispatchOrderSubmittedEmails(CTX);

    expect(notifyMocks.notifyOrderSubmitted).toHaveBeenCalledWith(
      'casey@example.com',
      { firstName: 'Casey', orderNumber: 'ORDER-1', vehicleLabel: '2021 Ford Transit' },
      effectsSentinel,
    );
    expect(notifyMocks.notifyOrderReceived).toHaveBeenCalledWith(
      'ops@alphawolf.test',
      { firstName: 'Casey', orderNumber: 'ORDER-1', vehicleLabel: '2021 Ford Transit' },
      effectsSentinel,
    );
  });

  it('falls back to the project name when the vehicle detail is unavailable', async () => {
    getVehicleMock.mockResolvedValue(null);
    await dispatchOrderSubmittedEmails(CTX);
    expect(notifyMocks.notifyOrderSubmitted).toHaveBeenCalledWith(
      'casey@example.com',
      expect.objectContaining({ vehicleLabel: 'My Van' }),
      effectsSentinel,
    );
  });

  it('skips the shop receipt when no ops inbox is configured', async () => {
    delete process.env.ORDERS_OPS_EMAIL;
    delete process.env.RESEND_FROM_EMAIL;
    await dispatchOrderSubmittedEmails(CTX);
    expect(notifyMocks.notifyOrderSubmitted).toHaveBeenCalledOnce();
    expect(notifyMocks.notifyOrderReceived).not.toHaveBeenCalled();
  });

  it('never throws even if the DB lookup fails', async () => {
    getProjectMock.mockRejectedValue(new Error('db down'));
    await expect(dispatchOrderSubmittedEmails(CTX)).resolves.toBeUndefined();
  });
});

describe('dispatchOrderStatusEmail (Goal 3b seam)', () => {
  it('sends the in-production email on accept', async () => {
    await dispatchOrderStatusEmail(CTX, 'in_production');
    expect(notifyMocks.notifyOrderInProduction).toHaveBeenCalledWith(
      'casey@example.com',
      expect.objectContaining({ orderNumber: 'ORDER-1', vehicleLabel: '2021 Ford Transit' }),
      effectsSentinel,
    );
    expect(notifyMocks.notifyOrderFulfilled).not.toHaveBeenCalled();
  });

  it('sends the fulfilled email on completion', async () => {
    await dispatchOrderStatusEmail(CTX, 'fulfilled');
    expect(notifyMocks.notifyOrderFulfilled).toHaveBeenCalledOnce();
    expect(notifyMocks.notifyOrderInProduction).not.toHaveBeenCalled();
  });
});
