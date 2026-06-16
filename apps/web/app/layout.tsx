import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from '@alphawolf/ui/components/ui/sonner';
import { AnalyticsProvider } from '../components/analytics/AnalyticsProvider';
import { appBaseUrl } from '../lib/base-url';
import { fontVariables } from './fonts';
import './globals.css';

// Site-wide metadata baseline (Goal 10 D6). metadataBase lets every page resolve
// relative canonical/OG URLs; the title template + OG/Twitter cards give public
// pages real social previews. Per-page metadata (canonical, dynamic titles)
// overrides; the placeholder /terms + /privacy keep their own robots:noindex.
const SITE_DESCRIPTION =
  'Design a custom vehicle wrap on your exact vehicle, then take the print-ready pack to a wrap shop.';

export const metadata: Metadata = {
  metadataBase: new URL(appBaseUrl()),
  title: {
    default: 'Alpha Wolf Wrap Studio',
    template: '%s — Alpha Wolf Wrap Studio',
  },
  description: SITE_DESCRIPTION,
  applicationName: 'Alpha Wolf Wrap Studio',
  openGraph: {
    type: 'website',
    siteName: 'Alpha Wolf Wrap Studio',
    title: 'Alpha Wolf Wrap Studio',
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Alpha Wolf Wrap Studio',
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={fontVariables}>
      <body className="font-sans antialiased">
        {/* PostHog bootstrap (env-gated, no-op without NEXT_PUBLIC_POSTHOG_KEY). */}
        <AnalyticsProvider />
        {children}
        {/* Sonner toast host (upload success/failure, parse-complete — GH-005).
            bottom-right so a success toast never occludes the editor top-bar
            Save / Submit-for-production controls (Goal 14 · D13-2). */}
        <Toaster richColors closeButton position="bottom-right" />
        {/* Vercel Speed Insights (RUM) and Analytics — no-ops outside Vercel hosting. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
