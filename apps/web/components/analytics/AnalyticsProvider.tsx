'use client';

// PostHog bootstrap (Goal 2a). Initialises the posthog-js singleton once on the
// client when NEXT_PUBLIC_POSTHOG_KEY is configured; renders nothing. Absent the
// key (CI, local without secrets) it is a clean no-op, so analytics is fully
// env-gated. Mounted once from the root layout.
//
// CSP note: us.i.posthog.com is already allow-listed in middleware.ts connect-src.

import { useEffect } from 'react';
import posthog from 'posthog-js';
import { POSTHOG_TOKEN } from '../../lib/analytics';

let initialised = false;

export function AnalyticsProvider(): null {
  useEffect(() => {
    if (initialised) return;
    if (!POSTHOG_TOKEN) return;
    posthog.init(POSTHOG_TOKEN, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      capture_pageview: true,
      capture_pageleave: true,
      // We use custom auth (no Supabase Auth); only profile identified users.
      person_profiles: 'identified_only',
    });
    initialised = true;
  }, []);

  return null;
}
