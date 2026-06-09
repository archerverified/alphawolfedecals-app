// submitForProductionAction validation (Goal 3a PR5).
//
// The server action never trusts client input: a missing name or malformed email
// must be rejected BEFORE any DB write, and accepted input must be trimmed. We mock
// the auth guard + the db repo so this exercises only the action's own logic.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { requireUserMock, submitMock, dispatchMock } = vi.hoisted(() => ({
  requireUserMock: vi.fn(),
  submitMock: vi.fn(),
  dispatchMock: vi.fn(),
}));

vi.mock('@/lib/admin/guard', () => ({ requireUser: requireUserMock }));
vi.mock('@alphawolf/db', () => ({ orders: { submitForProduction: submitMock } }));
vi.mock('@/lib/notifications/order-emails', () => ({ dispatchOrderSubmittedEmails: dispatchMock }));

import { submitForProductionAction } from '@/lib/actions/order';

beforeEach(() => {
  requireUserMock.mockReset().mockResolvedValue({ id: 'user-1' });
  submitMock.mockReset().mockResolvedValue({ ok: true, orderId: 'order-1', status: 'submitted' });
  dispatchMock.mockReset().mockResolvedValue(undefined);
});

describe('submitForProductionAction', () => {
  it('rejects a missing name or malformed email without touching the DB', async () => {
    expect(
      await submitForProductionAction({
        projectId: 'p1',
        contactName: '',
        contactEmail: 'a@b.com',
      }),
    ).toEqual({ ok: false, reason: 'invalid_input' });

    expect(
      await submitForProductionAction({
        projectId: 'p1',
        contactName: 'Jane',
        contactEmail: 'not-an-email',
      }),
    ).toEqual({ ok: false, reason: 'invalid_input' });

    expect(submitMock).not.toHaveBeenCalled();
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('trims input and creates an order on valid details', async () => {
    const res = await submitForProductionAction({
      projectId: 'p1',
      contactName: '  Jane  ',
      contactEmail: ' jane@example.com ',
      contactPhone: ' 555 ',
      deliveryNotes: '   ',
    });

    expect(res).toEqual({ ok: true, orderId: 'order-1' });
    expect(submitMock).toHaveBeenCalledWith('user-1', {
      projectId: 'p1',
      contactName: 'Jane',
      contactEmail: 'jane@example.com',
      contactPhone: '555',
      deliveryNotes: null,
    });
  });

  it('dispatches the order-submitted notifications after a successful create', async () => {
    await submitForProductionAction({
      projectId: 'p1',
      contactName: '  Jane  ',
      contactEmail: ' jane@example.com ',
    });

    expect(dispatchMock).toHaveBeenCalledWith({
      orderId: 'order-1',
      ownerUserId: 'user-1',
      projectId: 'p1',
      customerEmail: 'jane@example.com',
      customerName: 'Jane',
    });
  });

  it('propagates a repo failure reason and sends no email', async () => {
    submitMock.mockResolvedValue({ ok: false, reason: 'no_working_version' });
    const res = await submitForProductionAction({
      projectId: 'p1',
      contactName: 'Jane',
      contactEmail: 'jane@example.com',
    });
    expect(res).toEqual({ ok: false, reason: 'no_working_version' });
    expect(dispatchMock).not.toHaveBeenCalled();
  });

  it('still returns success if the notification dispatch throws (never blocks the order)', async () => {
    dispatchMock.mockRejectedValue(new Error('notify exploded'));
    const res = await submitForProductionAction({
      projectId: 'p1',
      contactName: 'Jane',
      contactEmail: 'jane@example.com',
    });
    expect(res).toEqual({ ok: true, orderId: 'order-1' });
  });
});
