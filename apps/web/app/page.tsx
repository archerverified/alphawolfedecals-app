import type { Metadata } from 'next';
import Link from 'next/link';
import { SiteFooter } from '../components/SiteFooter';

// Canonical home (Goal 10 D6) — resolves against metadataBase in the root layout.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
};

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
        <h1 className="text-3xl font-semibold text-zinc-900">Alpha Wolf Wrap Studio</h1>
        <p className="text-zinc-600">Design or print a vehicle wrap.</p>
        <nav className="flex gap-3">
          <Link
            href="/signup"
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-zinc-800"
          >
            I&apos;m a customer
          </Link>
          <Link
            href="/signup-shop"
            className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-100"
          >
            I run a wrap shop
          </Link>
        </nav>
        <div className="flex gap-4 text-sm text-zinc-600">
          <Link href="/vehicles/select" className="underline-offset-2 hover:underline">
            Browse vehicles
          </Link>
          <Link href="/signin" className="underline-offset-2 hover:underline">
            Sign in
          </Link>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
