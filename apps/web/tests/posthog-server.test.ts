// Server-side PostHog capture (Goal 3c). Must be a no-op without a key (keeps CI
// + local green and never breaks the order path) and POST the right shape to the
// capture endpoint when configured. Env is read at module load, so each case
// re-imports after stubbing.

import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.restoreAllMocks();
});

describe('captureServerEvent', () => {
  it('is a no-op (never calls fetch) when no PostHog key is configured', async () => {
    vi.stubEnv('POSTHOG_API_KEY', '');
    vi.stubEnv('POSTHOG_KEY', '');
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const mod = await import('@/lib/notifications/posthog-server');
    expect(mod.isServerAnalyticsEnabled()).toBe(false);
    await mod.captureServerEvent('email_sent', 'user-1', { template: 'order_submitted' });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('POSTs the event to {host}/capture/ when a project key is set', async () => {
    vi.stubEnv('POSTHOG_API_KEY', 'phc_test');
    vi.stubEnv('POSTHOG_HOST', 'https://ph.test');
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true } as unknown as Response);

    const mod = await import('@/lib/notifications/posthog-server');
    await mod.captureServerEvent('email_sent', 'user-1', { template: 'order_submitted' });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe('https://ph.test/capture/');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({
      api_key: 'phc_test',
      event: 'email_sent',
      distinct_id: 'user-1',
    });
    expect(body.properties).toMatchObject({ template: 'order_submitted' });
  });

  it('swallows a fetch rejection (best-effort, never throws)', async () => {
    vi.stubEnv('POSTHOG_API_KEY', 'phc_test');
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network'));

    const mod = await import('@/lib/notifications/posthog-server');
    await expect(mod.captureServerEvent('email_sent', 'user-1')).resolves.toBeUndefined();
  });
});
