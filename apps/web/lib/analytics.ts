// Client-side analytics helper (Goal 2a). Thin wrapper over the posthog-js
// singleton so call sites stay decoupled from init + degrade to a no-op when
// NEXT_PUBLIC_POSTHOG_KEY is absent (CI, local without secrets). Analytics must
// never throw into the UX path, so every capture is best-effort.
//
// Client-only: import this from 'use client' components, never from a Server
// Component (posthog-js touches `window`).

import posthog from 'posthog-js';

// The project provisions the publishable PostHog token as
// NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN in Vercel; NEXT_PUBLIC_POSTHOG_KEY is a
// fallback alias. Both are static literals so Next inlines them at build time.
export const POSTHOG_TOKEN =
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN ?? process.env.NEXT_PUBLIC_POSTHOG_KEY;

export function isAnalyticsEnabled(): boolean {
  return typeof window !== 'undefined' && Boolean(POSTHOG_TOKEN);
}

export function capture(event: string, properties?: Record<string, unknown>): void {
  if (!isAnalyticsEnabled()) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Swallow — a failed analytics call must not break the page.
  }
}
