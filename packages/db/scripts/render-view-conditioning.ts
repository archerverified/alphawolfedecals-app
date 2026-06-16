// Per-view conditioning renders for the AI generation pipeline (Goal 7 D3).
//
// The image models are structure-conditioned: every view is generated against
// a clean render of the template's view (depth derived provider-side). Doing
// that crop at generation time on Vercel would burn function time per run, so
// the renders are PRE-GENERATED here and stored in the public vehicle-templates
// bucket at `views/<vehicleId>/<view>.png` — the pipeline only passes URLs.
// Re-run after a template's panels/art change (future: hook into Studio
// publish).
//
// Usage:
//   pnpm db:render-views -- [--vehicle <id>]... [--upload]
//   AW_QC_DIR=/path/to/dir   # local output dir (default /tmp/aw-qc)
//
// Storage writes only with --upload; ZERO panel/DB writes; one bad vehicle
// cannot abort the batch (regen-artifacts contract).

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { withSystem } from '../src/client.js';
import { SHEET_FORMAT } from '../src/svg/index.js';
import { templatePublicUrl, uploadTemplateObject } from '../src/storage/supabase.js';
import { buildMeasuredQcViews } from './lib/qc-views.js';

const QC_DIR = process.env.AW_QC_DIR ?? '/tmp/aw-qc';
const upload = process.argv.includes('--upload');
const vehicleIds = process.argv
  .map((a, i) => (a === '--vehicle' ? process.argv[i + 1] : null))
  .filter((x): x is string => Boolean(x));

/** Output width of each conditioning render (≈1 MP at 4:3 — the draft floor). */
const RENDER_WIDTH = 1024;
/** Padding around the measured art bounds, as a fraction of the larger side. */
const PAD_FRACTION = 0.05;

function parseViewBox(svgText: string): { width: number; height: number } {
  const m = svgText.match(/viewBox="([\d.\s-]+)"/);
  if (!m) throw new Error('art SVG has no viewBox');
  const [, , w, h] = m[1]!.trim().split(/\s+/).map(Number);
  if (!w || !h) throw new Error(`bad viewBox "${m[1]}"`);
  return { width: w, height: h };
}

function parseViewTranslates(svgText: string): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  for (const m of svgText.matchAll(/<g\b[^>]*\bid="view-([a-z]+)"[^>]*>/g)) {
    const t = m[0].match(/transform="translate\(([-\d.]+)(?:[ ,]+([-\d.]+))?\)"/);
    out[m[1]!] = { x: Number(t?.[1] ?? 0), y: Number(t?.[2] ?? 0) };
  }
  return out;
}

// Goal 16 (Carryover A defense-in-depth): the body fill is a NEUTRAL PRIMER GREY,
// not white. Two reasons: (1) a panel the image model leaves unpainted then reads
// as neutral primer instead of a stark white box (the Goal-15 door artifact);
// (2) a white conditioning body biases the model toward a white output base
// (the Goal-15 D1 white-base root cause) — grey is a neutral structure cue.
// Live effect requires re-running `db:render-views --upload` (writes the
// vehicle-templates bucket) at deploy; the orchestrator-prompt fix (v3) is the
// primary, runtime-verified lever.
const OUTLINE_BACKDROP_STYLE =
  '<style>path{fill:#c4c8cd;stroke:#15181d;stroke-width:3}' +
  '.wrap-safe{fill:none;stroke:none}' +
  '.no-wrap{fill:#f3f4f6;stroke:#9aa3b5;stroke-width:1.5}</style>';

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return res.text();
}

type VehicleRow = {
  id: string;
  make: string;
  model: string;
  svgStorageKey: string | null;
  outlineSvgUrl: string;
  panels: Array<{
    name: string;
    view: string;
    svgPath: string;
    wrapSafeZone: unknown;
    installOrder: number;
  }>;
};

async function renderOne(v: VehicleRow): Promise<void> {
  const artUrl = v.svgStorageKey ? templatePublicUrl(v.svgStorageKey) : v.outlineSvgUrl;
  const rawArtSvg = await fetchText(artUrl);
  const artSvg = v.svgStorageKey
    ? rawArtSvg
    : rawArtSvg.replace(/(<svg[^>]*>)/, `$1${OUTLINE_BACKDROP_STYLE}`);
  const viewBox = parseViewBox(artSvg);
  const band = v.svgStorageKey
    ? {
        top: (SHEET_FORMAT.contentBand.top * viewBox.height) / SHEET_FORMAT.height,
        bottom: (SHEET_FORMAT.contentBand.bottom * viewBox.height) / SHEET_FORMAT.height,
      }
    : { top: 0, bottom: viewBox.height };
  const translates = v.svgStorageKey ? {} : parseViewTranslates(artSvg);

  const pngW = 1920;
  const pngH = Math.round((1920 * viewBox.height) / viewBox.width);
  const basePng = await sharp(Buffer.from(artSvg), { density: 96 })
    .resize(pngW, pngH, { fit: 'fill' })
    .flatten({ background: '#ffffff' })
    .png()
    .toBuffer();

  const views = await buildMeasuredQcViews({
    panels: v.panels,
    viewBox,
    band,
    basePng,
    translates,
  });

  const scale = pngW / viewBox.width;
  for (const view of views) {
    const b = view.artBounds;
    const bw = b.maxX - b.minX;
    const bh = b.maxY - b.minY;
    const pad = Math.round(Math.max(bw, bh) * scale * PAD_FRACTION);
    // Clamp to the sheet's content band so chrome (header/footer) never
    // bleeds into a conditioning render — the depth model would read it as
    // vehicle geometry.
    const bandTopPx = Math.ceil(band.top * scale);
    const bandBottomPx = Math.floor(band.bottom * scale);
    const left = Math.max(0, Math.round(b.minX * scale) - pad);
    const top = Math.max(bandTopPx, Math.round(b.minY * scale) - pad);
    const width = Math.min(pngW - left, Math.round(bw * scale) + 2 * pad);
    const height = Math.min(Math.min(pngH, bandBottomPx) - top, Math.round(bh * scale) + 2 * pad);
    if (width < 32 || height < 32) {
      console.log(`   ${view.view}: degenerate bounds — skipped`);
      continue;
    }
    const crop = await sharp(basePng)
      .extract({ left, top, width, height })
      .resize({ width: RENDER_WIDTH, withoutEnlargement: false })
      .png()
      .toBuffer();

    const localPath = path.join(QC_DIR, `view-${v.id.slice(0, 8)}-${view.view}.png`);
    fs.writeFileSync(localPath, crop);
    console.log(`   ${view.view}: ${width}×${height} → ${localPath}`);

    if (upload) {
      const key = `views/${v.id}/${view.view}.png`;
      const url = await uploadTemplateObject(key, crop, 'image/png');
      console.log(`     uploaded ${url}`);
    }
  }
}

async function main(): Promise<void> {
  fs.mkdirSync(QC_DIR, { recursive: true });
  const vehicles = await withSystem(async (db) =>
    db.vehicle.findMany({
      where:
        vehicleIds.length > 0
          ? { id: { in: vehicleIds } }
          : { panels: { some: {} }, status: { not: 'retired' } },
      select: {
        id: true,
        make: true,
        model: true,
        svgStorageKey: true,
        outlineSvgUrl: true,
        panels: { orderBy: { installOrder: 'asc' } },
      },
      orderBy: { createdAt: 'asc' },
    }),
  );
  if (vehicles.length === 0) throw new Error('no matching vehicles with panels');

  let failed = 0;
  for (const v of vehicles) {
    console.log(`\n== ${v.make} ${v.model} (${v.id.slice(0, 8)}, ${v.panels.length} panels)`);
    try {
      await renderOne(v);
    } catch (err) {
      failed++;
      console.error(`   FAILED:`, err instanceof Error ? err.message : err);
    }
  }
  if (failed > 0) process.exitCode = 1;
  if (!upload) console.log('\nDry run — no storage writes (pass --upload to publish renders).');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
