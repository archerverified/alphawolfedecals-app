// Client-side analytics helper (Goal 2a). Thin wrapper over the posthog-js
// singleton so call sites stay decoupled from init + degrade to a no-op when
// NEXT_PUBLIC_POSTHOG_KEY is absent (CI, local without secrets). Analytics must
// never throw into the UX path, so every capture is best-effort.
//
// Client-only: import this from 'use client' components, never from a Server
// Component (posthog-js touches `window`).

import posthog from 'posthog-js';

export function isAnalyticsEnabled(): boolean {
  return typeof window !== 'undefined' && Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY);
}

export function capture(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Swallow — a failed analytics call must not break the page.
  }
}
