import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Eyebrow } from '@alphawolf/ui/components/ui/eyebrow';
import { SiteFooter } from '../components/SiteFooter';

// Canonical home (Goal 10 D6) — resolves against metadataBase in the root layout.
export const metadata: Metadata = {
  alternates: { canonical: '/' },
  openGraph: { url: '/' },
};

// Decorative line-art van outline (from the design system OutlinePreview), drawn in
// currentColor so it inverts cleanly on the dark hero band. Presentational only.
function VanOutline({ className }: { className?: string }) {
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
      <path d="M 22 58 L 22 24 Q 22 18 28 18 L 250 18 Q 270 18 285 32 L 295 50 Q 297 58 290 58" />
      <line x1="22" y1="58" x2="290" y2="58" />
      <circle cx="62" cy="58" r="9" />
      <circle cx="240" cy="58" r="9" />
      <rect x="28" y="22" width="40" height="16" rx="2" className="opacity-60" />
      <line x1="100" y1="18" x2="100" y2="58" className="opacity-60" />
      <rect x="220" y="22" width="56" height="24" rx="2" className="opacity-60" />
    </svg>
  );
}

const STEPS = [
  {
    n: '01',
    title: 'An accurate vehicle outline',
    body: 'Pick your exact year, make, model, and trim. Your design starts on a wrap-safe outline with real panel breaks — not a stock photo.',
  },
  {
    n: '02',
    title: 'AI concepts on your vehicle',
    body: 'Describe the look you want and get photoreal wrap concepts rendered on your actual vehicle — not a generic mockup you have to imagine it on.',
  },
  {
    n: '03',
    title: 'A print-ready pack',
    body: 'Your shop receives panels labelled, laid out, and seamed to body breaks, with bleed and linear feet calculated. Hand it over and go.',
  },
];

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-zinc-50">
      {/* Brand-forward hero band — the one sanctioned full-bleed inverse surface.
          Logo-on-black is explicitly allowed; cyan stays an accent. (Goal 14 D13-5) */}
      <section className="relative bg-zinc-900 text-white">
        <div className="bg-brand/60 absolute inset-x-0 top-0 h-px" aria-hidden />
        <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-5">
          <Eyebrow className="text-zinc-400">Alpha Wolf Wrap Studio</Eyebrow>
          <nav aria-label="Primary" className="flex items-center gap-5 text-sm text-zinc-300">
            <Link href="#how" className="hover:text-white">
              How it works
            </Link>
            <Link href="/signup-shop" className="hover:text-white">
              For wrap shops
            </Link>
            <Link href="/signin" className="hover:text-white">
              Sign in
            </Link>
          </nav>
        </header>

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-6 pt-6 pb-20 lg:grid-cols-2 lg:gap-8 lg:pb-28">
          <div className="flex flex-col items-start gap-6">
            <Eyebrow className="text-zinc-400">Salem, Oregon · Vehicle wraps</Eyebrow>
            <Image
              src="/brand/alpha-wolf-logo.png"
              alt="Alpha Wolf Decals"
              width={2399}
              height={750}
              priority
              className="h-auto w-[220px] sm:w-[260px]"
            />
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl sm:leading-[1.05]">
              Wrap your truck.
              <br />
              <span className="text-brand">Quote-ready</span> in minutes.
            </h1>
            <p className="max-w-md text-base leading-relaxed text-zinc-400">
              Start on the exact outline of your vehicle, get AI wrap concepts rendered on it, and
              hand your shop a print-ready panel pack — no design file to chase.
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-white px-5 text-sm font-medium text-zinc-900 shadow-sm transition-colors hover:bg-zinc-100"
              >
                Start your wrap
                <span aria-hidden>→</span>
              </Link>
              <Link
                href="/vehicles/select"
                className="inline-flex h-11 items-center justify-center rounded-md border border-white/20 px-5 text-sm font-medium text-white transition-colors hover:bg-white/10"
              >
                Browse vehicles
              </Link>
            </div>
            <p className="flex items-center gap-2 text-sm text-zinc-400">
              <span className="bg-brand size-1.5 rounded-full" aria-hidden />
              Top 50 most-wrapped vehicles in North America
            </p>
          </div>

          {/* Outline-preview panel — illustrates "your design starts on an accurate outline" */}
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <div className="flex items-center justify-between gap-3">
              <Eyebrow className="text-zinc-400">Accurate outline</Eyebrow>
              <span className="font-mono text-xs text-zinc-400">236.7″ L · 118.0″ H · 81.3″ W</span>
            </div>
            <div className="my-6 text-zinc-400">
              <VanOutline className="mx-auto h-auto w-4/5" />
            </div>
            <div className="flex flex-wrap gap-2">
              <span className="border-brand/40 text-brand rounded-md border px-2.5 py-1 text-xs font-medium">
                Driver
              </span>
              {['Passenger', 'Rear', 'Roof'].map((v) => (
                <span
                  key={v}
                  className="rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-zinc-400"
                >
                  {v}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Value strip — three honest steps */}
      <section id="how" className="flex-1 border-b border-zinc-200 bg-zinc-50">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <Eyebrow>What you get</Eyebrow>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
            Three honest steps, no design software.
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <div key={s.n} className="rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
                <div className="flex items-center gap-2">
                  <span className="bg-brand h-px w-5" aria-hidden />
                  <span className="font-mono text-xs font-medium text-zinc-500">{s.n}</span>
                </div>
                <h3 className="mt-3 leading-none font-semibold text-zinc-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{s.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
