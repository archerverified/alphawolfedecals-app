import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { Toaster } from '@alphawolf/ui/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
  title: 'Alpha Wolf Wrap Studio',
  description: 'Vehicle wrap design platform',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Sonner toast host (upload success/failure, parse-complete — GH-005). */}
        <Toaster richColors closeButton position="top-right" />
        {/* Vercel Speed Insights (RUM) and Analytics — no-ops outside Vercel hosting. */}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
