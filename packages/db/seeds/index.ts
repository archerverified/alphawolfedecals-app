// Database seeds.
//
// Loads every vehicle template described by a packages/db/seeds/vehicles/*.json
// file: each JSON carries the metadata + a relative path to its outline SVG.
// The SVG is run through the SAME validate -> extract panels -> SVGO-optimise
// pipeline the admin upload uses (svg.validateOutlineSvg), then the optimised
// markup is written to the local asset store and the row + panels are upserted.
//
// This lets Archer drop the first Tier-1 vehicles in as data files (no code
// changes) once their traced SVGs pass §3.4. Seeds run as the system role
// (withSystem) — catalog data has no per-user scope and the bootstrap path
// bypasses RLS, exactly like users.createUser.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { geometry } from '@alphawolf/canvas';
import { withSystem } from '../src/client';
import { validateOutlineSvg, wrapSafeZoneFor } from '../src/svg/validate';
import { uploadVehicleOutline } from '../src/storage/supabase';
import type { BodyType, SourceAuthority, TemplateStatus } from '@prisma/client';

const SEED_DIR = join(fileURLToPath(new URL('.', import.meta.url)), 'vehicles');

type SeedVehicle = {
  id: string;
  year: number;
  make: string;
  model: string;
  trim: string | null;
  variant: string | null;
  bodyType: BodyType;
  lengthMm: number;
  widthMm: number;
  heightMm: number;
  wheelbaseMm: number | null;
  cabSize: string | null;
  bedSize: string | null;
  roofHeight: string | null;
  doorCount: number | null;
  sourceAuthority: SourceAuthority;
  sourceNotes: string | null;
  status: TemplateStatus;
  svgFile: string;
};

function loadSeedFiles(): SeedVehicle[] {
  let names: string[];
  try {
    names = readdirSync(SEED_DIR).filter((n) => n.endsWith('.json'));
  } catch {
    return [];
  }
  return names.map((name) => JSON.parse(readFileSync(join(SEED_DIR, name), 'utf8')) as SeedVehicle);
}

async function seedVehicle(v: SeedVehicle): Promise<void> {
  const svgText = readFileSync(join(SEED_DIR, v.svgFile), 'utf8');
  const validated = validateOutlineSvg(svgText, { lengthMm: v.lengthMm, heightMm: v.heightMm });
  if (!validated.ok) {
    throw new Error(
      `[db][seed] ${v.svgFile} failed validation:\n` +
        validated.errors.map((e) => `  - [${e.rule}] ${e.message}`).join('\n'),
    );
  }

  // GH-005: upload to the public bucket + generate a real PNG thumbnail.
  const { outlineSvgUrl, thumbPngUrl } = await uploadVehicleOutline(v.id, validated.optimizedSvg);

  await withSystem(async (db) => {
    // Idempotent: replace the row (panels cascade) so re-running the seed is safe.
    await db.vehicle.deleteMany({ where: { id: v.id } });
    await db.vehicle.create({
      data: {
        id: v.id,
        year: v.year,
        make: v.make,
        model: v.model,
        trim: v.trim,
        variant: v.variant,
        bodyType: v.bodyType,
        lengthMm: v.lengthMm,
        widthMm: v.widthMm,
        heightMm: v.heightMm,
        wheelbaseMm: v.wheelbaseMm,
        cabSize: v.cabSize,
        bedSize: v.bedSize,
        roofHeight: v.roofHeight,
        doorCount: v.doorCount,
        outlineSvgUrl,
        thumbPngUrl,
        sourceAuthority: v.sourceAuthority,
        sourceNotes: v.sourceNotes,
        status: v.status,
        verifiedAt: v.status === 'published' ? new Date() : null,
        panels: {
          create: validated.panels.map((p) => ({
            name: p.name,
            view: p.view,
            svgPath: p.outlinePath,
            wrapSafeZone: wrapSafeZoneFor(p),
            // GH-005: real printable area (mm²) from the wrap-safe path geometry.
            printableAreaMm2: Math.round(geometry.pathAreaMm2(p.wrapSafePath)),
            finishHint: p.finishHint,
            installOrder: p.installOrder,
            notes: p.notes,
          })),
        },
      },
    });
  });

  console.log(
    `[db][seed] vehicle ${v.year} ${v.make} ${v.model} (${validated.panels.length} panels)`,
  );
}

async function main(): Promise<void> {
  const seeds = loadSeedFiles();
  if (seeds.length === 0) {
    console.log('[db][seed] no vehicle seed files found in seeds/vehicles');
    return;
  }
  for (const v of seeds) {
    await seedVehicle(v);
  }
  console.log(`[db][seed] done — ${seeds.length} vehicle template(s)`);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
