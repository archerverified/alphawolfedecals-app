'use server';

// Template Studio server actions (Goal 6 D1). Every action re-checks
// requireAdmin() — a layout gate does not protect server-action POSTs — and
// form-posted actions validate the double-submit CSRF token (the /admin/*
// middleware bootstrap sets the cookie). Programmatic actions (the upload
// grant/finalize pair) follow the asset.ts convention: session + Next origin
// check, no form token. Heavy lifting lives in pure, unit-tested modules:
//   lib/studio/author.ts   payload -> outline SVG -> calibrated panel rows
//   lib/studio/layout.ts   panel rows -> 1/20-scale layout sheet input
//   lib/studio/ship-request.ts  request auto-ship + notify on publish
//
// Source files do NOT ride Server Action bodies (Next caps those at 1 MB):
// the browser PUTs to a signed URL, then finalize records the provenance row —
// the same direct-upload pattern as asset.ts (PR #136 review fix).

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Source material is owned ingest only: photos, OEM PDFs, owned vector art.
// The bucket enforces the same caps storage-side (provision-storage.ts).
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

const intOrUndef = (v: unknown): number | undefined => {
  const n = Number(typeof v === 'string' ? v.trim() : v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
};

// --- ingest: grant + finalize (programmatic, asset.ts pattern) ---------------

export async function grantStudioSourceUploadAction(input: {
  vehicleId: string;
  fileName: string;
  mimeType: string;
  size: number;
}): Promise<{ key: string; signedUrl: string }> {
  const admin = await requireAdmin();
  if (!UUID_RE.test(input.vehicleId)) throw new Error('Vehicle not found.');
  if (!SOURCE_MIME_ALLOWLIST.has(input.mimeType)) {
    throw new Error(`File type "${input.mimeType || 'unknown'}" is not accepted.`);
  }
  if (!Number.isFinite(input.size) || input.size <= 0 || input.size > SOURCE_MAX_BYTES) {
    throw new Error('File exceeds the 50 MB limit.');
  }
  const vehicle = await vehicles.adminGetDetail(admin.id, input.vehicleId);
  if (!vehicle) throw new Error('Vehicle not found.');

  const key = storage.templateSourceKey(input.vehicleId, input.fileName || 'source');
  const signed = await storage.signedTemplateSourceUploadUrl(key);
  return { key, signedUrl: signed.signedUrl };
}

export async function finalizeStudioSourceAction(input: {
  vehicleId: string;
  key: string;
  kind: string;
  overallLengthMm?: number;
  wheelbaseMm?: number;
  wrapHeightMm?: number;
  notes?: string;
}): Promise<StudioActionState> {
  const admin = await requireAdmin();
  if (!UUID_RE.test(input.vehicleId)) return { ok: false, message: 'Vehicle not found.' };
  // The key must be one this vehicle's grant issued — never record arbitrary keys.
  if (!input.key.startsWith(`${input.vehicleId}/sources/`)) {
    return { ok: false, message: 'Upload key does not belong to this vehicle.' };
  }
  if (!templateSources.isTemplateSourceKind(input.kind)) {
    return { ok: false, message: 'Pick a source kind (photo, OEM PDF, or owned SVG).' };
  }

  const info = await storage.templateSourceObjectInfo(input.key);
  if (!info) return { ok: false, message: 'Upload not found — try again.' };
  if (info.size > SOURCE_MAX_BYTES) {
    return { ok: false, message: 'File exceeds the 50 MB limit.' };
  }

  try {
    await templateSources.createSource(admin.id, {
      vehicleId: input.vehicleId,
      kind: input.kind,
      storageKey: input.key,
      measurements: {
        overall_length_mm: intOrUndef(input.overallLengthMm),
        wheelbase_mm: intOrUndef(input.wheelbaseMm),
        wrap_height_mm: intOrUndef(input.wrapHeightMm),
      },
      notes: input.notes?.trim() || null,
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'template-studio', action: 'finalize-source' },
      extra: { vehicleId: input.vehicleId },
    });
    return { ok: false, message: 'Recording the source failed — try again or check Sentry.' };
  }

  revalidatePath(`/admin/studio/${input.vehicleId}`);
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
  if (!UUID_RE.test(vehicleId)) return { ok: false, message: 'Vehicle not found.' };

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
  // DB first, public artifact second: if the panel sync fails, the public
  // outline.svg must not already be overwritten (review-fix ordering).
  try {
    await vehicles.setVehiclePanels(admin.id, vehicleId, assembled.panels);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'template-studio', action: 'save-panels' },
      extra: { vehicleId, panelCount: assembled.panels.length },
    });
    return { ok: false, message: 'Saving the panel set failed — nothing was changed.' };
  }
  try {
    await storage.uploadOutlineOnly(vehicleId, assembled.svgText);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'template-studio', action: 'save-outline' },
      extra: { vehicleId },
    });
    return {
      ok: false,
      message: 'Panels saved, but storing the outline artifact failed — re-save to retry.',
    };
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
  if (!UUID_RE.test(vehicleId)) return { ok: false, message: 'Vehicle not found.' };
  if (requestId && !UUID_RE.test(requestId)) {
    return { ok: false, message: 'Linked request not found.' };
  }

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
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'template-studio', action: 'publish' },
      extra: { vehicleId },
    });
    return { ok: false, message: 'Publish failed — check Sentry.' };
  }

  // The vehicle IS published from here on; report partial failures honestly
  // instead of implying the publish itself rolled back.
  let sheetMessage = '';
  try {
    const sheet = svg.buildLayoutSheetSvg(assembleLayoutSheet(vehicle));
    await storage.uploadLayoutSheet(vehicleId, sheet);
  } catch (err) {
    Sentry.captureException(err, {
      tags: { feature: 'template-studio', action: 'layout-sheet' },
      extra: { vehicleId },
    });
    sheetMessage = ' Layout sheet generation failed (check Sentry) — publish again to retry it.';
  }

  let shipMessage = '';
  let fulfilledRequestId: string | null = null;
  if (requestId) {
    try {
      const shipped = await shipRequestAndNotify(admin.id, requestId, vehicleId);
      if (shipped.ok) {
        fulfilledRequestId = requestId;
        shipMessage = shipped.emailed
          ? ' Linked request shipped + requester emailed.'
          : ' Linked request shipped (no notification opt-in).';
      } else {
        shipMessage = ' Linked request not found — ship it from the queue manually.';
      }
    } catch (err) {
      Sentry.captureException(err, {
        tags: { feature: 'template-studio', action: 'ship-request' },
        extra: { vehicleId, requestId },
      });
      shipMessage = ' Shipping the linked request failed — use the queue manually.';
    }
  }

  await captureServerEvent('template_published', admin.id, {
    vehicleId,
    panelCount: vehicle.panels.length,
    alphaWolfTplId: vehicle.alphaWolfTplId,
    fulfilledRequestId,
  });

  revalidatePath('/admin/studio');
  revalidatePath(`/admin/studio/${vehicleId}`);
  revalidatePath(`/vehicles/${vehicleId}`);
  return { ok: true, message: `Published.${sheetMessage}${shipMessage}` };
}
