// Shop post-verification landing.
// PRD §10.2 AC: "lands user on printer/media setup wizard (skippable but flagged)".
// The wizard itself is GH-009 (separate PR) — this is the placeholder
// destination that proves the verification + org creation flow completes.

export const metadata = {
  title: 'Set up your shop — Alpha Wolf Wrap Studio',
};

export default function ShopWelcomePage() {
  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="mx-auto max-w-2xl">
        <h1 className="text-2xl font-semibold text-zinc-900">Shop is live.</h1>
        <p className="mt-2 text-zinc-600">
          Configure your printer + media so every export is correct from day one.
        </p>
        <div
          data-testid="shop-welcome"
          className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500"
        >
          Printer + media wizard lands in GH-009.
        </div>
      </div>
    </main>
  );
}
