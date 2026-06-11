'use server';

// Extract a brand palette from an uploaded logo asset (Goal 5 / B2C-005).
// Server-side so the (private-bucket) bytes never round-trip through the
// browser and the math is identical everywhere: downscale, quantize to
// 4 bits/channel, rank buckets by pixel count, drop transparent pixels and
// near-duplicate shades. Same auth boundary as the asset actions: requireUser
// + RLS-scoped asset read (ADR-0007).

import sharp from 'sharp';
import { projects, storage } from '@alphawolf/db';
import { requireUser } from '../admin/guard';

const SAMPLE_SIZE = 48; // downscale target — plenty for palette work
const MAX_COLORS = 6;
const MIN_ALPHA = 128; // ignore mostly-transparent pixels
const MIN_SHARE = 0.02; // a color must cover ≥2% of opaque pixels
// Two buckets closer than this (squared RGB distance) are the same "color".
const MIN_DISTANCE_SQ = 48 * 48;

function toHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export async function extractLogoColorsAction(input: {
  projectId: string;
  assetId: string;
}): Promise<{ ok: true; colors: string[] } | { ok: false }> {
  const user = await requireUser(`/projects/${input.projectId}/brief`);
  const asset = await projects.getAsset(user.id, input.assetId);
  if (!asset || asset.projectId !== input.projectId) return { ok: false };

  const key = asset.parsedUrl ?? asset.sourceUrl;
  if (!key) return { ok: false };

  try {
    const bytes = await storage.downloadAssetObject(key);
    const { data, info } = await sharp(bytes)
      .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: 'inside' })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    // Count 4-bit/channel buckets, remembering the running mean of each so the
    // returned hex is the average member, not the bucket corner.
    const buckets = new Map<number, { n: number; r: number; g: number; b: number }>();
    let opaque = 0;
    for (let i = 0; i + 3 < data.length; i += info.channels) {
      const a = info.channels === 4 ? data[i + 3]! : 255;
      if (a < MIN_ALPHA) continue;
      opaque += 1;
      const r = data[i]!;
      const g = data[i + 1]!;
      const b = data[i + 2]!;
      const id = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const cur = buckets.get(id) ?? { n: 0, r: 0, g: 0, b: 0 };
      cur.n += 1;
      cur.r += r;
      cur.g += g;
      cur.b += b;
      buckets.set(id, cur);
    }
    if (opaque === 0) return { ok: true, colors: [] };

    const ranked = [...buckets.values()]
      .filter((c) => c.n / opaque >= MIN_SHARE)
      .sort((x, y) => y.n - x.n)
      .map((c) => ({
        r: Math.round(c.r / c.n),
        g: Math.round(c.g / c.n),
        b: Math.round(c.b / c.n),
      }));

    const picked: Array<{ r: number; g: number; b: number }> = [];
    for (const c of ranked) {
      if (picked.length >= MAX_COLORS) break;
      const dup = picked.some((p) => {
        const dr = p.r - c.r;
        const dg = p.g - c.g;
        const db = p.b - c.b;
        return dr * dr + dg * dg + db * db < MIN_DISTANCE_SQ;
      });
      if (!dup) picked.push(c);
    }
    return { ok: true, colors: picked.map((c) => toHex(c.r, c.g, c.b)) };
  } catch {
    // Bad bytes / unreadable format — extraction is a convenience, not a
    // failure mode worth surfacing beyond "couldn't read colors".
    return { ok: false };
  }
}
