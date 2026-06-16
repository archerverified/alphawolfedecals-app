// Customer post-verification landing.
// PRD §10.1 AC: "user lands on vehicle selector with their account scoped to customer".
// The vehicle selector itself shipped in GH-003 (this PR), so the welcome screen
// now links straight into it.

import Link from 'next/link';
import { Eyebrow } from '@alphawolf/ui/components/ui/eyebrow';

export const metadata = {
  title: 'Welcome — Alpha Wolf Wrap Studio',
};

// Line-art vehicle outline (design system OutlinePreview), currentColor so it tints
// to the card's muted grey. Reinforces "your design starts on an accurate outline."
function VehicleOutline({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 80"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinejoin="round"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M 22 56 L 22 44 Q 22 38 30 38 L 60 30 Q 70 24 90 24 L 220 24 Q 240 24 252 32 L 280 38 Q 295 38 295 48 L 295 56" />
      <line x1="22" y1="56" x2="295" y2="56" />
      <path d="M 72 30 L 130 26 L 200 26 L 235 32 L 240 38 L 72 38 Z" className="opacity-40" />
      <circle cx="78" cy="56" r="10" />
      <circle cx="240" cy="56" r="10" />
    </svg>
  );
}

export default function CustomerWelcomePage() {
  return (
    <main className="flex min-h-screen flex-col justify-center bg-zinc-50 px-4 py-16">
      <div className="mx-auto w-full max-w-2xl" data-testid="customer-welcome">
        <Eyebrow>You’re verified</Eyebrow>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Choose your vehicle to start.
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
          Your design begins on an accurate, wrap-safe outline of your exact vehicle. Pick the year,
          make, model and trim — we take it from there.
        </p>
        <div className="mt-8 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          <div className="border-b border-zinc-100 bg-zinc-50 px-8 py-10 text-zinc-300">
            <VehicleOutline className="mx-auto h-auto w-full max-w-md" />
          </div>
          <div className="p-8">
            <div className="flex items-center gap-2">
              <span className="bg-brand h-px w-6" aria-hidden />
              <span className="font-mono text-xs text-zinc-500">Step 1 of your wrap</span>
            </div>
            <p className="mt-3 text-sm text-zinc-600">
              The top 50 most-wrapped vehicles in North America are ready to design on now.
            </p>
            <Link
              href="/vehicles/select"
              className="mt-5 inline-flex h-10 items-center justify-center rounded-md bg-zinc-900 px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-zinc-800"
            >
              Choose your vehicle
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}
