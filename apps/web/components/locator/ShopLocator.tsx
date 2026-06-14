'use client';

// Shop locator UI (Goal 9 / D3). Platform shops (opted-in) first, then the
// curated directory, then a "search near you" maps fallback. Each handoff click
// fires shop_handoff_clicked with its source so the B2B funnel is measurable.

import { useState } from 'react';
import { Check, MapPin, Store } from 'lucide-react';
import type { PublicShop } from '@alphawolf/db';

import { capture } from '@/lib/analytics';
import { mapsSearchUrl, type DirectoryShop } from '@/lib/locator/directory';

type Props = {
  platformShops: PublicShop[];
  directory: DirectoryShop[];
};

// Only ever follow http(s) links — a curated directory entry can't become a
// javascript:/data: href sink.
function safeHref(url: string | undefined, fallback: string): string {
  if (!url) return fallback;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? url : fallback;
  } catch {
    return fallback;
  }
}

export function ShopLocator({ platformShops, directory }: Props) {
  const [query, setQuery] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);

  function handoff(source: 'platform' | 'directory' | 'maps', meta: Record<string, unknown> = {}) {
    capture('shop_handoff_clicked', { source, ...meta });
  }

  const hasListings = platformShops.length > 0 || directory.length > 0;

  return (
    <div className="flex flex-col gap-6">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-zinc-500">Your city or ZIP</span>
        <input
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="e.g. Austin, TX or 78701"
          data-testid="locator-query"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900"
        />
      </label>

      {!hasListings ? (
        <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-4 text-sm text-zinc-500">
          We’re still building our partner network in your area. Enter your location below to find a
          trusted wrap shop near you on the map — bring your downloaded spec pack and they’ll take
          it from there.
        </p>
      ) : null}

      {platformShops.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">Alpha Wolf partner shops</h2>
          <ul className="flex flex-col gap-2">
            {platformShops.map((s) => {
              const isChosen = chosen === s.id;
              return (
                <li
                  key={s.id}
                  data-testid={`platform-shop-${s.id}`}
                  className={
                    'rounded-lg border bg-white px-4 py-3 ' +
                    (isChosen ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-zinc-200')
                  }
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-zinc-900">{s.name}</p>
                      {s.city ? <p className="text-xs text-zinc-500">{s.city}</p> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setChosen(s.id);
                        handoff('platform', { shop_id: s.id });
                      }}
                      aria-pressed={isChosen}
                      className={
                        'inline-flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ' +
                        (isChosen
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-zinc-900 text-white hover:bg-zinc-800')
                      }
                    >
                      {isChosen ? (
                        <Check className="size-4" aria-hidden />
                      ) : (
                        <Store className="size-4" aria-hidden />
                      )}
                      {isChosen ? 'Chosen' : 'Choose'}
                    </button>
                  </div>
                  {isChosen ? (
                    <p className="mt-2 text-xs text-zinc-600" aria-live="polite">
                      Take your downloaded spec pack to{' '}
                      <span className="font-medium">{s.name}</span> and mention Alpha Wolf Wrap
                      Studio — they’ll print and install it.
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {directory.length > 0 ? (
        <section>
          <h2 className="mb-2 text-sm font-medium text-zinc-700">More shops</h2>
          <ul className="flex flex-col gap-2">
            {directory.map((s) => (
              <li
                key={`${s.name}-${s.city}`}
                className="flex items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-white px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{s.name}</p>
                  <p className="text-xs text-zinc-500">
                    {s.city}
                    {s.region ? `, ${s.region}` : ''}
                  </p>
                </div>
                <a
                  href={safeHref(s.url, mapsSearchUrl(`${s.name} ${s.city}`))}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handoff('directory', { name: s.name })}
                  className="shrink-0 text-sm font-medium text-sky-700 underline-offset-2 hover:underline"
                >
                  Visit <span className="sr-only">(opens in a new tab)</span>→
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <a
        href={mapsSearchUrl(query)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => handoff('maps', { query })}
        data-testid="locator-maps"
        className="inline-flex items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-100"
      >
        <MapPin className="size-4" aria-hidden />
        Search wrap shops near you on the map
        <span className="sr-only">(opens in a new tab)</span>
      </a>
    </div>
  );
}
