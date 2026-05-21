// One-shot migration: move PR #37's dev-only local vehicle assets into Supabase
// Storage, generate real PNG thumbnails, backfill printable areas, and rewrite the
// DB URLs (GH-005 / ADR-0007). Idempotent: re-running is safe (uploads upsert,
// URL rewrites converge). Wipes the local store at the end.
//
// Run: pnpm --filter @alphawolf/db run storage:migrate-local
//
// HIGHEST-RISK change in this PR (per the brief): if this is wrong we lose the
// only production-relevant data (the seeded Transit). It therefore: reads each
// vehicle from the DB (not the filesystem) so we never invent vehicles; only
// rewrites a vehicle's URLs AFTER its upload succeeds; and leaves the local file
// in place if its upload fails.

import { existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { geometry } from '@alphawolf/canvas';
import { withSystem } from '../src/client';
import { uploadTemplateObject, templatePublicUrl } from '../src/storage/supabase';

// PR #37's local store lived at <workspace-root>/.vehicle-assets. Resolved inline
// here (the vehicle-assets module is removed in this PR); the dir is wiped at the
// end, so on a second run this resolver simply finds nothing.
function vehicleAssetsRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return join(dir, '.vehicle-assets');
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return join(process.cwd(), '.vehicle-assets');
}

type WrapSafeZone = { clip_path?: string };

const THUMB_WIDTH = 480;

async function svgToThumbPng(svg: Buffer): Promise<Buffer> {
  // density bumps the rasterisation resolution for crisp thumbnails from vector.
  return sharp(svg, { density: 144 }).resize({ width: THUMB_WIDTH }).png().toBuffer();
}

function localPath(vehicleId: string, filename: string): string {
  return join(vehicleAssetsRoot(), vehicleId, filename);
}

async function main(): Promise<void> {
  const vehicles = await withSystem((db) =>
    db.vehicle.findMany({
      select: { id: true, outlineSvgUrl: true, topviewSvgUrl: true },
    }),
  );
  console.log(`[migrate] ${vehicles.length} vehicle(s) in DB`);

  for (const v of vehicles) {
    const outlineLocal = localPath(v.id, 'outline.svg');
    if (!existsSync(outlineLocal)) {
      console.warn(`[migrate] vehicle ${v.id}: no local outline.svg, skipping upload`);
      continue;
    }
    const svg = readFileSync(outlineLocal);

    // 1. outline SVG -> bucket
    const outlineKey = `${v.id}/outline.svg`;
    await uploadTemplateObject(outlineKey, svg, 'image/svg+xml');

    // 2. real PNG thumbnail -> bucket (ends PR #37's "SVG-in-a-PNG-column" stopgap)
    const thumb = await svgToThumbPng(svg);
    const thumbKey = `${v.id}/thumb.png`;
    await uploadTemplateObject(thumbKey, thumb, 'image/png');

    // 3. optional topview
    let topviewUrl: string | null = null;
    const topviewLocal = localPath(v.id, 'topview.svg');
    if (v.topviewSvgUrl && existsSync(topviewLocal)) {
      const topviewKey = `${v.id}/topview.svg`;
      await uploadTemplateObject(topviewKey, readFileSync(topviewLocal), 'image/svg+xml');
      topviewUrl = templatePublicUrl(topviewKey);
    }

    // 4. rewrite DB URLs only after uploads succeeded
    await withSystem((db) =>
      db.vehicle.update({
        where: { id: v.id },
        data: {
          outlineSvgUrl: templatePublicUrl(outlineKey),
          thumbPngUrl: templatePublicUrl(thumbKey),
          ...(topviewUrl ? { topviewSvgUrl: topviewUrl } : {}),
        },
      }),
    );

    // 5. backfill printable_area_mm2 from each panel's wrap-safe path geometry
    const panels = await withSystem((db) =>
      db.vehiclePanel.findMany({
        where: { vehicleId: v.id },
        select: { id: true, wrapSafeZone: true, printableAreaMm2: true },
      }),
    );
    for (const p of panels) {
      const zone = (p.wrapSafeZone ?? {}) as WrapSafeZone;
      if (!zone.clip_path) continue;
      const areaMm2 = Math.round(geometry.pathAreaMm2(zone.clip_path));
      if (areaMm2 > 0 && areaMm2 !== p.printableAreaMm2) {
        await withSystem((db) =>
          db.vehiclePanel.update({ where: { id: p.id }, data: { printableAreaMm2: areaMm2 } }),
        );
      }
    }
    console.log(`[migrate] vehicle ${v.id}: uploaded + ${panels.length} panel area(s) backfilled`);
  }

  // 6. wipe the local store — it was never production data
  const root = vehicleAssetsRoot();
  if (existsSync(root)) {
    rmSync(root, { recursive: true, force: true });
    console.log(`[migrate] wiped local store at ${root}`);
  }
  console.log('[migrate] complete.');
}

main().catch((err) => {
  console.error('[migrate] failed:', err);
  process.exit(1);
});
