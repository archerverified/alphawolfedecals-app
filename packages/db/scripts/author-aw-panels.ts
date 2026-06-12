// Goal 6 D2 — author + publish panel sets for the 3 AW catalogue templates.
//
// Reads the committed panel definitions in seeds/aw-panels/*.json (sheet-
// absolute polygons authored over each template's own wrapped art — owned
// source material; ADR-0014 invariant 12), then for each template:
//   1. generates 12 mm calibrated wrap-safe insets for every panel,
//   2. builds the spec-§3.4 outline SVG and round-trips it through the
//      validator with the template's declared views,
//   3. computes CALIBRATED real-mm² printable areas,
//   4. QC: composites the panel overlay onto the wrapped art (PNG) so a human
//      can eyeball every boundary against the artwork,
//   5. (publish mode) uploads <id>/outline.svg, syncs vehicle_panels
//      (identity-preserving), and uploads the 1/20 layout sheet.
//
// Modes:
//   pnpm db:author-aw -- --qc-only          # steps 1–4, no DB/storage writes
//   pnpm db:author-aw -- --publish          # everything (requires admin email)
//   AW_QC_DIR=/path/to/dir                  # overlay output (default /tmp/aw-qc)
//
// This script intentionally mirrors apps/web/lib/studio/author.ts (the Studio
// UI path). Both feed the SAME validator + geometry, so they cannot drift on
// anything the spec enforces; only the input plumbing differs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { geometry } from '@alphawolf/canvas';
import {
  assembleLayoutSheetFromRows,
  buildLayoutSheetSvg,
  buildOutlineSvg,
  defaultAxisForView,
  mmPerUnitFor,
  validateOutlineSvg,
  wrapSafeZoneFor,
  type OutlineViewSpec,
} from '../src/svg/index.js';
import { setVehiclePanels, type PanelInput } from '../src/repos/vehicles.js';
import { createSource, listForVehicle } from '../src/repos/template-sources.js';
import { findUserByEmailForAuth } from '../src/repos/users.js';
import {
  templatePublicUrl,
  uploadLayoutSheet,
  uploadOutlineOnly,
} from '../src/storage/supabase.js';

const WRAP_SAFE_INSET_MM = 12;

type PanelDef = {
  name: string;
  points: Array<[number, number]>;
  finishHint: string;
  installOrder: number;
  notes?: string;
};
type ViewDef = {
  view: string;
  spanUnits: number;
  axis?: 'length' | 'width' | 'height';
  panels: PanelDef[];
};
type TemplateDef = {
  vehicleId: string;
  provenanceNote: string;
  viewBox: { width: number; height: number };
  views: ViewDef[];
};

const pathFromPoints = (pts: Array<[number, number]>): string =>
  `M${pts.map(([x, y]) => `${x} ${y}`).join(' L')} Z`;

const QC_DIR = process.env.AW_QC_DIR ?? '/tmp/aw-qc';
const qcOnly = process.argv.includes('--qc-only');
const publish = process.argv.includes('--publish');
const ADMIN_EMAIL = process.env.AW_ADMIN_EMAIL;

async function wrappedSheetPng(vehicleId: string, storageKey: string): Promise<Buffer> {
  const cache = `/tmp/aw-svgs/${vehicleId.slice(0, 8)}.svg`;
  let svgText: string;
  if (fs.existsSync(cache)) {
    svgText = fs.readFileSync(cache, 'utf8');
  } else {
    const res = await fetch(templatePublicUrl(storageKey));
    if (!res.ok) throw new Error(`fetch wrapped.svg failed: ${res.status}`);
    svgText = await res.text();
  }
  return sharp(Buffer.from(svgText), { density: 96 })
    .resize(1920, 1080, { fit: 'fill' })
    .png()
    .toBuffer();
}

function overlaySvg(def: TemplateDef, panels: PanelInput[]): string {
  const shapes = panels
    .map((p) => {
      const zone = p.wrapSafeZone as { clip_path: string };
      const b = geometry.bbox(geometry.parsePath(p.svgPath));
      return (
        `<path d="${p.svgPath}" fill="#2563eb" fill-opacity="0.13" stroke="#dc2626" stroke-width="2.5"/>` +
        `<path d="${zone.clip_path}" fill="none" stroke="#2563eb" stroke-width="1.5" stroke-dasharray="7 5"/>` +
        `<text x="${(b.minX + b.maxX) / 2}" y="${(b.minY + b.maxY) / 2}" text-anchor="middle" font-size="17" font-family="Helvetica" font-weight="700" fill="#dc2626">${p.installOrder}. ${p.name.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>`
      );
    })
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${def.viewBox.width} ${def.viewBox.height}" width="1920" height="1080">${shapes}</svg>`;
}

async function main(): Promise<void> {
  const dir = path.join(__dirname, '../seeds/aw-panels');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  fs.mkdirSync(QC_DIR, { recursive: true });

  let adminId: string | null = null;
  if (publish) {
    if (!ADMIN_EMAIL) throw new Error('publish mode needs AW_ADMIN_EMAIL');
    const admin = await findUserByEmailForAuth(ADMIN_EMAIL);
    if (!admin) throw new Error(`no user for ${ADMIN_EMAIL}`);
    adminId = admin.id;
  }

  for (const file of files) {
    const def = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')) as TemplateDef;
    console.log(`\n== ${file} (${def.vehicleId})`);

    // The vehicle row carries the real dimensions (calibration source) and
    // the wrapped-art storage key (QC backdrop). Read via system in QC mode.
    const { withSystem } = await import('../src/client.js');
    const vehicle = await withSystem(async (db) =>
      db.vehicle.findUnique({
        where: { id: def.vehicleId },
        select: {
          lengthMm: true,
          widthMm: true,
          heightMm: true,
          svgStorageKey: true,
          viewCount: true,
          year: true,
          make: true,
          model: true,
          trim: true,
          scaleDenom: true,
          alphaWolfTplId: true,
        },
      }),
    );
    if (!vehicle) throw new Error(`vehicle ${def.vehicleId} not found`);
    if (vehicle.viewCount !== def.views.length) {
      throw new Error(
        `view count mismatch: vehicle declares ${vehicle.viewCount}, JSON has ${def.views.length}`,
      );
    }

    const dims = {
      lengthMm: vehicle.lengthMm,
      widthMm: vehicle.widthMm,
      heightMm: vehicle.heightMm,
    };

    // Per-view calibration + wrap-safe generation.
    const mmPerUnitByView: Record<string, number> = {};
    const viewSpecs: OutlineViewSpec[] = def.views.map((v) => {
      const mmu = mmPerUnitFor(dims, {
        spanUnits: v.spanUnits,
        axis: v.axis ?? defaultAxisForView(v.view),
      });
      mmPerUnitByView[v.view] = mmu;
      const insetUnits = WRAP_SAFE_INSET_MM / mmu;
      return {
        view: v.view,
        translate: { x: 0, y: 0 },
        panels: v.panels.map((p) => ({
          name: p.name,
          outlinePath: pathFromPoints(p.points),
          wrapSafePath: geometry.insetRingPath(pathFromPoints(p.points), insetUnits),
          finishHint: p.finishHint,
          installOrder: p.installOrder,
          notes: p.notes ?? null,
        })),
      };
    });

    const svgText = buildOutlineSvg({
      viewBox: def.viewBox,
      vehicleSlug: `${vehicle.year}-${vehicle.make}-${vehicle.model}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-'),
      metadata: `Alpha Wolf Wrap Studio — Goal 6 AW panel authoring. Provenance: ${def.provenanceNote}`,
      views: viewSpecs,
    });

    const declared = def.views.map((v) => v.view);
    const validated = validateOutlineSvg(svgText, dims, { views: declared });
    if (!validated.ok) {
      console.error(validated.errors);
      throw new Error(`${file}: outline SVG failed validation`);
    }

    const panels: PanelInput[] = validated.panels.map((p) => ({
      name: p.name,
      view: p.view,
      svgPath: p.outlinePath,
      wrapSafeZone: wrapSafeZoneFor(p),
      printableAreaMm2: Math.round(
        geometry.pathAreaScaled(p.wrapSafePath, mmPerUnitByView[p.view]!),
      ),
      finishHint: p.finishHint,
      installOrder: p.installOrder,
      notes: p.notes,
    }));
    for (const p of panels) {
      console.log(
        `   ${p.installOrder}. [${p.view}] ${p.name} — ${(p.printableAreaMm2 / 1_000_000).toFixed(2)} m²`,
      );
    }

    // QC overlay.
    if (vehicle.svgStorageKey) {
      const base = await wrappedSheetPng(def.vehicleId, vehicle.svgStorageKey);
      const overlay = await sharp(Buffer.from(overlaySvg(def, panels)))
        .png()
        .toBuffer();
      const out = path.join(QC_DIR, `${file.replace('.json', '')}-overlay.png`);
      await sharp(base)
        .composite([{ input: overlay }])
        .png()
        .toFile(out);
      console.log(`   QC overlay -> ${out}`);
    }

    if (publish && adminId) {
      await uploadOutlineOnly(def.vehicleId, validated.optimizedSvg);
      await setVehiclePanels(adminId, def.vehicleId, panels);
      // Provenance audit row (license wall): this panel set traces to the
      // template's own wrapped art. Idempotent on storage key.
      if (vehicle.svgStorageKey) {
        const sources = await listForVehicle(adminId, def.vehicleId);
        if (!sources.some((s) => s.storageKey === vehicle.svgStorageKey)) {
          await createSource(adminId, {
            vehicleId: def.vehicleId,
            kind: 'owned_svg',
            storageKey: vehicle.svgStorageKey,
            measurements: { overall_length_mm: dims.lengthMm },
            notes: def.provenanceNote,
          });
        }
      }
      const sheetInput = assembleLayoutSheetFromRows(
        {
          title: `${vehicle.make} ${vehicle.model}${vehicle.trim ? ` ${vehicle.trim}` : ''}`,
          yearLabel: String(vehicle.year),
          code: vehicle.alphaWolfTplId,
          scaleDenom: vehicle.scaleDenom,
          dims,
        },
        panels,
      );
      const sheetUrls = await uploadLayoutSheet(def.vehicleId, buildLayoutSheetSvg(sheetInput));
      console.log(`   PUBLISHED panels + outline + layout sheet: ${sheetUrls.layoutSheetSvgUrl}`);
    }
  }
  if (qcOnly) console.log('\nQC-only run complete — no DB or storage writes.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
