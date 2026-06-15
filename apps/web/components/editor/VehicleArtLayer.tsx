'use client';

// Vehicle ART layer (Goal 12 D2). Renders the recognizable AW-owned vehicle
// artwork (wrapped.svg) as the editor backdrop, in the SAME absolute coordinate
// space as the panel geometry (both authored in the template's 0..viewBox space,
// verified coordinate-aligned). listening:false — it is pure backdrop, never in
// the hit graph; not cached (one static image is cheap and caching a possibly
// cross-origin image would risk a tainted-canvas SecurityError).
//
// When the template has no art (artUrl null, e.g. the Transit) this renders
// nothing and ZoneLayer falls back to filled outline boxes so the surface is
// still visible.

import { useEffect, useState } from 'react';
import { Layer, Image as KonvaImage } from 'react-konva';

/** Load an HTMLImageElement from a URL. crossOrigin anonymous so a CORS-enabled
    host stays untainted; display works regardless. */
function useHtmlImage(url: string | null): HTMLImageElement | null {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!url) {
      setImg(null);
      return;
    }
    const el = new window.Image();
    el.crossOrigin = 'anonymous';
    let alive = true;
    el.onload = () => {
      if (alive) setImg(el);
    };
    el.onerror = () => {
      if (alive) setImg(null);
    };
    el.src = url;
    return () => {
      alive = false;
    };
  }, [url]);
  return img;
}

interface Props {
  artUrl: string | null;
  /** Template viewBox size — the coordinate space both the art and the panels
      are authored in (AW templates: 1920×1080). Drawing at (0,0,w,h) registers
      the art to the panels 1:1. */
  width: number;
  height: number;
  /** When framing a single view, crop the art to that view's region so the
      neighbouring views don't bleed into the zoomed frame (Goal 12 D2). */
  crop: { x: number; y: number; w: number; h: number } | null;
}

export function VehicleArtLayer({ artUrl, width, height, crop }: Props) {
  const img = useHtmlImage(artUrl);
  if (!artUrl || !img) return null;
  // Image-pixel ↔ doc-space ratio: AW art draws at the template viewBox, but if
  // the browser reports a different intrinsic size, scale crop coords to match.
  const natW = img.naturalWidth || width;
  const natH = img.naturalHeight || height;
  if (crop) {
    const sx = natW / width;
    const sy = natH / height;
    return (
      <Layer listening={false}>
        <KonvaImage
          image={img}
          x={crop.x}
          y={crop.y}
          width={crop.w}
          height={crop.h}
          crop={{ x: crop.x * sx, y: crop.y * sy, width: crop.w * sx, height: crop.h * sy }}
          perfectDrawEnabled={false}
        />
      </Layer>
    );
  }
  return (
    <Layer listening={false}>
      <KonvaImage
        image={img}
        x={0}
        y={0}
        width={width}
        height={height}
        perfectDrawEnabled={false}
      />
    </Layer>
  );
}
