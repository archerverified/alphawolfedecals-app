// Goal 2a — seed the 3 Alpha Wolf wrapped vehicle templates (Option A manual import).
//
// Reads three already-wrapped SVGs from $AW_SEED_SOURCE_DIR (NEVER repo-relative —
// the inputs are license-restricted PVO derivatives that must not live in the
// repo; see spec §5.3 + the test-only/ gitignore + CI license-guard), uploads
// each to the PUBLIC vehicle-templates bucket, rasterises a PNG thumbnail, and
// upserts a published `vehicles` row carrying the AW metadata added in PR1.
//
// The AW wrap frame is ALREADY baked into each SVG by wrap_template.py — this
// script does NOT wrap, validate-as-outline, or otherwise transform the artwork
// beyond a defensive sanitise. It is idempotent: deterministic ids + upsert +
// upserting Storage objects means re-running converges instead of duplicating.
//
// Run:  AW_SEED_SOURCE_DIR=/abs/path/to/_converted \
//         pnpm --filter @alphawolf/db exec dotenv -e .env -- tsx scripts/seed-vehicle-templates.ts

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { withSystem } from '../src/client';
import { uploadTemplateObject, templatePublicUrl } from '../src/storage/supabase';
import type { BodyType, SourceAuthority } from '@prisma/client';

type TemplateSeed = {
  /** Deterministic id so re-runs upsert the same row (no duplicates). */
  id: string;
  alphaWolfTplId: string;
  /** File name inside $AW_SEED_SOURCE_DIR. */
  svgFile: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  bodyType: BodyType;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  wheelbaseMm: number | null;
  /** Views baked into the wrap frame (1..4). */
  viewCount: number;
  /** Wrap scale denominator (1:N). */
  scaleDenom: number;
  dimensionsText: string | null;
  sourceAuthority: SourceAuthority;
  sourceNotes: string;
};

// The three Goal-2a inputs. Ids are fixed (not random) so the seed is idempotent.
const SEEDS: TemplateSeed[] = [
  {
    id: 'aa000001-0000-4000-8000-000000000001',
    alphaWolfTplId: 'AW-TPL-0001',
    svgFile: 'bmw_32_aw.svg',
    year: 2024,
    make: 'BMW',
    model: 'X3',
    trim: null,
    bodyType: 'suv',
    lengthMm: 4708,
    widthMm: 1891,
    heightMm: 1676,
    wheelbaseMm: 2864,
    viewCount: 4,
    scaleDenom: 20,
    dimensionsText: 'Back Windshield 20.0 × 49.5 in',
    sourceAuthority: 'licensed',
    sourceNotes: 'Alpha Wolf wrapped template (4-view, 1:20).',
  },
  {
    id: 'aa000002-0000-4000-8000-000000000002',
    alphaWolfTplId: 'AW-TPL-0002',
    svgFile: 'contendb_009_aw.svg',
    year: 2024,
    make: 'Contender',
    model: "36.5' Bass Boat",
    trim: null,
    bodyType: 'boat',
    lengthMm: 11125,
    widthMm: 3050,
    heightMm: 2400,
    wheelbaseMm: null,
    viewCount: 2,
    scaleDenom: 20,
    dimensionsText: null,
    sourceAuthority: 'licensed',
    sourceNotes: 'Alpha Wolf wrapped template (2-view, 1:20).',
  },
  {
    id: 'aa000003-0000-4000-8000-000000000003',
    alphaWolfTplId: 'AW-TPL-0003',
    svgFile: 'crown_01_aw.svg',
    year: 1973,
    make: 'Crown',
    model: 'Super Coach',
    trim: null,
    bodyType: 'rv',
    lengthMm: 12000,
    widthMm: 2438,
    heightMm: 3200,
    wheelbaseMm: null,
    viewCount: 3,
    scaleDenom: 20,
    dimensionsText: null,
    sourceAuthority: 'licensed',
    sourceNotes: 'Alpha Wolf wrapped template — 1973 Crown Super Coach (3-view, 1:20).',
  },
];

const THUMB_WIDTH = 480;

function sourceDir(): string {
  const dir = process.env.AW_SEED_SOURCE_DIR;
  if (!dir) {
    throw new Error(
      '[db][seed-aw] AW_SEED_SOURCE_DIR is not set. Point it at the directory holding the ' +
        'wrapped *_aw.svg inputs (license-restricted — must live OUTSIDE the repo, never committed).',
    );
  }
  return dir;
}

// Defensive sanitise. The wrapped SVGs are served via a cross-origin <img>, which
// already neuters scripting, but strip active content as defence-in-depth before
// it lands in public Storage. Removes <script> blocks, on*= handlers, and
// javascript: URLs — without touching the wrap geometry.
function sanitizeSvg(svg: string): string {
  return svg
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son\w+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

async function seedTemplate(t: TemplateSeed): Promise<void> {
  const raw = readFileSync(join(sourceDir(), t.svgFile), 'utf8');
  const svg = Buffer.from(sanitizeSvg(raw));

  // Public bucket; upsert keeps re-runs idempotent.
  const svgKey = `${t.id}/wrapped.svg`;
  const thumbKey = `${t.id}/thumb.png`;
  await uploadTemplateObject(svgKey, svg, 'image/svg+xml');
  const thumb = await sharp(svg, { density: 144 }).resize({ width: THUMB_WIDTH }).png().toBuffer();
  await uploadTemplateObject(thumbKey, thumb, 'image/png');

  const svgUrl = templatePublicUrl(svgKey);
  const thumbUrl = templatePublicUrl(thumbKey);

  await withSystem(async (db) => {
    const data = {
      year: t.year,
      make: t.make,
      model: t.model,
      trim: t.trim,
      variant: null,
      bodyType: t.bodyType,
      lengthMm: t.lengthMm,
      widthMm: t.widthMm,
      heightMm: t.heightMm,
      wheelbaseMm: t.wheelbaseMm,
      // The wrapped SVG IS the rendered outline; the thumb is its raster preview.
      outlineSvgUrl: svgUrl,
      thumbPngUrl: thumbUrl,
      svgStorageKey: svgKey,
      viewCount: t.viewCount,
      scaleDenom: t.scaleDenom,
      dimensionsText: t.dimensionsText,
      alphaWolfTplId: t.alphaWolfTplId,
      sourceAuthority: t.sourceAuthority,
      sourceNotes: t.sourceNotes,
      status: 'published' as const,
      verifiedAt: new Date(),
    };
    await db.vehicle.upsert({
      where: { id: t.id },
      create: { id: t.id, ...data },
      update: data,
    });
  });

  console.log(`[db][seed-aw] ${t.alphaWolfTplId}  ${t.year} ${t.make} ${t.model}  ✓`);
}

async function main(): Promise<void> {
  console.log(`[db][seed-aw] seeding ${SEEDS.length} Alpha Wolf templates from ${sourceDir()}`);
  for (const t of SEEDS) {
    await seedTemplate(t);
  }
  console.log(`[db][seed-aw] done — ${SEEDS.length} template(s) published.`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
