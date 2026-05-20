// Customer post-verification landing.
// PRD §10.1 AC: "user lands on vehicle selector with their account scoped to customer".
// The vehicle selector itself shipped in GH-003 (this PR), so the welcome screen
// now links straight into it.

import Link from 'next/link';

export const metadata = {
  title: 'Welcome — Alpha Wolf Wrap Studio',
};

export default function CustomerWelcomePage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-zinc-900">You're in.</h1>
        <p className="mt-2 text-zinc-600">Pick the vehicle you want to wrap to get started.</p>
        <div
          data-testid="customer-welcome"
          className="mt-8 rounded-xl border border-zinc-200 bg-white p-8 text-center"
        >
          <p className="text-sm text-zinc-600">
            Your design starts on an accurate vehicle outline.
          </p>
          <Link
            href="/vehicles/select"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
          >
            Choose your vehicle
          </Link>
        </div>
      </div>
    </main>
  );
}
