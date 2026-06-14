// Goal 2a — curated Alpha Wolf template catalogue. Public, non-PII catalogue
// data (the repo runs on withSystem). Lists the published AW-TPL templates as
// cards; each card is an entry point into the detail route, not the interaction
// itself. The cascade/search browse lives at /vehicles/select.

import type { Metadata } from 'next';
import Link from 'next/link';
import { vehicles } from '@alphawolf/db';
import { AwTemplateCard } from '../../components/vehicles/AwTemplateCard';

// Reads live published templates per request.
export const dynamic = 'force-dynamic';

// Title via the root template; canonical + OG for the catalogue (Goal 10 D6).
export const metadata: Metadata = {
  title: 'Vehicle templates',
  description: 'Browse Alpha Wolf wrap-safe vehicle templates and start your custom wrap design.',
  alternates: { canonical: '/vehicles' },
  openGraph: { url: '/vehicles', title: 'Vehicle templates' },
};

export default async function VehiclesPage() {
  const templates = await vehicles.listAlphaWolfTemplates();

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12" data-testid="vehicles-browse">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8">
          <p className="text-xs uppercase tracking-widest text-zinc-500">Alpha Wolf Wrap Studio</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Vehicle templates</h1>
          <p className="mt-2 max-w-2xl text-sm text-zinc-600">
            Start your wrap on an accurate, wrap-safe Alpha Wolf outline. Pick a template to see the
            full multi-view layout and open it in the editor.
          </p>
        </header>

        {templates.length > 0 ? (
          <div
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="vehicle-card-grid"
          >
            {templates.map((t) => (
              <AwTemplateCard key={t.id} template={t} />
            ))}
          </div>
        ) : (
          <div
            data-testid="vehicles-empty"
            className="rounded-xl border border-zinc-200 bg-white p-10 text-center"
          >
            <p className="text-sm font-medium text-zinc-800">No templates published yet.</p>
            <p className="mt-1 text-sm text-zinc-500">
              Check back soon — new wraps land regularly.
            </p>
          </div>
        )}

        <p className="mt-8 text-center text-sm text-zinc-500">
          Looking for a specific year/make/model?{' '}
          <Link
            href="/vehicles/select"
            className="font-medium text-zinc-900 underline-offset-2 hover:underline"
          >
            Search the full catalogue →
          </Link>
        </p>
      </div>
    </main>
  );
}
