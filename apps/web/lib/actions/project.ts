'use server';

// Project lifecycle + canvas autosave actions (GH-008). Form actions re-check
// requireUser AND the double-submit CSRF token (a layout gate doesn't protect a
// server-action POST). The RPC-style autosave (saveCanvasAction) relies on
// Next.js's built-in Server-Action origin check plus requireUser + RLS: the save
// targets a project_versions row that RLS only lets the owner update, so a
// cross-user or stale write is rejected at the DB.

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { CSRF_COOKIE_NAME, CSRF_FIELD_NAME, verifyCsrf } from '@alphawolf/auth/server';
import { credits, projects, vehicles } from '@alphawolf/db';
import { vehicleSlotGate } from '../plan/gates';
import { captureServerEvent } from '../notifications/posthog-server';
import {
  serializeDocument,
  deserializeDocument,
  factory,
  CanvasSchemaError,
} from '@alphawolf/canvas';
import { requireUser } from '../admin/guard';

async function csrfOk(form: FormData): Promise<boolean> {
  const submitted = form.get(CSRF_FIELD_NAME);
  const cookie = (await cookies()).get(CSRF_COOKIE_NAME)?.value ?? null;
  return verifyCsrf(cookie, typeof submitted === 'string' ? submitted : null);
}

// Create a project from the vehicle selector and open the editor.
export async function createProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser('/vehicles/select');
  if (!(await csrfOk(formData))) throw new Error('Invalid request (CSRF).');

  const vehicleId = String(formData.get('vehicleId') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim() || 'Untitled project';
  if (!vehicleId) throw new Error('A vehicle is required to start a project.');

  const vehicle = await vehicles.getPublishedDetail(vehicleId);
  if (!vehicle) throw new Error('Vehicle not found or not published.');

  // Free-plan vehicle-slot gate (B2C-011) — server-side, before any write. A
  // project on an already-used vehicle never consumes a new slot.
  // ACCEPTED RACE: the gate read and the create run in separate transactions,
  // so N concurrent submits can land a free user at limit+N distinct vehicles.
  // Tolerable for a UX gate with nothing monetary attached; revisit with an
  // advisory lock / in-transaction re-check when paid tiers land (Phase 2).
  const gateCtx = await credits.getPlanGateContext(user.id);
  const gate = vehicleSlotGate({
    plan: gateCtx.plan,
    usedVehicleIds: gateCtx.usedVehicleIds,
    requestedVehicleId: vehicleId,
  });
  if (!gate.allowed) {
    await captureServerEvent('plan_gate_hit', user.id, {
      gate: 'vehicle_slots',
      vehicleId,
      limit: gate.limit,
    });
    redirect(`/vehicles/${vehicleId}?gate=slots`);
  }

  const initialCanvasState = serializeDocument(factory.newDocument(vehicleId));
  const { projectId } = await projects.createProject(user.id, {
    vehicleId,
    name,
    initialCanvasState,
  });
  redirect(`/projects/${projectId}/editor`);
}

export type SaveCanvasResult =
  | { ok: true; rev: number }
  | { ok: false; reason: 'stale' | 'not_found' | 'invalid_canvas' };

// Debounced autosave target (called from the editor's useAutosave hook). Validates
// + migrates the client JSON through @alphawolf/canvas before it touches the JSONB
// column — never trust raw client JSON into the DB.
export async function saveCanvasAction(input: {
  projectId: string;
  versionId: string;
  expectedRev: number;
  canvasState: unknown;
}): Promise<SaveCanvasResult> {
  const user = await requireUser(`/projects/${input.projectId}/editor`);

  let serialized: Record<string, unknown>;
  try {
    const { document } = deserializeDocument(input.canvasState);
    serialized = serializeDocument(document);
  } catch (err) {
    if (err instanceof CanvasSchemaError) return { ok: false, reason: 'invalid_canvas' };
    throw err;
  }

  const res = await projects.saveWorkingCanvas(user.id, {
    versionId: input.versionId,
    expectedRev: input.expectedRev,
    canvasState: serialized,
  });
  return res.ok ? { ok: true, rev: res.rev } : { ok: false, reason: res.reason };
}

export async function renameProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser('/projects');
  if (!(await csrfOk(formData))) throw new Error('Invalid request (CSRF).');
  const projectId = String(formData.get('projectId') ?? '').trim();
  const name = String(formData.get('name') ?? '').trim();
  if (!projectId || !name) throw new Error('Project and name are required.');
  await projects.renameProject(user.id, projectId, name);
  revalidatePath('/projects');
}

export async function deleteProjectAction(formData: FormData): Promise<void> {
  const user = await requireUser('/projects');
  if (!(await csrfOk(formData))) throw new Error('Invalid request (CSRF).');
  const projectId = String(formData.get('projectId') ?? '').trim();
  if (!projectId) throw new Error('Project is required.');
  await projects.softDeleteProject(user.id, projectId);
  revalidatePath('/projects');
}
