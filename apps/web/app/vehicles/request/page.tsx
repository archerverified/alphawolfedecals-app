// GH-017 request form. Requires a signed-in user (so the request is owned and
// the requester can be notified). Prefilled from the browse selection when the
// user arrives via the "Don't see your vehicle?" CTA.

import Link from 'next/link';
import { requireUser } from '../../../lib/admin/guard';
import { getOrCreateFormCsrfToken } from '../../../lib/csrf';
import { RequestForm } from '../../../components/vehicles/RequestForm';

export const metadata = {
  title: 'Request a vehicle — Alpha Wolf Wrap Studio',
};

type Search = { year?: string; make?: string; model?: string; trim?: string };

export default async function RequestVehiclePage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  await requireUser('/vehicles/request');
  const csrfToken = await getOrCreateFormCsrfToken();
  const { year, make, model, trim } = await searchParams;

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="mx-auto max-w-md">
        <Link href="/vehicles/select" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← Back to browse
        </Link>
        <header className="mb-6 mt-4">
          <h1 className="text-2xl font-semibold text-zinc-900">Request this vehicle</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Tell us what you drive and we’ll build the template. You’ll get an email when it ships.
          </p>
        </header>
        <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
          <RequestForm csrfToken={csrfToken} prefill={{ year, make, model, trim }} />
        </div>
      </div>
    </main>
  );
}
