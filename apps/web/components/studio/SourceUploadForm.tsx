'use client';

// Studio ingest form (Goal 6 D1 stage 1): one owned source file + the
// reference measurements from the strategy doc (overall length, wheelbase,
// wrap height). Direct upload (PR #136 review fix): a Server Action grants a
// signed URL, the browser PUTs the file straight to Storage (Server Action
// bodies are capped at 1 MB), then finalize records the provenance row.

import { useRef, useState } from 'react';
import {
  finalizeStudioSourceAction,
  grantStudioSourceUploadAction,
} from '../../lib/actions/studio';

const inputCls =
  'w-full rounded-md border border-zinc-300 px-2.5 py-1.5 text-sm text-zinc-900 focus:border-zinc-500 focus:outline-none';

export function SourceUploadForm({ vehicleId }: { vehicleId: string }) {
  const formRef = useRef<HTMLFormElement | null>(null);
  const [phase, setPhase] = useState<'idle' | 'uploading'>('idle');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const onSubmit = async (e: React.FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const file = data.get('file');
    const kind = String(data.get('kind') ?? '');
    if (!(file instanceof File) || file.size === 0) {
      setMessage({ ok: false, text: 'Pick a source file first.' });
      return;
    }

    setPhase('uploading');
    setMessage(null);
    try {
      const grant = await grantStudioSourceUploadAction({
        vehicleId,
        fileName: file.name,
        mimeType: file.type,
        size: file.size,
      });
      const put = await fetch(grant.signedUrl, {
        method: 'PUT',
        headers: { 'content-type': file.type, 'x-upsert': 'true' },
        body: file,
      });
      if (!put.ok) throw new Error(`Upload failed (${put.status}).`);

      const result = await finalizeStudioSourceAction({
        vehicleId,
        key: grant.key,
        kind,
        overallLengthMm: Number(data.get('overallLengthMm')) || undefined,
        wheelbaseMm: Number(data.get('wheelbaseMm')) || undefined,
        wrapHeightMm: Number(data.get('wrapHeightMm')) || undefined,
        notes: String(data.get('notes') ?? '') || undefined,
      });
      setMessage({
        ok: result.ok,
        text: result.message ?? (result.ok ? 'Source uploaded.' : 'Failed.'),
      });
      if (result.ok) formRef.current?.reset();
    } catch (err) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : 'Upload failed.' });
    } finally {
      setPhase('idle');
    }
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-3">
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
      {message ? (
        <p className={`text-sm ${message.ok ? 'text-emerald-600' : 'text-red-600'}`}>
          {message.text}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={phase === 'uploading'}
        className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white transition hover:bg-zinc-800 disabled:opacity-50"
      >
        {phase === 'uploading' ? 'Uploading…' : 'Upload source'}
      </button>
    </form>
  );
}
