// Server-side PostHog capture (Goal 3c). apps/web's existing analytics helper
// (lib/analytics.ts) is posthog-js — client-only. Order email dispatch happens
// in Server Actions / the BullMQ worker, so we need a server path.
//
// Rather than add posthog-node, hit the public /capture/ HTTP endpoint directly:
// zero new deps, runs on any runtime, and degrades to a no-op when no project
// key is configured (CI, local without secrets). Best-effort + time-bounded —
// analytics must never throw into, or stall, the order path. The caller awaits
// this so the flush completes before a serverless function can freeze.

const HOST = (process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(/\/+$/, '');
// POSTHOG_API_KEY is the canonical server var (.env.example); POSTHOG_KEY is a
// legacy alias still listed in turbo.json globalEnv — accept either.
const PROJECT_KEY = process.env.POSTHOG_API_KEY ?? process.env.POSTHOG_KEY;

const FLUSH_TIMEOUT_MS = 2_000;

export function isServerAnalyticsEnabled(): boolean {
  return Boolean(PROJECT_KEY);
}

export async function captureServerEvent(
  event: string,
  distinctId: string,
  properties: Record<string, unknown> = {},
): Promise<void> {
  if (!PROJECT_KEY) return; // no-op without a key

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FLUSH_TIMEOUT_MS);
  try {
    await fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        api_key: PROJECT_KEY,
        event,
        distinct_id: distinctId || 'server',
        properties: { ...properties, $lib: 'alphawolf-server' },
      }),
      signal: controller.signal,
      // Don't let Next's fetch cache memoize an analytics POST.
      cache: 'no-store',
    });
  } catch {
    // Best-effort — swallow network errors, aborts, anything.
  } finally {
    clearTimeout(timer);
  }
}
