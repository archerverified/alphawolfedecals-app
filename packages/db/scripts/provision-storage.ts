// Provision Supabase Storage buckets for the asset pipeline (GH-005 / ADR-0007).
// Idempotent: safe to re-run. Creates/updates two buckets:
//   * vehicle-templates — PUBLIC read (published outline SVGs + PNG thumbnails)
//   * project-assets    — PRIVATE (per-user uploaded artwork + parse output)
//
// Run: pnpm --filter @alphawolf/db run storage:provision
//
// Access control for project-assets is the application layer (ownership-checked
// signed URLs), not storage RLS — this app uses custom auth, not Supabase Auth.
// See ADR-0007 and src/storage/supabase.ts.

import {
  getServiceClient,
  VEHICLE_TEMPLATES_BUCKET,
  PROJECT_ASSETS_BUCKET,
  TEMPLATE_SOURCES_BUCKET,
} from '../src/storage/supabase';

const FIFTY_MB = 50 * 1024 * 1024;

// Upload allowlist for project-assets (mirrors the parse worker's MIME allowlist).
const ASSET_MIME_ALLOWLIST = [
  'image/svg+xml',
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/postscript', // .eps / some .ai
  'application/illustrator', // .ai
  'application/octet-stream', // some browsers send this for .ai/.eps
];

const TEMPLATE_MIME_ALLOWLIST = ['image/svg+xml', 'image/png'];

// Studio ingest sources (Goal 6): owned photos, OEM dimensional PDFs, owned SVG
// art. PRIVATE — reads only via admin-gated signed URLs (ADR-0014 invariant 6).
const SOURCE_MIME_ALLOWLIST = [
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
];

async function ensureBucket(
  id: string,
  options: { public: boolean; fileSizeLimit: number; allowedMimeTypes: string[] },
): Promise<void> {
  const client = getServiceClient();
  const { data: existing } = await client.storage.getBucket(id);
  if (existing) {
    const { error } = await client.storage.updateBucket(id, {
      public: options.public,
      fileSizeLimit: options.fileSizeLimit,
      allowedMimeTypes: options.allowedMimeTypes,
    });
    if (error) throw new Error(`updateBucket(${id}) failed: ${error.message}`);
    console.log(`[storage] updated bucket "${id}" (public=${options.public})`);
    return;
  }
  const { error } = await client.storage.createBucket(id, {
    public: options.public,
    fileSizeLimit: options.fileSizeLimit,
    allowedMimeTypes: options.allowedMimeTypes,
  });
  if (error) throw new Error(`createBucket(${id}) failed: ${error.message}`);
  console.log(`[storage] created bucket "${id}" (public=${options.public})`);
}

async function main(): Promise<void> {
  await ensureBucket(VEHICLE_TEMPLATES_BUCKET, {
    public: true,
    fileSizeLimit: FIFTY_MB,
    allowedMimeTypes: TEMPLATE_MIME_ALLOWLIST,
  });
  await ensureBucket(PROJECT_ASSETS_BUCKET, {
    public: false,
    fileSizeLimit: FIFTY_MB,
    allowedMimeTypes: ASSET_MIME_ALLOWLIST,
  });
  await ensureBucket(TEMPLATE_SOURCES_BUCKET, {
    public: false,
    fileSizeLimit: FIFTY_MB,
    allowedMimeTypes: SOURCE_MIME_ALLOWLIST,
  });
  console.log('[storage] provisioning complete.');
}

main().catch((err) => {
  console.error('[storage] provisioning failed:', err);
  process.exit(1);
});
