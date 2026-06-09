import { describe, expect, it, vi } from 'vitest';
import {
  dispatchOrderEmail,
  notifyOrderSubmitted,
  notifyOrderReceived,
  notifyOrderInProduction,
  notifyOrderFulfilled,
  type EmailMessage,
  type EmailRetryJob,
  type NotificationEffects,
  type OrderEmailData,
} from '../src/index.js';

const DATA: OrderEmailData = {
  firstName: 'Casey',
  orderNumber: 'A1B2C3D4',
  vehicleLabel: 'Ford Transit 2021',
};

function makeEffects(overrides: Partial<NotificationEffects> = {}): {
  effects: NotificationEffects;
  sent: EmailMessage[];
  captured: Array<{ event: string; props: Record<string, unknown> }>;
  exceptions: unknown[];
  retried: EmailRetryJob[];
} {
  const sent: EmailMessage[] = [];
  const captured: Array<{ event: string; props: Record<string, unknown> }> = [];
  const exceptions: unknown[] = [];
  const retried: EmailRetryJob[] = [];
  const effects: NotificationEffects = {
    send: async (m) => {
      sent.push(m);
    },
    capture: (event, props) => {
      captured.push({ event, props });
    },
    captureException: (err) => {
      exceptions.push(err);
    },
    enqueueRetry: async (job) => {
      retried.push(job);
    },
    ...overrides,
  };
  return { effects, sent, captured, exceptions, retried };
}

describe('dispatchOrderEmail', () => {
  it('sends the rendered email and captures email_sent on success', async () => {
    const { effects, sent, captured, exceptions } = makeEffects();

    const result = await dispatchOrderEmail('order_submitted', 'casey@example.com', DATA, effects);

    expect(result).toEqual({ kind: 'order_submitted', sent: true, queuedForRetry: false });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.to).toBe('casey@example.com');
    expect(sent[0]!.subject).toContain(DATA.orderNumber);
    expect(captured).toEqual([
      { event: 'email_sent', props: expect.objectContaining({ template: 'order_submitted' }) },
    ]);
    expect(exceptions).toHaveLength(0);
  });

  it('on send failure: does not throw, returns sent:false, captures failure + enqueues retry', async () => {
    const boom = new Error('resend 500');
    const { effects, captured, exceptions, retried } = makeEffects({
      send: async () => {
        throw boom;
      },
    });

    const result = await dispatchOrderEmail('order_received', 'shop@example.com', DATA, effects);

    expect(result).toEqual({ kind: 'order_received', sent: false, queuedForRetry: true });
    expect(captured).toEqual([
      {
        event: 'email_delivery_failed',
        props: expect.objectContaining({ template: 'order_received' }),
      },
    ]);
    expect(exceptions).toContain(boom);
    expect(retried).toHaveLength(1);
    expect(retried[0]).toMatchObject({ kind: 'order_received', to: 'shop@example.com' });
  });

  it('failure with no retry effect wired: sent:false, queuedForRetry:false, no throw', async () => {
    const { effects } = makeEffects({
      send: async () => {
        throw new Error('down');
      },
      enqueueRetry: undefined,
    });

    const result = await dispatchOrderEmail('order_fulfilled', 'casey@example.com', DATA, effects);

    expect(result).toEqual({ kind: 'order_fulfilled', sent: false, queuedForRetry: false });
  });

  it('a retry-enqueue that itself fails is swallowed (still no throw)', async () => {
    const retryErr = new Error('redis down');
    const { effects, exceptions } = makeEffects({
      send: async () => {
        throw new Error('resend down');
      },
      enqueueRetry: async () => {
        throw retryErr;
      },
    });

    const result = await dispatchOrderEmail(
      'order_in_production',
      'casey@example.com',
      DATA,
      effects,
    );

    expect(result.sent).toBe(false);
    expect(result.queuedForRetry).toBe(false);
    expect(exceptions).toContain(retryErr);
  });

  it('works when optional effects (capture/captureException) are omitted', async () => {
    const send = vi.fn(async () => {});
    const result = await dispatchOrderEmail('order_submitted', 'casey@example.com', DATA, { send });
    expect(result.sent).toBe(true);
    expect(send).toHaveBeenCalledOnce();
  });

  it('awaits an async capture before resolving (so a fetch-based flush completes)', async () => {
    let flushed = false;
    // A real PostHog flush is network I/O (a macrotask). Model it with a timer:
    // if dispatch fire-and-forgets the capture, it resolves before this settles.
    const result = await dispatchOrderEmail('order_submitted', 'casey@example.com', DATA, {
      send: async () => {},
      capture: () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            flushed = true;
            resolve();
          }, 10),
        ),
    });
    expect(result.sent).toBe(true);
    expect(flushed).toBe(true);
  });

  it('named helpers dispatch the matching kind', async () => {
    const { effects, sent } = makeEffects();
    await notifyOrderSubmitted('a@example.com', DATA, effects);
    await notifyOrderReceived('b@example.com', DATA, effects);
    await notifyOrderInProduction('c@example.com', DATA, effects);
    await notifyOrderFulfilled('d@example.com', DATA, effects);
    expect(sent.map((m) => m.to)).toEqual([
      'a@example.com',
      'b@example.com',
      'c@example.com',
      'd@example.com',
    ]);
  });
});
