'use client';

// Wizard step: logo upload + quality gate (Goal 5 / B2C-004). The "dog crap"
// filter from the PRD (§3 step 3): solid-background rasters get an inline
// warning + one-click background removal (rembg pipeline); logos too small
// for the biggest zone they're assigned to get the DPI math shown, not a
// vague "low quality" shrug. Vector input is praised, not gated.

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle2, Loader2, TriangleAlert, Upload, X } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { capture } from '@/lib/analytics';
import { getAssetAction } from '@/lib/actions/asset';
import type { BriefData } from '@/lib/brief/schema';
import {
  dpiVerdict,
  readUploadMeta,
  MIN_LOGO_DPI,
  type UploadMeta,
  type VehicleDims,
} from '@/lib/brief/quality';
import { useAssetUpload, LOGO_MIME } from './useAssetUpload';
import { StepShell, type BriefPanel } from './steps';

interface Props {
  projectId: string;
  data: BriefData;
  patch: (updater: (prev: BriefData) => BriefData) => void;
  panels: BriefPanel[];
  /** Real overall dimensions (mm) — anchor for the approximate DPI math. */
  vehicleDims: VehicleDims;
}

const VECTOR_MIME = new Set([
  'image/svg+xml',
  'application/pdf',
  'application/postscript',
  'application/illustrator',
]);

export function LogoStep({ projectId, data, patch, panels, vehicleDims }: Props) {
  const logo = data.logo;
  const { phase, upload, removeBackground } = useAssetUpload(projectId);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Session-local view of the uploaded asset (preview URL + parse metadata).
  // On a resumed brief we re-read it once from the asset row.
  const [preview, setPreview] = useState<{
    url: string | null;
    mimeType: string;
    meta: UploadMeta;
  } | null>(null);

  useEffect(() => {
    if (!logo?.assetId || preview) return;
    let cancelled = false;
    getAssetAction({ projectId, assetId: logo.assetId })
      .then((view) => {
        if (cancelled || !view) return;
        setPreview({
          url: view.url,
          mimeType: view.mimeType,
          meta: readUploadMeta(view.parseMetadata),
        });
      })
      .catch((err: unknown) => {
        // Degraded-but-usable: the brief data is intact, only the preview +
        // gate warnings are missing until the next mount. Don't fail silently.
        console.error('[brief/logo] could not re-read the uploaded logo', err);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId, logo?.assetId, preview]);

  const isVector = preview ? VECTOR_MIME.has(preview.mimeType) : false;
  const opaqueRaster = Boolean(preview && !isVector && preview.meta.opaque === true);
  const rembgFailed = Boolean(preview?.meta.rembg.requested && !preview.meta.rembg.removed);
  const rembgRemoved = Boolean(preview?.meta.rembg.removed);

  // DPI against the biggest zone this logo is assigned to (falls back to the
  // brief's included zones when nothing is assigned yet). Assignments are
  // intersected with the CURRENT included zones — excluding a zone after
  // assigning the logo to it must not keep gating against it (PR #125 #3).
  const includedIds = data.zones?.includedPanelIds ?? null;
  const assignedNow = (logo?.zonePanelIds ?? []).filter(
    (id) => includedIds === null || includedIds.includes(id),
  );
  const assignedIds = assignedNow.length ? assignedNow : includedIds;
  const verdict = preview
    ? dpiVerdict(preview.meta.naturalWidth, panels, vehicleDims, assignedIds)
    : null;
  const lowDpi = Boolean(verdict && !verdict.ok && !isVector);

  // One analytics ping per shown warning per asset (not per render).
  const warnedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!logo?.assetId || !preview) return;
    if (!opaqueRaster && !lowDpi) return;
    const key = `${logo.assetId}:${opaqueRaster ? 'o' : ''}${lowDpi ? 'd' : ''}`;
    if (warnedRef.current === key) return;
    warnedRef.current = key;
    if (opaqueRaster) capture('brief_logo_gate_warning', { projectId, kind: 'opaque' });
    if (lowDpi) capture('brief_logo_gate_warning', { projectId, kind: 'low_dpi' });
  }, [logo?.assetId, preview, opaqueRaster, lowDpi, projectId]);

  const handleFile = useCallback(
    async (file: File) => {
      const result = await upload(file, LOGO_MIME);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const { view, meta } = result.asset;
      setPreview({ url: view.url, mimeType: view.mimeType, meta });
      warnedRef.current = null;
      patch((prev) => ({
        ...prev,
        logo: {
          assetId: view.assetId,
          fileName: file.name.slice(0, 200),
          zonePanelIds: prev.logo?.zonePanelIds ?? [],
        },
      }));
    },
    [upload, patch],
  );

  const onRemoveBackground = useCallback(async () => {
    if (!logo?.assetId || !preview) return;
    capture('brief_rembg_requested', { projectId });
    const result = await removeBackground(logo.assetId, preview.mimeType);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    const { view, meta } = result.asset;
    setPreview({ url: view.url, mimeType: view.mimeType, meta });
    if (meta.rembg.removed) toast.success('Background removed.');
    else
      toast.error(
        "We couldn't remove the background automatically. A transparent PNG or vector file fixes it.",
      );
  }, [logo?.assetId, preview, removeBackground, projectId]);

  const clearLogo = () => {
    setPreview(null);
    warnedRef.current = null;
    patch((prev) => ({ ...prev, logo: undefined }));
  };

  const toggleZone = (panelId: string) => {
    patch((prev) => {
      const cur = prev.logo?.zonePanelIds ?? [];
      const zonePanelIds = cur.includes(panelId)
        ? cur.filter((x) => x !== panelId)
        : [...cur, panelId];
      return { ...prev, logo: { ...prev.logo, zonePanelIds } };
    });
  };

  const busy = phase !== 'idle';
  const assignablePanels =
    includedIds === null ? panels : panels.filter((p) => includedIds.includes(p.id));

  return (
    <StepShell
      title="Your logo"
      hint="Optional. PNG with a transparent background or a vector file (SVG/AI/EPS) works best."
    >
      <input
        ref={inputRef}
        data-testid="logo-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/svg+xml,application/pdf,.ai,.eps"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = '';
          if (file) void handleFile(file);
        }}
      />

      {!logo?.assetId ? (
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          data-testid="logo-upload"
        >
          {busy ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {phase === 'uploading' ? 'Uploading…' : 'Processing…'}
            </>
          ) : (
            <>
              <Upload className="size-4" aria-hidden /> Upload your logo
            </>
          )}
        </Button>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-start gap-3 rounded-md border border-zinc-200 bg-white p-3">
            {preview?.url ? (
              <img
                src={preview.url}
                alt="Uploaded logo"
                className="size-20 shrink-0 rounded border border-zinc-100 object-contain"
                style={{
                  backgroundImage: 'repeating-conic-gradient(#f4f4f5 0% 25%, #ffffff 0% 50%)',
                  backgroundSize: '16px 16px',
                }}
              />
            ) : (
              <div className="flex size-20 shrink-0 items-center justify-center rounded bg-zinc-100">
                <Loader2 className="size-4 animate-spin text-zinc-400" aria-hidden />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{logo.fileName ?? 'Logo'}</p>
              {isVector ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Scales sharp to any size — ideal
                  for a full wrap.
                </p>
              ) : rembgRemoved ? (
                <p className="mt-1 flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Background removed.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={clearLogo}
              aria-label="Remove this logo"
              data-testid="logo-remove"
              disabled={busy}
              className="shrink-0 rounded-full p-1 text-zinc-400 hover:text-zinc-700 disabled:pointer-events-none disabled:opacity-50"
            >
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {opaqueRaster && !rembgRemoved ? (
            <div
              className="flex flex-col gap-2 rounded-md border border-amber-200 bg-amber-50 p-3"
              data-testid="logo-warning-opaque"
            >
              <p className="flex items-start gap-2 text-sm text-amber-800">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                This logo has a solid background — on a wrap it prints as a colored box, not a clean
                mark.
              </p>
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void onRemoveBackground()}
                  data-testid="logo-rembg"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
                  Remove background
                </Button>
                {rembgFailed ? (
                  <span className="text-xs text-amber-700">
                    Auto-removal didn&apos;t work on this one — a transparent PNG or vector file is
                    the sure fix.
                  </span>
                ) : (
                  <span className="text-xs text-amber-700">One click — we&apos;ll handle it.</span>
                )}
              </div>
            </div>
          ) : null}

          {lowDpi && verdict ? (
            <div
              className="rounded-md border border-amber-200 bg-amber-50 p-3"
              data-testid="logo-warning-dpi"
            >
              <p className="flex items-start gap-2 text-sm text-amber-800">
                <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
                <span>
                  This file will look blurry printed big: {preview?.meta.naturalWidth}px across the{' '}
                  {verdict.panelName} (~{verdict.widthIn}&quot; wide) is about{' '}
                  <strong>{verdict.dpi} DPI</strong> — {MIN_LOGO_DPI}+ looks sharp. A larger file or
                  a vector (SVG/AI) fixes it.
                </span>
              </p>
            </div>
          ) : null}

          <div>
            <p className="mb-2 text-sm font-medium">Where does the logo go?</p>
            {assignablePanels.length === 0 ? (
              <p className="text-sm text-zinc-500">
                No zones included yet — pick zones in the first step, then assign the logo.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {assignablePanels.map((p) => {
                  const on = (logo.zonePanelIds ?? []).includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => toggleZone(p.id)}
                      aria-pressed={on}
                      data-testid={`logo-zone-${p.id}`}
                      className={
                        'rounded-full border px-3 py-1 text-sm transition-colors ' +
                        (on
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-200 text-zinc-600 hover:border-zinc-400')
                      }
                    >
                      {p.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="self-start"
            disabled={busy}
            onClick={() => inputRef.current?.click()}
          >
            Replace logo
          </Button>
        </div>
      )}
    </StepShell>
  );
}
