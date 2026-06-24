// Server-side print-plan assembly (Goal 22). Shared by the print-pack PDF route
// and the project print page so the membership -> profile -> project -> curvature
// -> plan pipeline lives in ONE place. All loads run under the caller's RLS
// connection (a non-owner / non-member gets nothing).

import { shops, projects, printProfiles, curvature } from '@alphawolf/db';
import { loadSpecPackData } from '@/lib/export/load-spec-pack-data';
import { buildPrintPlan, type PrintPlan } from '@/lib/print/print-pack';

export type PrintPlanLoad =
  | {
      ok: true;
      plan: PrintPlan;
      shopId: string;
      projectName: string;
      vehicleLabel: string;
      artByView: Map<string, { bytes: Uint8Array; kind: 'png' | 'jpg' }>;
    }
  | { ok: false; status: 404 | 409; message: string };

export async function loadPrintPlanForProject(
  user: { id: string; firstName: string; lastName: string; email: string; phone: string | null },
  projectId: string,
): Promise<PrintPlanLoad> {
  const memberships = await shops.listMembershipsForUser(user.id);
  if (memberships.length === 0) {
    return {
      ok: false,
      status: 409,
      message: 'Print packs are a shop feature. Create or join a shop first.',
    };
  }

  let profile: Awaited<ReturnType<typeof printProfiles.getShopPrintProfile>> = null;
  let shopId: string | null = null;
  for (const m of memberships) {
    const p = await printProfiles.getShopPrintProfile(user.id, m.shopId);
    if (p) {
      profile = p;
      shopId = m.shopId;
      break;
    }
  }
  if (!profile || !shopId) {
    return {
      ok: false,
      status: 409,
      message: 'Set up your shop print profile first (Settings > Print profile).',
    };
  }

  const project = await projects.getProject(user.id, projectId);
  if (!project) return { ok: false, status: 404, message: 'Not found' };

  const data = await loadSpecPackData(
    user.id,
    { name: `${user.firstName} ${user.lastName}`.trim(), email: user.email, phone: user.phone },
    projectId,
  );
  if (!data) return { ok: false, status: 404, message: 'Not found' };

  const vehicleCurvature = await curvature.getVehicleCurvature(user.id, project.vehicleId);

  const plan = buildPrintPlan({
    panels: data.panels,
    dims: { lengthMm: data.vehicle.lengthMm, widthMm: data.vehicle.widthMm },
    curvature: vehicleCurvature,
    profile: {
      printerKey: profile.printerKey,
      printerLabel: profile.printerLabel,
      nominalWidthIn: profile.nominalWidthIn,
      effectiveWidthIn: profile.effectiveWidthIn,
      overlapIn: profile.defaultOverlapIn,
      bleedIn: profile.bleedIn,
    },
  });

  const artByView = new Map<string, { bytes: Uint8Array; kind: 'png' | 'jpg' }>();
  for (const v of data.vehicle.views ?? []) {
    artByView.set(v.view, { bytes: v.png, kind: v.kind === 'jpg' ? 'jpg' : 'png' });
  }

  return {
    ok: true,
    plan,
    shopId,
    projectName: data.projectName,
    vehicleLabel: data.vehicle.label,
    artByView,
  };
}
