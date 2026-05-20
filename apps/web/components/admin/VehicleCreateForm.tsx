'use client';

import { useActionState } from 'react';
import { CSRF_FIELD_NAME } from '@alphawolf/auth';
import { createVehicleAction } from '../../lib/actions/admin-vehicle';

type State = {
  ok: boolean;
  message?: string;
  svgErrors?: string[];
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};
const initial: State = { ok: false };

const BODY_TYPES = [
  'sedan',
  'suv',
  'crossover',
  'pickup',
  'van',
  'box_truck',
  'sprinter',
  'motorcycle',
  'rv',
  'trailer',
  'boat',
  'equipment',
];
const SOURCES = ['manufacturer_spec', 'measured_in_shop', 'licensed', 'community_verified'];

export function VehicleCreateForm({ csrfToken }: { csrfToken: string }) {
  const [state, action, pending] = useActionState<State, FormData>(createVehicleAction, initial);
  const v = state.values ?? {};
  const fe = state.fieldErrors ?? {};

  return (
    <form action={action} className="flex flex-col gap-6" noValidate>
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Text
          label="Year"
          name="year"
          type="number"
          required
          defaultValue={v.year}
          error={fe.year}
        />
        <Text label="Make" name="make" required defaultValue={v.make} error={fe.make} />
        <Text label="Model" name="model" required defaultValue={v.model} error={fe.model} />
        <Text label="Trim" name="trim" defaultValue={v.trim} />
        <Text label="Variant" name="variant" defaultValue={v.variant} />
        <Pick
          label="Body type"
          name="bodyType"
          options={BODY_TYPES}
          defaultValue={v.bodyType}
          error={fe.bodyType}
        />
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Text
          label="Length (mm)"
          name="lengthMm"
          type="number"
          required
          defaultValue={v.lengthMm}
          error={fe.lengthMm}
        />
        <Text
          label="Width (mm)"
          name="widthMm"
          type="number"
          required
          defaultValue={v.widthMm}
          error={fe.widthMm}
        />
        <Text
          label="Height (mm)"
          name="heightMm"
          type="number"
          required
          defaultValue={v.heightMm}
          error={fe.heightMm}
        />
        <Text
          label="Wheelbase (mm)"
          name="wheelbaseMm"
          type="number"
          defaultValue={v.wheelbaseMm}
        />
      </section>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Text label="Cab size" name="cabSize" defaultValue={v.cabSize} />
        <Text label="Bed size" name="bedSize" defaultValue={v.bedSize} />
        <Text label="Roof height" name="roofHeight" defaultValue={v.roofHeight} />
        <Text label="Door count" name="doorCount" type="number" defaultValue={v.doorCount} />
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Pick
          label="Source authority"
          name="sourceAuthority"
          options={SOURCES}
          defaultValue={v.sourceAuthority}
          error={fe.sourceAuthority}
        />
        <Text label="Source notes" name="sourceNotes" defaultValue={v.sourceNotes} />
      </section>

      <div className="flex flex-col gap-1">
        <label htmlFor="svg" className="text-sm font-medium text-zinc-800">
          Outline SVG (4-view, conforms to spec §3)
        </label>
        <input
          id="svg"
          name="svg"
          type="file"
          accept=".svg,image/svg+xml"
          required
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-white"
        />
        <p className="text-xs text-zinc-500">
          Validated against §3.4 on upload, optimised with SVGO, then stored.
        </p>
      </div>

      {state.message ? (
        <div
          role="alert"
          data-testid="create-error"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900"
        >
          <p className="font-medium">{state.message}</p>
          {state.svgErrors && state.svgErrors.length > 0 ? (
            <ul className="mt-2 list-inside list-disc space-y-0.5 font-mono text-xs">
              {state.svgErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-fit items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Validating + saving…' : 'Create draft template'}
      </button>
    </form>
  );
}

function Text({
  label,
  name,
  type = 'text',
  required = false,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  error?: string;
}) {
  const id = `vf-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-800">
        {label}
        {required ? ' *' : ''}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        defaultValue={defaultValue ?? ''}
        aria-invalid={Boolean(error) || undefined}
        className={`rounded-md border px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200 ${error ? 'border-red-400' : 'border-zinc-300'}`}
      />
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}

function Pick({
  label,
  name,
  options,
  defaultValue,
  error,
}: {
  label: string;
  name: string;
  options: string[];
  defaultValue?: string;
  error?: string;
}) {
  const id = `vf-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-800">
        {label} *
      </label>
      <select
        id={id}
        name={name}
        defaultValue={defaultValue ?? ''}
        aria-invalid={Boolean(error) || undefined}
        className={`rounded-md border bg-white px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200 ${error ? 'border-red-400' : 'border-zinc-300'}`}
      >
        <option value="">Select…</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
