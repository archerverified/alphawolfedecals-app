// ⚠️⚠️⚠️ DEV-ONLY STORAGE — DO NOT SHIP TO STAGING OR PRODUCTION. ⚠️⚠️⚠️
// Files written here are LOCAL to the running process (a git-ignored dir at the
// repo root). They survive `pnpm dev` restarts but ANY DEPLOY WIPES THEM, so a
// production deploy would silently lose every uploaded template SVG on the first
// redeploy. This is a stopgap until GH-005's real blob pipeline (Supabase
// Storage / Cloudflare R2). To make the footgun impossible to trip, the write
// path FAILS CLOSED when NODE_ENV === 'production' (see writeVehicleAsset).
//
// SCOPE: For Phase 1 this writes validated, SVGO-optimised assets to that dir
// and serves them through the web app's /api/vehicle-assets route. The
// vehicles.*_svg_url columns store the app-relative URL, so swapping this
// backend for real object storage in GH-005 is a one-module change with no
// schema churn.
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
  // FAIL CLOSED in production: this store is process-local and any deploy wipes
  // it (see the file header). A misconfigured prod deploy must not silently
  // accept uploads it will lose — GH-005 replaces this with real blob storage.
  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      '[db] vehicle asset store is dev-only and writes are disabled in production. ' +
        'Wire up real blob storage (GH-005) before serving template uploads.',
    );
  }
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
