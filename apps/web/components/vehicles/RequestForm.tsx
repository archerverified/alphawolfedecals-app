'use client';

import { useActionState } from 'react';
import Link from 'next/link';
import { CSRF_FIELD_NAME } from '@alphawolf/auth';
import { submitVehicleRequestAction } from '../../lib/actions/vehicle-request';

type State = {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const initial: State = { ok: false };

type Props = {
  csrfToken: string;
  prefill: { year?: string; make?: string; model?: string; trim?: string };
};

export function RequestForm({ csrfToken, prefill }: Props) {
  const [state, action, pending] = useActionState<State, FormData>(
    submitVehicleRequestAction,
    initial,
  );
  const v = state.values ?? {};

  if (state.ok) {
    return (
      <div data-testid="request-success" className="flex flex-col gap-4 text-center">
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {state.message}
        </p>
        <Link
          href="/vehicles/select"
          className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-800"
        >
          Back to browse
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />

      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Year"
          name="year"
          type="number"
          required
          defaultValue={v.year ?? prefill.year ?? ''}
          error={state.fieldErrors?.year}
        />
        <Field
          label="Make"
          name="make"
          required
          defaultValue={v.make ?? prefill.make ?? ''}
          error={state.fieldErrors?.make}
        />
      </div>
      <Field
        label="Model"
        name="model"
        required
        defaultValue={v.model ?? prefill.model ?? ''}
        error={state.fieldErrors?.model}
      />
      <div className="grid grid-cols-2 gap-3">
        <Field label="Trim (optional)" name="trim" defaultValue={v.trim ?? prefill.trim ?? ''} />
        <Field label="Variant (optional)" name="variant" defaultValue={v.variant ?? ''} />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="req-notes" className="text-sm font-medium text-zinc-800">
          Notes (optional)
        </label>
        <textarea
          id="req-notes"
          name="notes"
          rows={3}
          defaultValue={v.notes ?? ''}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="req-photos" className="text-sm font-medium text-zinc-800">
          Reference photo links (optional, one per line)
        </label>
        <textarea
          id="req-photos"
          name="photos"
          rows={2}
          placeholder="https://…"
          defaultValue={v.photos ?? ''}
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200"
        />
        <p className="text-xs text-zinc-500">Photo uploads arrive with asset upload (GH-005).</p>
      </div>

      <label className="flex items-center gap-2 text-sm text-zinc-700">
        <input
          type="checkbox"
          name="notify"
          defaultChecked
          className="h-4 w-4 rounded border-zinc-300"
        />
        Email me when this template ships
      </label>

      {state.message ? (
        <p
          role="alert"
          className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900"
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}

function Field({
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
  const id = `req-${name}`;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-zinc-800">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        aria-invalid={Boolean(error) || undefined}
        className={`rounded-md border px-3 py-2 text-sm shadow-sm outline-none transition focus:border-zinc-900 focus:ring-2 focus:ring-zinc-200 ${error ? 'border-red-400' : 'border-zinc-300'}`}
      />
      {error ? (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
