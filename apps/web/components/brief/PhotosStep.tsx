'use client';

// Wizard step: photos of the customer's REAL vehicle (Goal 5 / B2C-004,
// pulling B2C-012 into Phase 1). Reference input only — mods, racks, damage
// the stock template can't know about. Photos print on the spec pack and feed
// the Phase 2 AI orchestrator as context; this is NOT photo-based
// visualization (that stays a v2 spike).

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Camera, Loader2, X } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { capture } from '@/lib/analytics';
import { listAssetsAction } from '@/lib/actions/asset';
import type { BriefData } from '@/lib/brief/schema';
import { useAssetUpload, PHOTO_MIME } from './useAssetUpload';
import { StepShell } from './steps';

const MAX_PHOTOS = 12; // mirrors briefSchema photos.max

const SHOT_PROMPTS = ['Front', 'Back', 'Driver side', 'Passenger side'] as const;

interface Props {
  projectId: string;
  data: BriefData;
  patch: (updater: (prev: BriefData) => BriefData) => void;
}

export function PhotosStep({ projectId, data, patch }: Props) {
  const photos = data.photos ?? [];
  const { phase, upload } = useAssetUpload(projectId);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Signed read URLs for thumbnails. Uploads in this session populate the map
  // directly; on a resumed brief we warm it once from the project's assets.
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    if (photos.length === 0) return;
    if (photos.every((p) => urls[p.assetId])) return;
    let cancelled = false;
    void listAssetsAction({ projectId }).then((assets) => {
      if (cancelled) return;
      setUrls((prev) => {
        const next = { ...prev };
        for (const a of assets) if (a.url) next[a.assetId] = a.url;
        return next;
      });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, photos.length]);

  const addPhoto = useCallback(
    async (file: File) => {
      const result = await upload(file, PHOTO_MIME);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const { view } = result.asset;
      if (view.url) setUrls((prev) => ({ ...prev, [view.assetId]: view.url! }));
      let added = false;
      patch((prev) => {
        const existing = prev.photos ?? [];
        if (existing.length >= MAX_PHOTOS || existing.some((p) => p.assetId === view.assetId)) {
          return prev;
        }
        added = true;
        return { ...prev, photos: [...existing, { assetId: view.assetId }] };
      });
      if (added) capture('brief_photo_added', { projectId, count: photos.length + 1 });
    },
    [upload, patch, projectId, photos.length],
  );

  const setNote = (assetId: string, note: string) => {
    patch((prev) => ({
      ...prev,
      photos: (prev.photos ?? []).map((p) =>
        p.assetId === assetId ? { ...p, note: note || undefined } : p,
      ),
    }));
  };

  // Removes the photo from the brief only — the underlying asset stays in the
  // project (same lifecycle as editor uploads; storage GC is not a wizard
  // concern).
  const remove = (assetId: string) => {
    patch((prev) => ({
      ...prev,
      photos: (prev.photos ?? []).filter((p) => p.assetId !== assetId),
    }));
  };

  const busy = phase !== 'idle';
  const full = photos.length >= MAX_PHOTOS;

  return (
    <StepShell
      title="Photos of your actual vehicle"
      hint="Optional. Racks, bull bars, lift kits, dents — anything the stock template can't know about. Your shop sees these on the spec pack."
    >
      <input
        ref={inputRef}
        data-testid="photo-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void addPhoto(file);
        }}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={busy || full}
          onClick={() => inputRef.current?.click()}
          data-testid="photo-add"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {phase === 'uploading' ? 'Uploading…' : 'Processing…'}
            </>
          ) : (
            <>
              <Camera className="size-4" aria-hidden /> Add a photo
            </>
          )}
        </Button>
        <span className="text-xs text-zinc-500">
          {full
            ? `${MAX_PHOTOS} photos is the max.`
            : `Good shots: ${SHOT_PROMPTS.join(', ').toLowerCase()}.`}
        </span>
      </div>

      {phase === 'parsing' ? (
        <p
          className="mb-4 flex items-center gap-2 text-xs text-zinc-500"
          role="status"
          aria-live="polite"
          data-testid="photo-processing"
        >
          <Loader2 className="size-3.5 animate-spin" aria-hidden />
          Still processing your photo — this can take up to a minute. You can keep filling out the
          brief; we&apos;ll add it as soon as it&apos;s ready.
        </p>
      ) : null}

      <p className="mb-4 text-xs text-zinc-400">
        Tip: keep people out of frame — we only need the vehicle.
      </p>

      {photos.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-400">
          No photos yet. You can skip this — the template still covers the design.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="photo-list">
          {photos.map((p) => (
            <li
              key={p.assetId}
              className="flex flex-col gap-2 rounded-md border border-zinc-200 bg-white p-3"
            >
              <div className="relative">
                {urls[p.assetId] ? (
                  <img
                    src={urls[p.assetId]}
                    alt="Your vehicle"
                    className="h-32 w-full rounded object-cover"
                  />
                ) : (
                  <div className="flex h-32 w-full items-center justify-center rounded bg-zinc-100 text-xs text-zinc-400">
                    Loading preview…
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => remove(p.assetId)}
                  aria-label="Remove this photo"
                  data-testid={`photo-remove-${p.assetId}`}
                  className="absolute right-1.5 top-1.5 rounded-full bg-white/90 p-1 text-zinc-600 shadow hover:text-zinc-900"
                >
                  <X className="size-3.5" aria-hidden />
                </button>
              </div>
              <textarea
                className="w-full rounded-md border border-zinc-200 p-2 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400"
                rows={2}
                maxLength={500}
                placeholder='e.g. "dent on rear left quarter panel"'
                value={p.note ?? ''}
                onChange={(e) => setNote(p.assetId, e.target.value)}
                data-testid={`photo-note-${p.assetId}`}
              />
            </li>
          ))}
        </ul>
      )}
    </StepShell>
  );
}
