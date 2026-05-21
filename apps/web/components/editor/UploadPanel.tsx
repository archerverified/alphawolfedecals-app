'use client';

// GH-005 client UI: file picker → signed-URL direct upload → finalize → poll for
// parse → place an ImageElement on the selected panel.
//
// Flow (ADR-0007): the browser uploads bytes DIRECTLY to a short-lived signed
// Storage URL (large files never stream through a Server Action). We validate
// mime + size client-side BEFORE requesting the grant, PUT the bytes, then call
// finalizeAssetUploadAction (rembg optional). We poll getAssetAction until parse
// leaves pending/processing, then add a factory.newImage to the selected panel
// using the signed read url. A crop step (Dialog + Slider) lets the user tighten
// the placed image to the detected content bbox.

import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Upload, Loader2, ImageIcon, Scissors } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { Switch } from '@alphawolf/ui/components/ui/switch';
import { Label } from '@alphawolf/ui/components/ui/label';
import { Slider } from '@alphawolf/ui/components/ui/slider';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@alphawolf/ui/components/ui/dialog';
import { factory } from '@alphawolf/canvas';
import type { ImageElement, PanelId, VehicleView } from '@alphawolf/canvas';
import {
  requestAssetUploadAction,
  finalizeAssetUploadAction,
  getAssetAction,
  type AssetView,
} from '@/lib/actions/asset';

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // mirror @alphawolf/parse
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/svg+xml',
  'application/pdf',
  'application/postscript',
  'application/illustrator',
]);
const TERMINAL = new Set(['parsed', 'failed', 'queued_missing_cli']);

interface ParseMeta {
  naturalWidth: number | null;
  naturalHeight: number | null;
  contentBbox: { left: number; top: number; width: number; height: number } | null;
}

function readMeta(meta: unknown): ParseMeta {
  if (!meta || typeof meta !== 'object') {
    return { naturalWidth: null, naturalHeight: null, contentBbox: null };
  }
  const m = meta as Record<string, unknown>;
  const bbox = m.contentBbox;
  return {
    naturalWidth: typeof m.naturalWidth === 'number' ? m.naturalWidth : null,
    naturalHeight: typeof m.naturalHeight === 'number' ? m.naturalHeight : null,
    contentBbox: bbox && typeof bbox === 'object' ? (bbox as ParseMeta['contentBbox']) : null,
  };
}

interface Props {
  projectId: string;
  /** The panel a placed image is parented to (the current selection's panel). */
  targetPanelId: PanelId | null;
  targetView: VehicleView | null;
  /** Mint the next element id from the document seq. */
  mintId: () => string;
  /** Add the freshly-placed image element. */
  onPlaceImage: (el: ImageElement) => void;
}

type Phase = 'idle' | 'uploading' | 'parsing';

interface PendingCrop {
  assetView: AssetView;
  meta: ParseMeta;
}

export function UploadPanel({ projectId, targetPanelId, targetView, mintId, onPlaceImage }: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [rembg, setRembg] = useState(false);
  const [crop, setCrop] = useState<PendingCrop | null>(null);
  const [cropTight, setCropTight] = useState(100); // 0..100 → none..full content trim

  const placeImage = useCallback(
    (assetView: AssetView, meta: ParseMeta, useCrop: boolean) => {
      if (!targetPanelId || !targetView) {
        toast.error('Select a panel first, then place the image.');
        return;
      }
      if (!assetView.url) {
        toast.error('The parsed image has no URL yet.');
        return;
      }
      const naturalW = meta.naturalWidth ?? 1000;
      const naturalH = meta.naturalHeight ?? 1000;
      const overrides: Partial<Omit<ImageElement, 'id' | 'type' | 'assetId'>> = {
        raster: assetView.mimeType !== 'image/svg+xml',
      };
      if (useCrop && meta.contentBbox) {
        // Lerp from full image (cropTight=0) to tight content bbox (=100).
        const t = cropTight / 100;
        const b = meta.contentBbox;
        overrides.crop = {
          x: b.left * t,
          y: b.top * t,
          width: naturalW - (naturalW - b.width) * t,
          height: naturalH - (naturalH - b.height) * t,
        };
      }
      const el = factory.newImage(
        {
          id: factory.elementId(mintId()),
          panelId: targetPanelId,
          view: targetView,
          assetId: factory.assetId(assetView.assetId),
          srcUrl: assetView.url,
          naturalW,
          naturalH,
        },
        overrides,
      );
      onPlaceImage(el);
      toast.success('Image added to the panel.');
    },
    [targetPanelId, targetView, mintId, onPlaceImage, cropTight],
  );

  const pollUntilParsed = useCallback(
    async (assetId: string): Promise<void> => {
      const deadline = Date.now() + 120_000; // 2 min ceiling
      for (;;) {
        const view = await getAssetAction({ projectId, assetId });
        if (!view) throw new Error('Asset disappeared during parsing.');
        if (TERMINAL.has(view.parseStatus)) {
          if (view.parseStatus === 'failed') {
            toast.error('Parsing failed for this file.');
            return;
          }
          const meta = readMeta(view.parseMetadata);
          toast.message('Parse complete.');
          // Offer a crop step when we detected a content bbox; else place now.
          if (meta.contentBbox) {
            setCrop({ assetView: view, meta });
            setCropTight(100);
          } else {
            placeImage(view, meta, false);
          }
          return;
        }
        if (Date.now() > deadline) {
          toast.error('Parsing is taking too long. Try again later.');
          return;
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    },
    [projectId, placeImage],
  );

  const handleFile = useCallback(
    async (file: File) => {
      // Client-side validation BEFORE the upload (GH-005 hard requirement).
      if (!ALLOWED_MIME.has(file.type)) {
        toast.error(`Unsupported file type: ${file.type || 'unknown'}`);
        return;
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        toast.error('File exceeds the 50 MB limit.');
        return;
      }
      if (!targetPanelId) {
        toast.error('Select a panel first, then upload an image.');
        return;
      }

      setPhase('uploading');
      try {
        const grant = await requestAssetUploadAction({
          projectId,
          filename: file.name,
          mimeType: file.type,
          size: file.size,
        });
        const put = await fetch(grant.signedUrl, {
          method: 'PUT',
          headers: { 'content-type': file.type, 'x-upsert': 'true' },
          body: file,
        });
        if (!put.ok) throw new Error(`Upload failed (${put.status}).`);

        await finalizeAssetUploadAction({
          projectId,
          assetId: grant.assetId,
          mimeType: file.type,
          rembg,
        });
        setPhase('parsing');
        await pollUntilParsed(grant.assetId);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Upload failed.');
      } finally {
        setPhase('idle');
      }
    },
    [projectId, rembg, targetPanelId, pollUntilParsed],
  );

  const onInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = ''; // allow re-picking the same file
      if (file) void handleFile(file);
    },
    [handleFile],
  );

  const busy = phase !== 'idle';

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Label htmlFor="rembg" className="flex items-center gap-2 text-xs text-zinc-600">
          <Scissors className="size-3.5" /> Remove background
        </Label>
        <Switch id="rembg" checked={rembg} onCheckedChange={setRembg} disabled={busy} />
      </div>

      <input
        ref={inputRef}
        data-testid="upload-input"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/heic,image/heif,image/svg+xml,application/pdf,.ai,.eps"
        className="hidden"
        onChange={onInputChange}
      />
      <Button
        type="button"
        variant="outline"
        className="w-full justify-center gap-2"
        disabled={busy || !targetPanelId}
        onClick={() => inputRef.current?.click()}
      >
        {phase === 'uploading' ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Uploading…
          </>
        ) : phase === 'parsing' ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Processing…
          </>
        ) : (
          <>
            <Upload className="size-4" /> Upload artwork
          </>
        )}
      </Button>
      {!targetPanelId ? (
        <p className="text-xs text-zinc-500">Select a panel to enable uploads.</p>
      ) : (
        <p className="flex items-center gap-1.5 text-xs text-zinc-500">
          <ImageIcon className="size-3.5" /> PNG, JPG, SVG, PDF, AI/EPS · up to 50 MB
        </p>
      )}

      {/* Crop step. */}
      <Dialog open={crop != null} onOpenChange={(open) => !open && setCrop(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Trim to content</DialogTitle>
            <DialogDescription>
              Tighten the placed image toward the detected artwork bounds, or place it full-frame.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            <div className="flex items-center justify-between text-xs text-zinc-600">
              <span>Full frame</span>
              <span>Tight crop</span>
            </div>
            <Slider
              value={[cropTight]}
              min={0}
              max={100}
              step={1}
              onValueChange={(v) => setCropTight(v[0] ?? 100)}
            />
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                if (crop) placeImage(crop.assetView, crop.meta, false);
                setCrop(null);
              }}
            >
              Place full
            </Button>
            <Button
              onClick={() => {
                if (crop) placeImage(crop.assetView, crop.meta, true);
                setCrop(null);
              }}
            >
              Place cropped
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
