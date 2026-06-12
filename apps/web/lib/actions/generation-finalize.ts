'use server';

// FINAL-run editor/export handoff (Goal 7 D6). When a kind='final' run
// completes, this action:
//   (a) registers every final render as a ProjectAsset (same rows the parse
//       worker writes: sourceUrl = storage key in the project-assets bucket,
//       parseStatus 'parsed' with parsedUrl set — the renders are already
//       normalized PNGs/JPGs, nothing to parse);
//   (b) inserts each per-view render into the working CanvasDocument as a
//       LOCKED ImageElement at the BACK of the view's largest panel, plus the
//       customer's logo asset (brief logo zones) as UNLOCKED elements on top —
//       THE LOGO IS COMPOSITED, NEVER AI-RENDERED (PRD §5);
//   (c) is idempotent: asset registration keys on sourceUrl, canvas insertion
//       skips elements that already reference the same asset on the same panel.
//
// Canvas insertion is BEST-EFFORT (try/catch): a malformed document or a
// concurrent-editor rev race must never block final completion — the renders
// are already registered and the export hero picks them up regardless.
//
// Documented approximations:
//   * Placement: element coords are template-SVG space (the per-view Konva
//     group adds the only translation — see CanvasStage), so the render is
//     anchored at the view's content-bbox origin and uniformly scaled to
//     COVER the bbox (aspect preserved; overflow clips to the panel's
//     wrap-safe area on render). The AI image's framing vs the template
//     outline is approximate by nature.
//   * srcUrl is a 24h signed read URL — the same convention UploadPanel uses
//     for placed uploads (the editor re-signs nothing on load today).

import {
  briefs,
  generation,
  projects,
  storage,
  vehicles,
  type GenerationImageRow,
} from '@alphawolf/db';
import { factory, deserializeDocument, serializeDocument } from '@alphawolf/canvas';
import type { CanvasDocument, ImageElement, PanelId, VehicleView } from '@alphawolf/canvas';

import { requireUser } from '../admin/guard';
import { parseBriefData } from '../brief/schema';
import { captureServerEvent } from '../notifications/posthog-server';
import {
  centeredPlacement,
  coverPlacement,
  largestPanel,
  viewBbox,
  type PanelGeom,
} from '../generation/placement';

const VEHICLE_VIEWS: ReadonlySet<string> = new Set(['front', 'driver', 'back', 'passenger', 'top']);

export type FinalizeResult =
  | { ok: true; assetsRegistered: number; canvasUpdated: boolean; alreadyDone: boolean }
  | { ok: false; message: string };

function mimeTypeForPath(path: string): string {
  if (path.endsWith('.png')) return 'image/png';
  if (path.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

export async function finalizeFinalRunAction(
  projectId: string,
  runId: string,
): Promise<FinalizeResult> {
  const user = await requireUser(`/projects/${projectId}/generate`);
  if (typeof runId !== 'string' || !runId) {
    return { ok: false, message: "We couldn't find that design run." };
  }

  const run = await generation.getRun(user.id, runId);
  if (!run || run.projectId !== projectId || run.kind !== 'final' || run.status !== 'complete') {
    return { ok: false, message: "We couldn't find a finished final design for this project." };
  }
  const project = await projects.getProject(user.id, projectId);
  if (!project) return { ok: false, message: "We couldn't find that project." };

  const images = await generation.listImages(user.id, runId);
  if (images.length === 0) {
    return { ok: false, message: 'The final run has no renders yet.' };
  }

  // ---- (a) register renders as project assets (idempotent on sourceUrl) ----
  const existingAssets = await projects.listAssets(user.id, projectId);
  const bySourceUrl = new Map(existingAssets.map((a) => [a.sourceUrl, a.assetId]));

  let registered = 0;
  const assetIdByImage = new Map<string, string>();
  for (const img of images) {
    const existing = bySourceUrl.get(img.storagePath);
    if (existing) {
      assetIdByImage.set(img.id, existing);
      continue;
    }
    const { assetId } = await projects.createAsset(user.id, {
      projectId,
      mimeType: mimeTypeForPath(img.storagePath),
      sourceUrl: img.storagePath,
    });
    // The render is already a finished raster — mark it parsed so every
    // consumer that requires parsedUrl (export pack, editor placement) sees it.
    await projects.setAssetParseResult(user.id, {
      assetId,
      parseStatus: 'parsed',
      parsedUrl: img.storagePath,
      parseMetadata: {
        generated: true,
        runId,
        conceptKey: img.conceptKey,
        view: img.view,
        naturalWidth: img.width,
        naturalHeight: img.height,
        provenance: (img.provenance ?? null) as Record<string, unknown> | null,
      },
    });
    assetIdByImage.set(img.id, assetId);
    registered += 1;
  }
  const alreadyDone = registered === 0;

  // ---- (b) canvas insertion — best-effort, never blocks completion ---------
  let canvasUpdated = false;
  try {
    canvasUpdated = await insertIntoCanvas(user.id, projectId, images, assetIdByImage);
  } catch {
    // Approximation documented above: a failed insertion leaves the assets
    // registered; the customer can place them from the editor manually.
    canvasUpdated = false;
  }

  if (!alreadyDone) {
    await captureServerEvent('final_handoff_completed', user.id, {
      projectId,
      runId,
      conceptKey: run.conceptKey,
      assetsRegistered: registered,
      canvasUpdated,
    });
  }

  return { ok: true, assetsRegistered: registered, canvasUpdated, alreadyDone };
}

async function insertIntoCanvas(
  userId: string,
  projectId: string,
  images: GenerationImageRow[],
  assetIdByImage: Map<string, string>,
): Promise<boolean> {
  const project = await projects.getProject(userId, projectId);
  if (!project) return false;
  const vehicle = await vehicles.getPublishedDetail(project.vehicleId);
  if (!vehicle) return false;

  const panelGeoms: PanelGeom[] = vehicle.panels.map((p) => ({
    id: p.id,
    view: p.view,
    svgPath: p.svgPath,
    printableAreaMm2: p.printableAreaMm2,
  }));

  // Logo context (brief logo zones) — composited, never AI-rendered.
  const brief = await briefs.getBrief(userId, projectId);
  const parsedBrief = parseBriefData(brief?.data ?? {});
  const logo = parsedBrief.ok ? parsedBrief.data.logo : undefined;

  // Two attempts: optimistic-concurrency save can lose to an open editor tab.
  for (let attempt = 0; attempt < 2; attempt++) {
    const working = await projects.getWorkingVersion(userId, projectId);
    if (!working) return false;

    const { document: doc } = deserializeDocument(working.canvasState);
    let seq = doc.seq;
    const mint = (label: string) => {
      seq += 1;
      return factory.elementId(`el-${seq}-${label}`);
    };

    const elements: Record<string, ImageElement> = {};
    let changed = false;

    // Per-view final render → LOCKED element at the BACK of the largest panel.
    for (const img of images) {
      if (!VEHICLE_VIEWS.has(img.view)) continue;
      const viewPanels = panelGeoms.filter((p) => p.view === img.view);
      const panel = largestPanel(viewPanels);
      const box = viewBbox(viewPanels);
      if (!panel || !box) continue;
      const assetId = assetIdByImage.get(img.id);
      if (!assetId) continue;
      if (hasElementForAsset(doc, panel.id, assetId)) continue; // idempotent

      const placement = coverPlacement(box, img.width, img.height);
      const el = factory.newImage(
        {
          id: mint('ai'),
          panelId: factory.panelId(panel.id),
          view: img.view as VehicleView,
          assetId: factory.assetId(assetId),
          srcUrl: await storage.signedAssetReadUrl(img.storagePath),
          naturalW: img.width,
          naturalH: img.height,
        },
        {
          x: placement.x,
          y: placement.y,
          scaleX: placement.scale,
          scaleY: placement.scale,
          locked: true,
          name: `AI design — ${img.view}`,
        },
      );
      insertElement(doc, el, 'back');
      elements[el.id] = el;
      changed = true;
    }

    // Logo on its brief-assigned zones — UNLOCKED, on top, exact uploaded art.
    if (logo?.assetId && (logo.zonePanelIds?.length ?? 0) > 0) {
      const asset = await projects.getAsset(userId, logo.assetId);
      const logoKey = asset?.parsedUrl ?? asset?.sourceUrl ?? null;
      if (asset && asset.projectId === projectId && logoKey) {
        const meta = (asset.parseMetadata ?? {}) as Record<string, unknown>;
        const naturalW = typeof meta.naturalWidth === 'number' ? meta.naturalWidth : 1000;
        const naturalH = typeof meta.naturalHeight === 'number' ? meta.naturalHeight : 1000;
        const srcUrl = await storage.signedAssetReadUrl(logoKey);
        for (const zoneId of logo.zonePanelIds ?? []) {
          const panel = panelGeoms.find((p) => p.id === zoneId);
          if (!panel || !VEHICLE_VIEWS.has(panel.view)) continue;
          if (hasElementForAsset(doc, panel.id, logo.assetId)) continue; // idempotent
          const box = viewBbox([panel]);
          if (!box) continue;
          const placement = centeredPlacement(box, naturalW, naturalH);
          const el = factory.newImage(
            {
              id: mint('logo'),
              panelId: factory.panelId(panel.id),
              view: panel.view as VehicleView,
              assetId: factory.assetId(logo.assetId),
              srcUrl,
              naturalW,
              naturalH,
            },
            {
              x: placement.x,
              y: placement.y,
              scaleX: placement.scale,
              scaleY: placement.scale,
              locked: false,
              raster: asset.mimeType !== 'image/svg+xml',
              name: 'Your logo',
            },
          );
          insertElement(doc, el, 'front');
          elements[el.id] = el;
          changed = true;
        }
      }
    }

    if (!changed) return false;
    doc.seq = seq;

    const save = await projects.saveWorkingCanvas(userId, {
      versionId: working.id,
      expectedRev: working.rev,
      canvasState: serializeDocument(doc),
    });
    if (save.ok) return true;
    if (save.reason === 'not_found') return false;
    // stale (an open editor tab saved between our read and write) → loop once
    // more against the fresh rev.
  }
  return false;
}

/** True when the panel already holds an image element for this asset. */
function hasElementForAsset(doc: CanvasDocument, panelId: string, assetId: string): boolean {
  const panelState = doc.panels[panelId];
  if (!panelState) return false;
  return panelState.elementIds.some((id) => {
    const el = doc.elements[id];
    return el?.type === 'image' && el.assetId === assetId;
  });
}

/** Insert an element into its panel's stack at the back or front, renumbering z. */
function insertElement(doc: CanvasDocument, el: ImageElement, where: 'back' | 'front'): void {
  const key = el.panelId as string;
  const panelState = doc.panels[key] ?? {
    panelId: el.panelId as PanelId,
    view: el.view,
    elementIds: [],
  };
  panelState.elementIds =
    where === 'back' ? [el.id, ...panelState.elementIds] : [...panelState.elementIds, el.id];
  doc.panels[key] = panelState;
  doc.elements[el.id] = el;
  // element.zIndex mirrors elementIds order (schema contract).
  panelState.elementIds.forEach((id, i) => {
    const existing = doc.elements[id];
    if (existing) existing.zIndex = i;
  });
}
