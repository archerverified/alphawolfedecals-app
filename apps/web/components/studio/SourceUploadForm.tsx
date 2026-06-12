'use client';

// Studio ingest form (Goal 6 D1 stage 1): one owned source file + the
// reference measurements from the strategy doc (overall length, wheelbase,
// wrap height). Posts to the admin-gated uploadStudioSourceAction.

import { useActionState } from 'react';
import { CSRF_FIELD_NAME } from '@alphawolf/auth';
import { uploadStudioSourceAction, type StudioActionState } from '../../lib/actions/studio';

const initial: StudioActionState = { ok: false };

const inputCls =
  'w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none';

export function SourceUploadForm({
  vehicleId,
  csrfToken,
}: {
  vehicleId: string;
  csrfToken: string;
}) {
  const [state, action, pending] = useActionState<StudioActionState, FormData>(
    uploadStudioSourceAction,
    initial,
  );

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name={CSRF_FIELD_NAME} value={csrfToken} />
      <input type="hidden" name="vehicleId" value={vehicleId} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Source kind</span>
          <select name="kind" className={inputCls} defaultValue="photo" required>
            <option value="photo">Shop photo (orthographic)</option>
            <option value="oem_pdf">OEM dimensional drawing (PDF)</option>
            <option value="owned_svg">Owned SVG art</option>
          </select>
        </label>
        <label className="block text-sm sm:col-span-2">
          <span className="mb-1 block text-xs font-medium text-zinc-500">File (max 50 MB)</span>
          <input
            type="file"
            name="file"
            required
            accept=".jpg,.jpeg,.png,.heic,.heif,.webp,.svg,.pdf"
            className="block w-full text-sm text-zinc-600 file:mr-3 file:rounded-md file:border-0 file:bg-zinc-900 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white hover:file:bg-zinc-800"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Overall length (mm)</span>
          <input type="number" name="overallLengthMm" min={1} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Wheelbase (mm)</span>
          <input type="number" name="wheelbaseMm" min={1} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Wrap height (mm)</span>
          <input type="number" name="wrapHeightMm" min={1} className={inputCls} />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-zinc-500">Notes</span>
          <input type="text" name="notes" maxLength={300} className={inputCls} />
        </label>
      </div>
      {state.message ? (
        <p className={`text-sm ${state.ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {state.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
      >
        {pending ? 'Uploading…' : 'Upload source'}
      </button>
    </form>
  );
}
