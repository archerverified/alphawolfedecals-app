// GH-003: vehicle browse + select. Public (published templates are public,
// non-PII catalog data — the repo runs on withSystem). Initial year list is
// loaded server-side; the rest of the cascade streams in on the client.

import { vehicles } from '@alphawolf/db';
import { VehicleBrowser } from '../../../components/vehicles/VehicleBrowser';

// Reads live published templates per request (and serves locally-stored assets).
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Choose your vehicle — Alpha Wolf Wrap Studio',
};

export default async function VehicleSelectPage() {
  const years = await vehicles.listYears();

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Alpha Wolf Wrap Studio</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Choose your vehicle</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Pick your exact year, make, model, and trim — or search — so your design starts on an
            accurate, wrap-safe outline.
          </p>
        </header>
        <VehicleBrowser initialYears={years} />
      </div>
    </main>
  );
}
