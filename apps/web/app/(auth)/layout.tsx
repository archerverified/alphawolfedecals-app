import type { ReactNode } from 'react';
import Image from 'next/image';
import { Eyebrow } from '@alphawolf/ui/components/ui/eyebrow';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="mx-auto max-w-md">
        <header className="mb-8 flex flex-col items-center gap-2 text-center">
          {/* Brand lockup — the real logo on the near-white surface (sanctioned),
              not the wordmark re-set as type. (Goal 14 D13-5) */}
          <h1 className="sr-only">Alpha Wolf Wrap Studio</h1>
          <Image
            src="/brand/alpha-wolf-logo.png"
            alt="Alpha Wolf Decals"
            width={2399}
            height={750}
            priority
            className="h-auto w-[180px]"
          />
          <Eyebrow>Wrap Studio</Eyebrow>
        </header>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </main>
  );
}
