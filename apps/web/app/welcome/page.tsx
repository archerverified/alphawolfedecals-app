// Customer post-verification landing.
// PRD §10.1 AC: "user lands on vehicle selector with their account scoped to customer".
// Vehicle selector itself is GH-003 (separate PR) — this is the placeholder
// destination that proves the verification flow completes.

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
          className="mt-8 rounded-xl border border-dashed border-zinc-300 bg-white p-8 text-center text-sm text-zinc-500"
        >
          Vehicle selector lands in GH-003.
        </div>
      </div>
    </main>
  );
}
