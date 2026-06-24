// Print-pack planner (Goal 22) — the bridge from a project's flat template panels
// to a never-short, curvature-corrected paneling plan a shop can print.
//
// Pipeline per panel: flat template size (panelPrintSizesIn) -> curvature-corrected
// true size (× k) -> never-short safe size (× 1+margin) -> tiled to the shop's
// effective media width (panelize). Pure: no DB, no PDF. The print-pack route maps
// the @alphawolf/db repo results onto these structural inputs.

import { panelPrintSizesIn, type VehicleDims } from '@/lib/brief/quality';
import type { BriefPanel } from '@/components/brief/steps';
import {
  resolveCurvature,
  classifyPanel,
  viewAxisFor,
  type CurvatureSource,
  type CurvatureClassPrior,
} from './curvature';
import {
  panelize,
  type PaneledPanel,
  type ShopPrintProfileInput,
  type WrapPanelInput,
} from './paneling';

// Structural mirror of @alphawolf/db VehicleCurvature, so this module stays
// DB-free (and unit-testable without Prisma). The route passes the repo result.
export interface CurvatureData {
  bodyType: string;
  panels: Array<{
    id: string;
    name: string;
    view: string;
    factor: number | null;
    source: CurvatureSource;
    margin: number;
  }>;
  priors: Array<{
    bodyType: string;
    panelClass: string;
    viewAxis: 'length' | 'width';
    k: number;
    margin: number;
  }>;
}

export interface PrintPlanProfile {
  printerKey: string | null;
  printerLabel: string | null;
  nominalWidthIn: number;
  effectiveWidthIn: number;
  overlapIn: number;
  bleedIn: number;
}

export interface PrintPlanPanel {
  id: string;
  name: string;
  view: string;
  flatWidthIn: number;
  flatHeightIn: number;
  trueWidthIn: number;
  trueHeightIn: number;
  safeWidthIn: number;
  safeHeightIn: number;
  curvatureK: number;
  curvatureMargin: number;
  source: CurvatureSource;
  estimated: boolean;
  needsMeasurement: boolean;
  warning: string | null;
  paneled: PaneledPanel;
}

export interface PrintPlan {
  printer: {
    key: string | null;
    label: string | null;
    nominalWidthIn: number;
    effectiveWidthIn: number;
    overlapIn: number;
    bleedIn: number;
  };
  panels: PrintPlanPanel[];
  skipped: Array<{ id: string; name: string; reason: string }>;
  totalLinearFeet: number;
  totalMediaAreaSqFt: number;
  estimated: boolean;
  needsMeasurement: boolean;
}

function findPrior(
  cd: CurvatureData,
  panelClass: string,
  axis: 'length' | 'width' | null,
): CurvatureClassPrior | null {
  if (!axis) return null;
  const exact = cd.priors.find(
    (p) => p.bodyType === cd.bodyType && p.panelClass === panelClass && p.viewAxis === axis,
  );
  if (exact) return exact;
  // Fall back to the generic 'panel' prior for this body + axis so a classified
  // panel still resolves to a seeded prior rather than the worst-case unknown.
  const generic = cd.priors.find(
    (p) => p.bodyType === cd.bodyType && p.panelClass === 'panel' && p.viewAxis === axis,
  );
  return generic ?? null;
}

function findMeasuredSibling(
  cd: CurvatureData,
  panelClass: string,
  selfId: string,
): { factor: number } | null {
  for (const p of cd.panels) {
    if (p.id === selfId) continue;
    if (p.source !== 'measured_in_shop' || p.factor == null) continue;
    if (classifyPanel(p.name) === panelClass) return { factor: p.factor };
  }
  return null;
}

export function buildPrintPlan(input: {
  panels: BriefPanel[];
  dims: VehicleDims;
  curvature: CurvatureData | null;
  profile: PrintPlanProfile;
  includedPanelIds?: string[] | null;
}): PrintPlan {
  const { panels, dims, curvature: cd, profile, includedPanelIds } = input;

  const restrict =
    includedPanelIds && includedPanelIds.length > 0 ? new Set(includedPanelIds) : null;
  const scoped = restrict ? panels.filter((p) => restrict.has(p.id)) : panels;

  const flat = panelPrintSizesIn(scoped, dims);

  const profileInput: ShopPrintProfileInput = {
    effectiveWidthIn: profile.effectiveWidthIn,
    overlapIn: profile.overlapIn,
    bleedIn: profile.bleedIn,
  };

  // Build the curvature-corrected wrap panels, carrying display dims alongside.
  const corrected = new Map<
    string,
    {
      panel: BriefPanel;
      flatW: number;
      flatH: number;
      trueW: number;
      trueH: number;
      k: number;
      margin: number;
      source: CurvatureSource;
      estimated: boolean;
      needsMeasurement: boolean;
      warning: string | null;
    }
  >();
  const wrapPanels: WrapPanelInput[] = [];
  const preSkipped: Array<{ id: string; name: string; reason: string }> = [];

  for (const panel of scoped) {
    const size = flat.get(panel.id);
    if (!size) {
      // No derivable flat size (no/implausible outline) — never print nonsense.
      preSkipped.push({ id: panel.id, name: panel.name, reason: 'no_flat_size' });
      continue;
    }
    const panelClass = classifyPanel(panel.name);
    const axis = viewAxisFor(panel.view);

    const panelCurv = cd?.panels.find((p) => p.id === panel.id) ?? null;
    const sibling = cd ? findMeasuredSibling(cd, panelClass, panel.id) : null;
    const prior = cd ? findPrior(cd, panelClass, axis) : null;

    const resolved = resolveCurvature({
      panel: panelCurv
        ? { factor: panelCurv.factor, source: panelCurv.source, margin: panelCurv.margin }
        : null,
      siblingMeasured: sibling,
      prior,
    });

    const trueW = size.widthIn * resolved.k;
    const trueH = size.heightIn * resolved.k;
    const safeW = trueW * (1 + resolved.margin);
    const safeH = trueH * (1 + resolved.margin);

    corrected.set(panel.id, {
      panel,
      flatW: size.widthIn,
      flatH: size.heightIn,
      trueW,
      trueH,
      k: resolved.k,
      margin: resolved.margin,
      source: resolved.source,
      estimated: resolved.estimated,
      needsMeasurement: resolved.needsMeasurement,
      warning: resolved.warning,
    });
    wrapPanels.push({
      id: panel.id,
      name: panel.name,
      view: panel.view,
      safeWidthIn: safeW,
      safeHeightIn: safeH,
      source: resolved.source,
      estimated: resolved.estimated,
      needsMeasurement: resolved.needsMeasurement,
      warning: resolved.warning,
    });
  }

  const tiled = panelize({ profile: profileInput, panels: wrapPanels });
  const paneledById = new Map(tiled.panels.map((p) => [p.id, p]));

  const planPanels: PrintPlanPanel[] = [];
  for (const [id, c] of corrected) {
    const paneled = paneledById.get(id);
    if (!paneled) continue; // panelize skipped it (recorded in tiled.skipped)
    planPanels.push({
      id,
      name: c.panel.name,
      view: c.panel.view,
      flatWidthIn: c.flatW,
      flatHeightIn: c.flatH,
      trueWidthIn: c.trueW,
      trueHeightIn: c.trueH,
      safeWidthIn: c.trueW * (1 + c.margin),
      safeHeightIn: c.trueH * (1 + c.margin),
      curvatureK: c.k,
      curvatureMargin: c.margin,
      source: c.source,
      estimated: c.estimated,
      needsMeasurement: c.needsMeasurement,
      warning: c.warning,
      paneled,
    });
  }

  const skipped = [...preSkipped, ...tiled.skipped];

  return {
    printer: {
      key: profile.printerKey,
      label: profile.printerLabel,
      nominalWidthIn: profile.nominalWidthIn,
      effectiveWidthIn: profile.effectiveWidthIn,
      overlapIn: profile.overlapIn,
      bleedIn: profile.bleedIn,
    },
    panels: planPanels,
    skipped,
    totalLinearFeet: tiled.totalLinearFeet,
    totalMediaAreaSqFt: tiled.totalMediaAreaSqFt,
    estimated: planPanels.some((p) => p.estimated),
    needsMeasurement: planPanels.some((p) => p.needsMeasurement),
  };
}
