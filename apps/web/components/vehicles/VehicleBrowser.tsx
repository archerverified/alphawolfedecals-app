'use client';

// Browse + select (GH-003): Year -> Make -> Model -> Trim cascade, body-type
// facets revealed after Model, and a typo-tolerant free-text search alongside.
// Fetches fire on the triggering event (no effect waterfalls); by-model batches
// trims + facets + results into one round-trip; search is debounced + abortable.

import { useId, useRef, useState } from 'react';
import Link from 'next/link';
import type { VehicleFacets, VehicleSummary } from '@alphawolf/db';
import { VehicleCard } from './VehicleCard';

const REQUEST_AFTER_REFINEMENTS = 2;

type Selection = {
  year: number | '';
  make: string;
  model: string;
  trim: string; // '' = any, '__base__' = base (null) trim, else exact
  cabSize: string;
  bedSize: string;
  roofHeight: string;
};

const EMPTY: Selection = {
  year: '',
  make: '',
  model: '',
  trim: '',
  cabSize: '',
  bedSize: '',
  roofHeight: '',
};

async function getJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return (await res.json()) as T;
}

const enc = encodeURIComponent;

export function VehicleBrowser({ initialYears }: { initialYears: number[] }) {
  const [sel, setSel] = useState<Selection>(EMPTY);
  const [makes, setMakes] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [trims, setTrims] = useState<Array<string | null>>([]);
  const [facets, setFacets] = useState<VehicleFacets | null>(null);
  const [results, setResults] = useState<VehicleSummary[]>([]);

  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<VehicleSummary[] | null>(null);
  const [refinements, setRefinements] = useState(0);

  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbort = useRef<AbortController | null>(null);
  const ids = useId();

  function clearSearch(): void {
    if (debounce.current) clearTimeout(debounce.current);
    searchAbort.current?.abort();
    setQuery('');
    setSearchResults(null);
    setRefinements(0);
  }

  async function onYear(value: string): Promise<void> {
    const year = value ? Number(value) : '';
    setSel({ ...EMPTY, year });
    setMakes([]);
    setModels([]);
    setTrims([]);
    setFacets(null);
    setResults([]);
    clearSearch();
    if (year) setMakes(await getJSON<string[]>(`/api/vehicles/makes?year=${year}`));
  }

  async function onMake(make: string): Promise<void> {
    setSel({ ...sel, make, model: '', trim: '', cabSize: '', bedSize: '', roofHeight: '' });
    setModels([]);
    setTrims([]);
    setFacets(null);
    setResults([]);
    if (sel.year && make) {
      setModels(await getJSON<string[]>(`/api/vehicles/models?year=${sel.year}&make=${enc(make)}`));
    }
  }

  async function onModel(model: string): Promise<void> {
    const next = { ...sel, model, trim: '', cabSize: '', bedSize: '', roofHeight: '' };
    setSel(next);
    setTrims([]);
    setFacets(null);
    if (sel.year && sel.make && model) {
      const data = await getJSON<{
        trims: Array<string | null>;
        facets: VehicleFacets | null;
        results: VehicleSummary[];
      }>(`/api/vehicles/by-model?year=${sel.year}&make=${enc(sel.make)}&model=${enc(model)}`);
      setTrims(data.trims);
      setFacets(data.facets);
      setResults(data.results);
    } else {
      setResults([]);
    }
  }

  async function onFilter(patch: Partial<Selection>): Promise<void> {
    const next = { ...sel, ...patch };
    setSel(next);
    if (!next.year || !next.make || !next.model) {
      setResults([]);
      return;
    }
    const p = new URLSearchParams({
      year: String(next.year),
      make: next.make,
      model: next.model,
    });
    if (next.trim) p.set('trim', next.trim);
    if (next.cabSize) p.set('cabSize', next.cabSize);
    if (next.bedSize) p.set('bedSize', next.bedSize);
    if (next.roofHeight) p.set('roofHeight', next.roofHeight);
    setResults(await getJSON<VehicleSummary[]>(`/api/vehicles/results?${p.toString()}`));
  }

  function onSearchInput(q: string): void {
    setQuery(q);
    if (debounce.current) clearTimeout(debounce.current);
    if (q.trim().length < 2) {
      setSearchResults(null);
      return;
    }
    debounce.current = setTimeout(() => void runSearch(q), 250);
  }

  async function runSearch(q: string): Promise<void> {
    searchAbort.current?.abort();
    const ac = new AbortController();
    searchAbort.current = ac;
    try {
      const r = await getJSON<VehicleSummary[]>(`/api/vehicles/search?q=${enc(q)}`, ac.signal);
      setSearchResults(r);
      setRefinements((n) => n + 1);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setSearchResults([]);
    }
  }

  // Truck facets after Model selection; van/sprinter facets likewise.
  const showCabBed = facets?.bodyTypes.some((b) => b === 'pickup' || b === 'box_truck');
  const showRoof = facets?.bodyTypes.some((b) => b === 'van' || b === 'sprinter');

  const active = searchResults ?? results;
  const searching = searchResults !== null;
  const promptRequest =
    searching && (refinements >= REQUEST_AFTER_REFINEMENTS || searchResults.length === 0);

  const requestHref = (() => {
    const p = new URLSearchParams();
    if (sel.year) p.set('year', String(sel.year));
    if (sel.make) p.set('make', sel.make);
    if (sel.model) p.set('model', sel.model);
    if (sel.trim && sel.trim !== '__base__') p.set('trim', sel.trim);
    const qs = p.toString();
    return qs ? `/vehicles/request?${qs}` : '/vehicles/request';
  })();

  return (
    <div className="flex flex-col gap-8">
      {/* Search */}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${ids}-search`} className="text-sm font-medium text-zinc-800">
          Search
        </label>
        <input
          id={`${ids}-search`}
          type="search"
          value={query}
          onChange={(e) => onSearchInput(e.currentTarget.value)}
          placeholder="e.g. 2024 transit 250 high roof"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
        />
        <p className="text-xs text-zinc-500">Typo-tolerant — “transt 250” finds Transit 250.</p>
      </div>

      {/* Cascade */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Select
          id={`${ids}-year`}
          label="Year"
          value={sel.year === '' ? '' : String(sel.year)}
          onChange={onYear}
          options={initialYears.map((y) => ({ value: String(y), label: String(y) }))}
          placeholder="Select year"
        />
        <Select
          id={`${ids}-make`}
          label="Make"
          value={sel.make}
          onChange={onMake}
          disabled={!sel.year}
          options={makes.map((m) => ({ value: m, label: m }))}
          placeholder="Select make"
        />
        <Select
          id={`${ids}-model`}
          label="Model"
          value={sel.model}
          onChange={onModel}
          disabled={!sel.make}
          options={models.map((m) => ({ value: m, label: m }))}
          placeholder="Select model"
        />
        <Select
          id={`${ids}-trim`}
          label="Trim"
          value={sel.trim}
          onChange={(v) => onFilter({ trim: v })}
          disabled={!sel.model || trims.length === 0}
          options={trims.map((t) => ({
            value: t === null ? '__base__' : t,
            label: t === null ? 'Base (no trim)' : t,
          }))}
          placeholder="Any trim"
        />
      </div>

      {/* Body-type facets, revealed after Model */}
      {sel.model && (showCabBed || showRoof) ? (
        <fieldset className="flex flex-col gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <legend className="px-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
            Configuration
          </legend>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {showCabBed ? (
              <>
                <Select
                  id={`${ids}-cab`}
                  label="Cab size"
                  value={sel.cabSize}
                  onChange={(v) => onFilter({ cabSize: v })}
                  options={(facets?.cabSizes ?? []).map((c) => ({ value: c, label: c }))}
                  placeholder="Any cab"
                />
                <Select
                  id={`${ids}-bed`}
                  label="Bed size"
                  value={sel.bedSize}
                  onChange={(v) => onFilter({ bedSize: v })}
                  options={(facets?.bedSizes ?? []).map((b) => ({ value: b, label: b }))}
                  placeholder="Any bed"
                />
              </>
            ) : null}
            {showRoof ? (
              <Select
                id={`${ids}-roof`}
                label="Roof height"
                value={sel.roofHeight}
                onChange={(v) => onFilter({ roofHeight: v })}
                options={(facets?.roofHeights ?? []).map((r) => ({ value: r, label: r }))}
                placeholder="Any roof"
              />
            ) : null}
          </div>
        </fieldset>
      ) : null}

      {/* Results */}
      <div className="flex flex-col gap-4">
        <p className="text-sm text-zinc-600" aria-live="polite">
          {searching
            ? `${active.length} match${active.length === 1 ? '' : 'es'} for “${query}”`
            : active.length > 0
              ? `${active.length} template${active.length === 1 ? '' : 's'}`
              : 'Pick a vehicle above or search to begin.'}
        </p>

        {active.length > 0 ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((v) => (
              <VehicleCard key={v.id} vehicle={v} />
            ))}
          </div>
        ) : null}

        {promptRequest ? (
          <div
            data-testid="request-prompt"
            className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center"
          >
            <p className="text-sm font-medium text-amber-900">Don’t see your exact vehicle?</p>
            <p className="mt-1 text-sm text-amber-800">
              Request it and we’ll email you when the template ships.
            </p>
            <Link
              href={requestHref}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-amber-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-amber-800"
            >
              Request this vehicle
            </Link>
          </div>
        ) : null}
      </div>

      <p className="text-center text-sm text-zinc-500">
        <Link
          href={requestHref}
          className="font-medium text-zinc-900 underline-offset-2 hover:underline"
        >
          Don’t see your vehicle? Request it →
        </Link>
      </p>
    </div>
  );
}

type Option = { value: string; label: string };

function Select({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-800">
        {label}
      </label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => void onChange(e.currentTarget.value)}
        className="rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-400"
      >
        <option value="">{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
