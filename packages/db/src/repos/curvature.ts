// Curvature data repository (Goal 22 / D4). Loads everything the print engine
// needs to correct one vehicle's flat template dims to true never-short dims:
// the vehicle's body type, each panel's per-panel curvature (factor/source/margin
// from vehicle_panels), and the global class-prior table. All under withUser:
// vehicle_panels RLS requires the vehicle be published (or admin), and the priors
// RLS requires an authenticated app session. The pure resolution + math lives in
// apps/web/lib/print/curvature.ts; this repo is just the typed read.

import { withUser, type TxClient } from '../client.js';

export type CurvatureSourceValue =
  | 'measured_in_shop'
  | 'calibrated_sibling'
  | 'class_prior'
  | 'unknown';

export interface CurvaturePriorRow {
  bodyType: string;
  panelClass: string;
  viewAxis: 'length' | 'width';
  k: number;
  margin: number;
}

export interface PanelCurvatureRow {
  id: string;
  name: string;
  view: string;
  /** curvature_factor (k); null = fall back to the class prior. */
  factor: number | null;
  source: CurvatureSourceValue;
  margin: number;
}

export interface VehicleCurvature {
  bodyType: string;
  panels: PanelCurvatureRow[];
  priors: CurvaturePriorRow[];
}

export async function getVehicleCurvature(
  userId: string,
  vehicleId: string,
): Promise<VehicleCurvature | null> {
  return withUser(userId, async (db: TxClient) => {
    const vehicle = await db.vehicle.findUnique({
      where: { id: vehicleId },
      select: { bodyType: true },
    });
    if (!vehicle) return null;

    const panels = await db.vehiclePanel.findMany({
      where: { vehicleId },
      select: {
        id: true,
        name: true,
        view: true,
        curvatureFactor: true,
        curvatureSource: true,
        curvatureMargin: true,
      },
    });

    // version 1 is the seeded baseline; a future re-calibration bumps version and
    // this picks the highest version per (body, class, axis). Keyed in code so a
    // partially superseded table still resolves to the newest prior.
    const priorRows = await db.curvatureClassPrior.findMany({
      select: {
        bodyType: true,
        panelClass: true,
        viewAxis: true,
        k: true,
        margin: true,
        version: true,
      },
      orderBy: { version: 'desc' },
    });
    const seen = new Set<string>();
    const priors: CurvaturePriorRow[] = [];
    for (const pr of priorRows) {
      const key = `${pr.bodyType}|${pr.panelClass}|${pr.viewAxis}`;
      if (seen.has(key)) continue;
      seen.add(key);
      priors.push({
        bodyType: pr.bodyType,
        panelClass: pr.panelClass,
        viewAxis: pr.viewAxis === 'width' ? 'width' : 'length',
        k: Number(pr.k),
        margin: Number(pr.margin),
      });
    }

    return {
      bodyType: vehicle.bodyType,
      panels: panels.map((p) => ({
        id: p.id,
        name: p.name,
        view: p.view,
        factor: p.curvatureFactor == null ? null : Number(p.curvatureFactor),
        source: p.curvatureSource as CurvatureSourceValue,
        margin: Number(p.curvatureMargin),
      })),
      priors,
    };
  });
}
