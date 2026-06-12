'use server';

// Template Studio server actions (Goal 6 D1). Every action re-checks
// requireAdmin() — a layout gate does not protect server-action POSTs — and
// validates the double-submit CSRF token (the /admin/* middleware bootstrap
// sets the cookie). Heavy lifting lives in pure, unit-tested modules:
//   lib/studio/author.ts   payload -> outline SVG -> calibrated panel rows
//   lib/studio/layout.ts   panel rows -> 1/20-scale layout sheet input
//   lib/studio/ship-request.ts  request auto-ship + notify on publish

import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { CSRF_COOKIE_NAME, CSRF_FIELD_NAME, verifyCsrf } from '@alphawolf/auth/server';
import { storage, svg, templateSources, vehicles } from '@alphawolf/db';
import * as Sentry from '@sentry/nextjs';
import { requireAdmin } from '../admin/guard';
import { captureServerEvent } from '../notifications/posthog-server';
import { assembleOutline } from '../studio/author';
import { assembleLayoutSheet } from '../studio/layout';
import { shipRequestAndNotify } from '../studio/ship-request';

async function csrfOk(form: FormData): Promise<boolean> {
  const submitted = form.get(CSRF_FIELD_NAME);
  const cookie = (await cookies()).get(CSRF_COOKIE_NAME)?.value ?? null;
  return verifyCsrf(cookie, typeof submitted === 'string' ? submitted : null);
}

// Source material is owned ingest only: photos, OEM PDFs, owned vector art.
// Server-side caps are the real boundary (ADR-0014 invariant 6).
const SOURCE_MAX_BYTES = 50 * 1024 * 1024;
const SOURCE_MIME_ALLOWLIST = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'image/svg+xml',
  'application/pdf',
]);

export type StudioActionState = {
  ok: boolean;
  message?: string;
  errors?: Array<{ field: string; message: string }>;
};

const intOrUndef = (v: FormDataEntryValue | null): number | undefined => {
  const n = Number(typeof v === 'string' ? v.trim() : NaN);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

// --- ingest ------------------------------------------------------------------

export async function uploadStudioSourceAction(
  _prev: StudioActionState,
  form: FormData,
): Promise<StudioActionState> {
  const admin = await requireAdmin();
  if (!(await csrfOk(form))) {
    return { ok: false, message: 'Invalid request token. Please refresh and try again.' };
  }

  const vehicleId = String(form.get('vehicleId') ?? '').trim();
  const kind = String(form.get('kind') ?? '').trim();
  const notes = String(form.get('notes') ?? '').trim() || null;
  const file = form.get('file');

  if (!vehicleId) return { ok: false, message: 'A vehicle is required.' };
  if (!templateSources.isTemplateSourceKind(kind)) {
    return { ok: false, message: 'Pick a source kind (photo, OEM PDF, or owned SVG).' };
  }
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, message: 'A source file is required.' };
  }
  if (file.size > SOURCE_MAX_BYTES) {
    return { ok: false, message: 'File exceeds the 50 MB limit.' };
  }
  if (!SOURCE_MIME_ALLOWLIST.has(file.type)) {
    return { ok: false, message: `File type "${file.type || 'unknown'}" is not accepted.` };
  }

  const vehicle = await vehicles.adminGetDetail(admin.id, vehicleId);
  if (!vehicle) return { ok: false, message: 'Vehicle not found.' };

  const measurements = {
    overall_length_mm: intOrUndef(form.get('overallLengthMm')),
    wheelbase_mm: intOrUndef(form.get('wheelbaseMm')),
    wrap_height_mm: intOrUndef(form.get('wrapHeightMm')),
  };

  try {
    const key = storage.templateSourceKey(vehicleId, file.name || 'source');
    await storage.uploadTemplateSourceObject(key, Buffer.from(await file.arrayBuffer()), file.type);
    await templateSources.createSource(admin.id, {
      vehicleId,
      kind,
      storageKey: key,
      measurements,
      notes,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'template-studio', action: 'upload-source' },
      extra: { vehicleId, kind },
    });
    return { ok: false, message: 'Upload failed — try again or check Sentry.' };
  }

  revalidatePath(`/admin/studio/${vehicleId}`);
  return { ok: true, message: 'Source uploaded.' };
}

// --- author (save panel set) --------------------------------------------------

export async function saveStudioPanelsAction(
  _prev: StudioActionState,
  form: FormData,
): Promise<StudioActionState> {
  const admin = await requireAdmin();
  if (!(await csrfOk(form))) {
    return { ok: false, message: 'Invalid request token. Please refresh and try again.' };
  }

  const vehicleId = String(form.get('vehicleId') ?? '').trim();
  if (!vehicleId) return { ok: false, message: 'A vehicle is required.' };

  let rawPayload: unknown;
  try {
    rawPayload = JSON.parse(String(form.get('payload') ?? ''));
  } catch {
    return { ok: false, message: 'The panel payload is not valid JSON.' };
  }

  const vehicle = await vehicles.adminGetDetail(admin.id, vehicleId);
  if (!vehicle) return { ok: false, message: 'Vehicle not found.' };

  const result = assembleOutline(vehicle, rawPayload);
  if (!result.ok) {
    return { ok: false, message: 'The panel set does not validate.', errors: result.errors };
  }
  const { assembled } = result;

  const isReauthor = vehicle.panels.length > 0;
  try {
    await storage.uploadOutlineOnly(vehicleId, assembled.svgText);
    await vehicles.setVehiclePanels(admin.id, vehicleId, assembled.panels);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'template-studio', action: 'save-panels' },
      extra: { vehicleId, panelCount: assembled.panels.length },
    });
    return { ok: false, message: 'Saving the panel set failed — nothing was published.' };
  }

  await captureServerEvent('template_authored', admin.id, {
    vehicleId,
    panelCount: assembled.panels.length,
    views: assembled.declaredViews,
    reauthor: isReauthor,
  });

  revalidatePath(`/admin/studio/${vehicleId}`);
  revalidatePath(`/admin/vehicles/${vehicleId}`);
  return {
    ok: true,
    message: `Saved ${assembled.panels.length} panels across ${assembled.declaredViews.length} views.`,
  };
}

// --- publish -------------------------------------------------------------------

export async function publishStudioVehicleAction(
  _prev: StudioActionState,
  form: FormData,
): Promise<StudioActionState> {
  const admin = await requireAdmin();
  if (!(await csrfOk(form))) {
    return { ok: false, message: 'Invalid request token. Please refresh and try again.' };
  }

  const vehicleId = String(form.get('vehicleId') ?? '').trim();
  const requestId = String(form.get('requestId') ?? '').trim() || null;
  if (!vehicleId) return { ok: false, message: 'A vehicle is required.' };

  const vehicle = await vehicles.adminGetDetail(admin.id, vehicleId);
  if (!vehicle) return { ok: false, message: 'Vehicle not found.' };

  // Publish gate: a template is only publishable with a complete, calibrated
  // panel set (the editor + zone selector are panel consumers — an empty or
  // zero-area set ships a broken product page).
  if (vehicle.panels.length === 0) {
    return { ok: false, message: 'No panels authored yet — save a panel set first.' };
  }
  const zeroArea = vehicle.panels.filter((p) => p.printableAreaMm2 <= 0);
  if (zeroArea.length > 0) {
    return {
      ok: false,
      message: `Panels with uncalibrated (zero) area: ${zeroArea.map((p) => p.name).join(', ')}. Re-save the panel set.`,
    };
  }

  try {
    if (vehicle.status !== 'published') {
      await vehicles.publishVehicle(admin.id, vehicleId);
    }
    const sheet = svg.buildLayoutSheetSvg(assembleLayoutSheet(vehicle));
    await storage.uploadLayoutSheet(vehicleId, sheet);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'template-studio', action: 'publish' },
      extra: { vehicleId },
    });
    return { ok: false, message: 'Publish failed — check Sentry.' };
  }

  let shipMessage = '';
  if (requestId) {
    const shipped = await shipRequestAndNotify(admin.id, requestId, vehicleId);
    shipMessage = shipped.ok
      ? shipped.emailed
        ? ' Linked request shipped + requester emailed.'
        : ' Linked request shipped (no notification opt-in).'
      : ' Linked request not found — ship it from the queue manually.';
  }

  await captureServerEvent('template_published', admin.id, {
    vehicleId,
    panelCount: vehicle.panels.length,
    alphaWolfTplId: vehicle.alphaWolfTplId,
    fulfilledRequestId: requestId,
  });

  revalidatePath('/admin/studio');
  revalidatePath(`/admin/studio/${vehicleId}`);
  revalidatePath(`/vehicles/${vehicleId}`);
  return { ok: true, message: `Published with the layout sheet.${shipMessage}` };
}
