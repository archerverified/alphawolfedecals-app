// Regenerate publish artifacts (QC overlay + 1/20 layout sheet) for vehicles
// whose panel sets already live in the DB — without touching panel rows,
// outlines, or provenance. Storage writes happen only with --upload.
//
// Covers two art layouts:
//   * AW wrapped templates (svgStorageKey set): panels are sheet-absolute,
//     the wrapped sheet is the QC backdrop.
//   * Outline-only vehicles (e.g. the Transit): the outline SVG is the
//     backdrop, and its per-view translate transforms place the panels.
//
// Usage:
//   pnpm db:regen-artifacts -- [--vehicle <id>]... [--upload]
//   AW_QC_DIR=/path/to/dir   # output dir (default /tmp/aw-qc)
// With no --vehicle args it runs every vehicle that has panels.

import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { withSystem } from '../src/client.js';
import {
  assembleLayoutSheetFromRows,
  buildLayoutSheetSvg,
  buildQcOverlaySvg,
  SHEET_FORMAT,
} from '../src/svg/index.js';
import { templatePublicUrl, uploadLayoutSheet } from '../src/storage/supabase.js';
import { buildMeasuredQcViews } from './lib/qc-views.js';

const QC_DIR = process.env.AW_QC_DIR ?? '/tmp/aw-qc';
const upload = process.argv.includes('--upload');
const vehicleIds = process.argv
  .map((a, i) => (a === '--vehicle' ? process.argv[i + 1] : null))
  .filter((x): x is string => Boolean(x));

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function parseViewBox(svgText: string): { width: number; height: number } {
  const m = svgText.match(/viewBox="([\d.\s-]+)"/);
  if (!m) throw new Error('art SVG has no viewBox');
  const [, , w, h] = m[1]!.trim().split(/\s+/).map(Number);
  if (!w || !h) throw new Error(`bad viewBox "${m[1]}"`);
  return { width: w, height: h };
}

/** Per-view translate transforms from the outline SVG's view groups. */
function parseViewTranslates(svgText: string): Record<string, { x: number; y: number }> {
  const out: Record<string, { x: number; y: number }> = {};
  // Two-step: grab each view group's opening tag, then read its transform —
  // a single regex with an optional transform group silently skips it.
  for (const m of svgText.matchAll(/<g\b[^>]*\bid="view-([a-z]+)"[^>]*>/g)) {
    const t = m[0].match(/transform="translate\(([-\d.]+)(?:[ ,]+([-\d.]+))?\)"/);
    out[m[1]!] = { x: Number(t?.[1] ?? 0), y: Number(t?.[2] ?? 0) };
  }
  return out;
}

// Outline SVGs style panels via classes and carry no stylesheet (consumers
// attach their own), so a raw render is solid black. Give the QC backdrop the
// layout-sheet vocabulary: white panels, dark strokes, dashed blue wrap-safe.
const OUTLINE_BACKDROP_STYLE =
  '<style>path{fill:#ffffff;stroke:#15181d;stroke-width:3}' +
  '.wrap-safe{fill:none;stroke:#2563eb;stroke-width:1.5;stroke-dasharray:6 5}' +
  '.no-wrap{fill:#f3f4f6;stroke:#9aa3b5;stroke-width:1.5}</style>';

function styleOutlineBackdrop(svgText: string): string {
  return svgText.replace(/(<svg[^>]*>)/, `$1${OUTLINE_BACKDROP_STYLE}`);
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
  return res.text();
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
        year: true,
        make: true,
        model: true,
        trim: true,
        lengthMm: true,
        widthMm: true,
        heightMm: true,
        wheelbaseMm: true,
        scaleDenom: true,
        alphaWolfTplId: true,
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
    const slug = `${v.id.slice(0, 8)}-${slugify(`${v.make} ${v.model}`)}`;
    console.log(`\n== ${slug} (${v.panels.length} panels)`);
    if (v.panels.length === 0) {
      console.log('   no panels — skipped');
      continue;
    }
    // One bad row (unknown view name, dead art URL) must not abort the whole
    // batch — log, count, and keep regenerating the rest of the catalogue.
    try {
      await regenOne(v, slug);
    } catch (err) {
      failed++;
      console.error(`   FAILED ${slug}:`, err instanceof Error ? err.message : err);
    }
  }
  if (failed > 0) {
    console.error(`\n${failed} vehicle(s) failed — see errors above.`);
    process.exitCode = 1;
  }
  if (!upload) console.log('\nDry run — no storage writes (pass --upload to publish sheets).');
}

type VehicleRow = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  wheelbaseMm: number | null;
  scaleDenom: number;
  alphaWolfTplId: string | null;
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

async function regenOne(v: VehicleRow, slug: string): Promise<void> {
  const dims = {
    lengthMm: v.lengthMm,
    widthMm: v.widthMm,
    heightMm: v.heightMm,
    wheelbaseMm: v.wheelbaseMm,
  };

  // --- QC overlay over the vehicle's own art -----------------------------
  const artUrl = v.svgStorageKey ? templatePublicUrl(v.svgStorageKey) : v.outlineSvgUrl;
  const rawArtSvg = await fetchText(artUrl);
  const artSvg = v.svgStorageKey ? rawArtSvg : styleOutlineBackdrop(rawArtSvg);
  const viewBox = parseViewBox(artSvg);
  // Wrapped sheets carry the AW sheet chrome scaled to their viewBox height;
  // outline art has no chrome (full band).
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
    .png()
    .toBuffer();
  const views = await buildMeasuredQcViews({
    panels: v.panels,
    viewBox,
    band,
    basePng,
    translates,
  });

  const overlay = await sharp(
    Buffer.from(buildQcOverlaySvg({ viewBox, dims, views, contentBand: band })),
    { density: 96 },
  )
    .resize(pngW, pngH, { fit: 'fill' })
    .png()
    .toBuffer();
  const overlayOut = path.join(QC_DIR, `${slug}-overlay.png`);
  await sharp(basePng)
    .composite([{ input: overlay }])
    .png()
    .toFile(overlayOut);
  console.log(`   QC overlay   -> ${overlayOut}`);

  // --- 1/20 layout sheet --------------------------------------------------
  const sheetSvg = buildLayoutSheetSvg(
    assembleLayoutSheetFromRows(
      {
        title: `${v.make} ${v.model}${v.trim ? ` ${v.trim}` : ''}`,
        yearLabel: String(v.year),
        code: v.alphaWolfTplId,
        scaleDenom: v.scaleDenom,
        dims,
      },
      v.panels.map((p) => ({
        name: p.name,
        view: p.view,
        svgPath: p.svgPath,
        wrapSafeZone: p.wrapSafeZone,
        installOrder: p.installOrder,
      })),
    ),
  );
  const sheetOut = path.join(QC_DIR, `${slug}-layout-sheet.png`);
  await sharp(Buffer.from(sheetSvg), { density: 96 })
    .resize(SHEET_FORMAT.width, SHEET_FORMAT.height, { fit: 'fill' })
    .png()
    .toFile(sheetOut);
  console.log(`   layout sheet -> ${sheetOut}`);

  if (upload) {
    const urls = await uploadLayoutSheet(v.id, sheetSvg);
    console.log(`   UPLOADED     -> ${urls.layoutSheetSvgUrl}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
