'use server';

// Admin vehicle template CRUD actions (GH-004). Every action re-checks
// requireAdmin() — a layout gate does not protect server-action POSTs — and
// validates the double-submit CSRF token. The create action runs the uploaded
// SVG through the §3.4 validator in @alphawolf/db (in-process: svgson + svgo,
// no Inkscape), writes the optimised markup to the asset store, and persists the
// vehicle + extracted panels.

import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CSRF_COOKIE_NAME, CSRF_FIELD_NAME, verifyCsrf } from '@alphawolf/auth/server';
import {
  svg,
  vehicleAssets,
  vehicles,
  type BodyType,
  type CreateVehicleInput,
  type SourceAuthority,
  type TemplateStatus,
} from '@alphawolf/db';
import { requireAdmin } from '../admin/guard';

const BODY_TYPES: readonly BodyType[] = [
  'sedan',
  'suv',
  'crossover',
  'pickup',
  'van',
  'box_truck',
  'sprinter',
  'motorcycle',
  'rv',
  'trailer',
  'boat',
  'equipment',
];
const SOURCE_AUTHORITIES: readonly SourceAuthority[] = [
  'manufacturer_spec',
  'measured_in_shop',
  'licensed',
  'community_verified',
];

async function csrfOk(form: FormData): Promise<boolean> {
  const submitted = form.get(CSRF_FIELD_NAME);
  const cookie = (await cookies()).get(CSRF_COOKIE_NAME)?.value ?? null;
  return verifyCsrf(cookie, typeof submitted === 'string' ? submitted : null);
}

type CreateState = {
  ok: boolean;
  message?: string;
  svgErrors?: string[];
  fieldErrors?: Record<string, string>;
  values?: Record<string, string>;
};

const TEXT_FIELDS = [
  'year',
  'make',
  'model',
  'trim',
  'variant',
  'bodyType',
  'lengthMm',
  'widthMm',
  'heightMm',
  'wheelbaseMm',
  'cabSize',
  'bedSize',
  'roofHeight',
  'doorCount',
  'sourceAuthority',
  'sourceNotes',
];

function snapshot(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of TEXT_FIELDS) {
    const v = form.get(f);
    out[f] = typeof v === 'string' ? v : '';
  }
  return out;
}

const str = (form: FormData, k: string): string => String(form.get(k) ?? '').trim();
const intOrNull = (s: string | undefined): number | null => {
  if (!s) return null;
  const n = Number(s);
  return Number.isInteger(n) ? n : null;
};

export async function createVehicleAction(
  _prev: CreateState,
  form: FormData,
): Promise<CreateState> {
  const admin = await requireAdmin();
  const values = snapshot(form);
  if (!(await csrfOk(form))) {
    return { ok: false, message: 'Invalid request token. Please refresh and try again.', values };
  }

  // Required metadata.
  const fieldErrors: Record<string, string> = {};
  const year = intOrNull(values.year);
  const lengthMm = intOrNull(values.lengthMm);
  const widthMm = intOrNull(values.widthMm);
  const heightMm = intOrNull(values.heightMm);
  const make = str(form, 'make');
  const model = str(form, 'model');
  const bodyType = values.bodyType as BodyType;
  const sourceAuthority = values.sourceAuthority as SourceAuthority;

  const maxYear = new Date().getFullYear() + 2;
  if (year === null || year < 1990 || year > maxYear)
    fieldErrors.year = `Year must be 1990–${maxYear}.`;
  if (!make) fieldErrors.make = 'Required.';
  if (!model) fieldErrors.model = 'Required.';
  if (!BODY_TYPES.includes(bodyType)) fieldErrors.bodyType = 'Pick a body type.';
  if (!SOURCE_AUTHORITIES.includes(sourceAuthority)) fieldErrors.sourceAuthority = 'Pick a source.';
  if (lengthMm === null) fieldErrors.lengthMm = 'Required.';
  if (widthMm === null) fieldErrors.widthMm = 'Required.';
  if (heightMm === null) fieldErrors.heightMm = 'Required.';

  if (Object.keys(fieldErrors).length > 0) {
    return { ok: false, message: 'Please fix the highlighted fields.', fieldErrors, values };
  }

  // SVG upload + §3.4 validation.
  const file = form.get('svg');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'An outline SVG file is required.', values };
  }
  const svgText = await file.text();
  const validated = svg.validateOutlineSvg(svgText, {
    lengthMm: lengthMm as number,
    heightMm: heightMm as number,
  });
  if (!validated.ok) {
    return {
      ok: false,
      message: 'The SVG does not meet the outline standard (§3.4):',
      svgErrors: validated.errors.map((e) => `[${e.rule}] ${e.message}`),
      values,
    };
  }

  // Generate the id up front so assets can be named before insert.
  const id = randomUUID();
  const outlineUrl = vehicleAssets.writeVehicleAsset(id, 'outline.svg', validated.optimizedSvg);

  const input: CreateVehicleInput = {
    id,
    year: year as number,
    make,
    model,
    trim: str(form, 'trim') || null,
    variant: str(form, 'variant') || null,
    bodyType,
    lengthMm: lengthMm as number,
    widthMm: widthMm as number,
    heightMm: heightMm as number,
    wheelbaseMm: intOrNull(values.wheelbaseMm),
    cabSize: str(form, 'cabSize') || null,
    bedSize: str(form, 'bedSize') || null,
    roofHeight: str(form, 'roofHeight') || null,
    doorCount: intOrNull(values.doorCount),
    outlineSvgUrl: outlineUrl,
    thumbPngUrl: outlineUrl, // raster thumbnail arrives with GH-005
    sourceAuthority,
    sourceNotes: str(form, 'sourceNotes') || null,
    panels: validated.panels.map((p) => ({
      name: p.name,
      view: p.view,
      svgPath: p.outlinePath,
      wrapSafeZone: svg.wrapSafeZoneFor(p),
      printableAreaMm2: 0, // precompute is the paneling pipeline (GH-010)
      finishHint: p.finishHint,
      installOrder: p.installOrder,
      notes: p.notes,
    })),
  };

  const createdId = await vehicles.createVehicle(admin.id, input);
  revalidatePath('/admin/vehicles');
  redirect(`/admin/vehicles/${createdId}`);
}

// --- simple status actions (plain <form action>) ---------------------------

export async function publishVehicleAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(form.get('id') ?? '');
  if (!id || !(await csrfOk(form))) redirect('/admin/vehicles');
  await vehicles.publishVehicle(admin.id, id);
  revalidatePath('/admin/vehicles');
  redirect(`/admin/vehicles/${id}`);
}

export async function setVehicleStatusAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(form.get('id') ?? '');
  const status = String(form.get('status') ?? '') as TemplateStatus;
  const allowed: TemplateStatus[] = ['draft', 'review', 'retired'];
  if (!id || !allowed.includes(status) || !(await csrfOk(form))) redirect('/admin/vehicles');
  await vehicles.setVehicleStatus(admin.id, id, status);
  revalidatePath('/admin/vehicles');
  redirect(`/admin/vehicles/${id}`);
}

export async function newVersionAction(form: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = String(form.get('id') ?? '');
  if (!id || !(await csrfOk(form))) redirect('/admin/vehicles');
  const newId = await vehicles.createNewVersion(admin.id, id);
  revalidatePath('/admin/vehicles');
  redirect(`/admin/vehicles/${newId}`);
}
