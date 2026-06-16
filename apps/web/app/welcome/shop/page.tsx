// Shop post-verification landing.
// PRD §10.2 AC: "lands user on printer/media setup wizard (skippable but flagged)".
// The wizard itself is GH-009 (separate PR) — this is the placeholder
// destination that proves the verification + org creation flow completes.

import { Eyebrow } from '@alphawolf/ui/components/ui/eyebrow';

export const metadata = {
  title: 'Set up your shop — Alpha Wolf Wrap Studio',
};

export default function ShopWelcomePage() {
  return (
    <main className="flex min-h-screen flex-col bg-zinc-50 px-4 py-16">
      <div className="mx-auto w-full max-w-2xl">
        <Eyebrow>Shop verified</Eyebrow>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Your shop is live.
        </h1>
        <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-600">
          Configure your printer and media so every export lands print-correct from day one.
        </p>
        <div
          data-testid="shop-welcome"
          className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-sm text-zinc-500"
        >
          Printer and media setup is coming next — we’ll walk you through profiles, media widths,
          and bleed so every export prints right the first time.
        </div>
      </div>
    </main>
  );
}
