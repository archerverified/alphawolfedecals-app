// Local filesystem store for vehicle template assets (outline SVGs, thumbnails).
//
// SCOPE / STOPGAP: real blob storage (Supabase Storage / S3 + CDN) is GH-005's
// asset pipeline. For Phase 1 this writes validated, SVGO-optimised assets to a
// git-ignored directory at the repo root and serves them through the web app's
// /api/vehicle-assets route. It works under `pnpm dev` and a long-lived
// `next start` host (Fly.io per ADR-0002); it does NOT work on a read-only
// serverless filesystem. The vehicles.*_svg_url columns store the app-relative
// URL, so swapping this backend for real object storage in GH-005 is a
// one-module change with no schema churn.
//
// Owned by @alphawolf/db (the data layer) so the seed loader and the web app
// share one directory + URL convention. node:fs only — server-only, never
// import from a client component.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// Path components are embedded in a URL and a filesystem path, so keep them to a
// safe charset. Vehicle ids are UUIDs; filenames are fixed (outline.svg, etc.).
const SAFE_SEGMENT = /^[A-Za-z0-9._-]+$/;

function assertSafe(segment: string, label: string): void {
  if (!SAFE_SEGMENT.test(segment)) {
    throw new Error(`[db] unsafe vehicle-asset ${label}: ${segment}`);
  }
}

// Walk up from cwd to the workspace root (the dir holding pnpm-workspace.yaml)
// so the asset dir resolves identically whether the caller is the web app
// (cwd=apps/web) or the seed script (cwd=packages/db).
function workspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

export function vehicleAssetsRoot(): string {
  const override = process.env.VEHICLE_ASSET_DIR;
  return override ? resolve(override) : join(workspaceRoot(), '.vehicle-assets');
}

// Public, app-relative URL the browser loads. Stored in vehicles.*_svg_url.
export function vehicleAssetUrl(vehicleId: string, filename: string): string {
  return `/api/vehicle-assets/${vehicleId}/${filename}`;
}

export function writeVehicleAsset(
  vehicleId: string,
  filename: string,
  data: Buffer | string,
): string {
  assertSafe(vehicleId, 'vehicleId');
  assertSafe(filename, 'filename');
  const dir = join(vehicleAssetsRoot(), vehicleId);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, filename), data);
  return vehicleAssetUrl(vehicleId, filename);
}

// Returns the raw bytes, or null if the asset doesn't exist. The route handler
// streams these; callers must still authorise (these are public catalog assets).
export function readVehicleAsset(vehicleId: string, filename: string): Buffer | null {
  if (!SAFE_SEGMENT.test(vehicleId) || !SAFE_SEGMENT.test(filename)) return null;
  const path = join(vehicleAssetsRoot(), vehicleId, filename);
  if (!existsSync(path)) return null;
  return readFileSync(path);
}

const CONTENT_TYPES: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};

export function contentTypeFor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return CONTENT_TYPES[ext] ?? 'application/octet-stream';
}
