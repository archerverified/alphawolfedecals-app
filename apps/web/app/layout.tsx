import type { Metadata } from 'next';
import type { ReactNode } from 'react';
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
        <Toaster richColors closeButton />
      </body>
    </html>
  );
}
