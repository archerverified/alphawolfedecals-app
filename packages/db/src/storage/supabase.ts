// Supabase Storage helper (GH-005 / ADR-0007). Replaces the dev-only local file
// store in ./vehicle-assets.ts.
//
// ⚠️ SERVER-ONLY. Uses the SERVICE ROLE key, which bypasses Storage RLS. Never
// import this from a client component (the @alphawolf/db barrel is already
// server-only via Prisma).
//
// Two buckets (provisioned by scripts/provision-storage.ts, documented in ADR-0007):
//   * vehicle-templates — PUBLIC read. Published vehicle outline SVGs + generated
//     PNG thumbnails. Served by public URL; writes are admin/server only.
//   * project-assets — PRIVATE. Per-user uploaded artwork + parse output. No public
//     policies (locked down to the service role by default). Reads/writes happen
//     through SERVER-SIGNED URLs whose TTL is short and whose object key the server
//     only hands out after authorising project ownership through the RLS-enforced
//     DB layer (getProject under withUser).
//
// Why not storage.objects RLS keyed to a user id? This app uses custom auth (the
// app.current_user_id GUC inside our own Postgres transactions), NOT Supabase Auth,
// so auth.uid() is never populated in the Storage request context and storage RLS
// cannot see our session user. Access control therefore lives at the application
// layer: the private bucket is closed by default and every grant is an
// ownership-checked, short-lived signed URL. See ADR-0007.

import sharp from 'sharp';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const VEHICLE_TEMPLATES_BUCKET =
  process.env.SUPABASE_STORAGE_BUCKET_TEMPLATES ?? 'vehicle-templates';
export const PROJECT_ASSETS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET_ASSETS ?? 'project-assets';

// Signed-URL TTL for private project-asset reads. 24h per the spec (long enough
// for an editing session + the parse round-trip, short enough that a leaked URL
// expires; ADR-0007).
export const SIGNED_URL_TTL_SECONDS = 24 * 60 * 60;

let serviceClient: SupabaseClient | null = null;

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`[db/storage] missing required env var: ${name}`);
  return value;
}

// Singleton service-role client. Bypasses Storage RLS — keep server-only.
export function getServiceClient(): SupabaseClient {
  if (!serviceClient) {
    serviceClient = createClient(readEnv('SUPABASE_URL'), readEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serviceClient;
}

// True when storage env is configured. Lets callers (and tests) degrade gracefully
// when running with no Supabase credentials.
export function isStorageConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// Stable, collision-free object key for an uploaded project asset. Project-scoped
// so the key itself encodes the authorisation boundary the server checks.
export function assetKey(projectId: string, assetId: string, filename: string): string {
  return `${projectId}/${assetId}/${filename}`;
}

// Base URL for constructing public Storage object URLs. Reads SUPABASE_URL (or
// the client-equivalent NEXT_PUBLIC_SUPABASE_URL as a fallback — both point at
// the same project, the latter is inlined at build time). Pure read; no client
// instantiation. Keeps catalogue render alive when the service-role key is
// stale or missing — only writes/signed-URL flows need the service role.
function getStorageBaseUrl(): string {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) {
    throw new Error(
      '[db/storage] missing required env var: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL)',
    );
  }
  return url.replace(/\/+$/, '');
}

// Public URL for a vehicle-templates object (bucket is public-read).
//
// Pure string formatter — does NOT instantiate the service-role client. The
// catalogue render path (e.g. `/vehicles/[id]` rendering
// `<img src={templatePublicUrl(svg_storage_key)}>`) therefore stays alive when
// SUPABASE_SERVICE_ROLE_KEY is missing, empty, or rotated. Defence in depth: a
// stale service-role key only breaks writes/signing, not the public catalogue.
//
// Prior implementation called `getServiceClient().storage.from(…).getPublicUrl(…)`,
// which threw on missing service-role key even though that key is not needed to
// format a public URL — see activities.md 2026-06-04 entry for the production
// incident this refactor closes.
export function templatePublicUrl(key: string): string {
  return `${getStorageBaseUrl()}/storage/v1/object/public/${VEHICLE_TEMPLATES_BUCKET}/${encodeURI(key)}`;
}

// Server-side upload into the public vehicle-templates bucket. `upsert` so
// re-running the local-asset migration / re-generating thumbnails is idempotent.
export async function uploadTemplateObject(
  key: string,
  data: Buffer | Uint8Array | ArrayBuffer | Blob,
  contentType: string,
): Promise<string> {
  const { error } = await getServiceClient()
    .storage.from(VEHICLE_TEMPLATES_BUCKET)
    .upload(key, data, { contentType, upsert: true });
  if (error)
    throw new Error(`[db/storage] uploadTemplateObject failed for ${key}: ${error.message}`);
  return templatePublicUrl(key);
}

// Server-side upload into the private project-assets bucket. Used by the parse
// worker to write parsed output. Returns the bucket-relative key.
export async function uploadAssetObject(
  key: string,
  data: Buffer | Uint8Array | ArrayBuffer | Blob,
  contentType: string,
): Promise<string> {
  const { error } = await getServiceClient()
    .storage.from(PROJECT_ASSETS_BUCKET)
    .upload(key, data, { contentType, upsert: true });
  if (error) throw new Error(`[db/storage] uploadAssetObject failed for ${key}: ${error.message}`);
  return key;
}

// Download a private project-asset's bytes (parse worker reads the original here).
export async function downloadAssetObject(key: string): Promise<Buffer> {
  const { data, error } = await getServiceClient()
    .storage.from(PROJECT_ASSETS_BUCKET)
    .download(key);
  if (error || !data) {
    throw new Error(
      `[db/storage] downloadAssetObject failed for ${key}: ${error?.message ?? 'no data'}`,
    );
  }
  return Buffer.from(await data.arrayBuffer());
}

// Short-lived signed URL for the browser to READ a private project asset. The
// CALLER must have already authorised that the session user owns the asset's
// project before invoking this.
export async function signedAssetReadUrl(
  key: string,
  expiresIn: number = SIGNED_URL_TTL_SECONDS,
): Promise<string> {
  const { data, error } = await getServiceClient()
    .storage.from(PROJECT_ASSETS_BUCKET)
    .createSignedUrl(key, expiresIn);
  if (error || !data) {
    throw new Error(
      `[db/storage] signedAssetReadUrl failed for ${key}: ${error?.message ?? 'no url'}`,
    );
  }
  return data.signedUrl;
}

export type SignedUpload = { path: string; token: string; signedUrl: string };

// Signed UPLOAD URL so the browser PUTs the file straight to Storage (resumable
// via supabase-js uploadToSignedUrl) instead of streaming through a Server Action.
// The caller authorises project ownership before issuing this.
export async function signedAssetUploadUrl(key: string): Promise<SignedUpload> {
  const { data, error } = await getServiceClient()
    .storage.from(PROJECT_ASSETS_BUCKET)
    .createSignedUploadUrl(key);
  if (error || !data) {
    throw new Error(
      `[db/storage] signedAssetUploadUrl failed for ${key}: ${error?.message ?? 'no url'}`,
    );
  }
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export async function removeAssetObject(key: string): Promise<void> {
  const { error } = await getServiceClient().storage.from(PROJECT_ASSETS_BUCKET).remove([key]);
  if (error) throw new Error(`[db/storage] removeAssetObject failed for ${key}: ${error.message}`);
}

const THUMB_WIDTH = 480;

// Upload a vehicle template's outline SVG to the public bucket and generate a real
// PNG thumbnail from it (Sharp rasterises the vector at 144 DPI). Returns both
// public URLs. Used by the admin create flow and the seed — the end of PR #37's
// "SVG URL in the thumb_png_url column" stopgap (ADR-0007).
export async function uploadVehicleOutline(
  vehicleId: string,
  svg: Buffer | string,
): Promise<{ outlineSvgUrl: string; thumbPngUrl: string }> {
  const buf = typeof svg === 'string' ? Buffer.from(svg) : svg;
  const outlineKey = `${vehicleId}/outline.svg`;
  await uploadTemplateObject(outlineKey, buf, 'image/svg+xml');
  const thumb = await sharp(buf, { density: 144 }).resize({ width: THUMB_WIDTH }).png().toBuffer();
  const thumbKey = `${vehicleId}/thumb.png`;
  await uploadTemplateObject(thumbKey, thumb, 'image/png');
  return { outlineSvgUrl: templatePublicUrl(outlineKey), thumbPngUrl: templatePublicUrl(thumbKey) };
}
