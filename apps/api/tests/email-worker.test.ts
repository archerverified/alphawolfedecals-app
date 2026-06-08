// Email retry worker processor (Goal 3c). The BullMQ wiring (Redis connection,
// Worker construction) is integration-only, but the per-job processor is pure and
// must (a) re-send the rendered message and (b) re-throw on failure so BullMQ's
// retry/backoff policy kicks in.

import { describe, expect, it, vi } from 'vitest';
import type { EmailRetryJob } from '@alphawolf/notifications';
import { processEmailJob } from '../src/queue/email-worker.js';

const JOB: EmailRetryJob = {
  kind: 'order_submitted',
  to: 'casey@example.com',
  subject: 'We received your design (Order #A1B2C3D4)',
  html: '<p>hi</p>',
  text: 'hi',
};

describe('processEmailJob', () => {
  it('re-sends the rendered email via the injected sender', async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    await processEmailJob(JOB, send);
    expect(send).toHaveBeenCalledWith({
      to: JOB.to,
      subject: JOB.subject,
      html: JOB.html,
      text: JOB.text,
    });
  });

  it('propagates a send failure so BullMQ applies its retry/backoff', async () => {
    const send = vi.fn().mockRejectedValue(new Error('resend 500'));
    await expect(processEmailJob(JOB, send)).rejects.toThrow('resend 500');
  });
});
