// Customer post-verification landing.
// PRD §10.1 AC: "user lands on vehicle selector with their account scoped to customer".
// The vehicle selector itself shipped in GH-003 (this PR), so the welcome screen
// now links straight into it.

import Link from 'next/link';
import { Eyebrow } from '@alphawolf/ui/components/ui/eyebrow';

export const metadata = {
  title: 'Welcome — Alpha Wolf Wrap Studio',
};

export default function CustomerWelcomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-zinc-50 px-4 py-16">
      <div className="mx-auto w-full max-w-2xl" data-testid="customer-welcome">
        <Eyebrow>You’re verified</Eyebrow>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Choose your vehicle to start.
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
          Your design begins on an accurate, wrap-safe outline of your exact vehicle. Pick the year,
          make, model and trim — we take it from there.
        </p>
        <div className="mt-8 rounded-xl border border-zinc-200 bg-white p-8 shadow-sm">
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
    </main>
  );
}
