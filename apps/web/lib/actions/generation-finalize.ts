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
  VIEW_ORDER,
  briefs,
  generation,
  projects,
  storage,
  vehicles,
  type GenerationImageRow,
  type ProjectRow,
} from '@alphawolf/db';
import { factory, deserializeDocument, serializeDocument } from '@alphawolf/canvas';
import type { CanvasDocument, ImageElement, PanelId, VehicleView } from '@alphawolf/canvas';

import { requireUser } from '../admin/guard';
import { parseBriefData } from '../brief/schema';
import { captureServerEvent } from '../notifications/posthog-server';
import {
  centeredPlacement,
  coverPlacement,
  viewBbox,
  type PanelGeom,
} from '../generation/placement';

// THE canonical view set (PR #142): consumers must not drift from VIEW_ORDER.
const VEHICLE_VIEWS: ReadonlySet<string> = new Set(VIEW_ORDER);

// Inserted srcUrls are signed READ urls persisted into the canvas document.
// The editor does not re-sign on load (UploadPanel convention), so locked AI
// layers get a LONG TTL — 30 days, vs the 24h default — to keep the design
// visible across normal revisit gaps. Known limitation, documented in the PR:
// the durable fix is signing at document load.
const CANVAS_SRC_TTL_SECONDS = 30 * 24 * 60 * 60;

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
  const bySourceUrl = new Map(existingAssets.map((a) => [a.sourceUrl, a]));

  let registered = 0;
  const assetIdByImage = new Map<string, string>();
  for (const img of images) {
    const existing = bySourceUrl.get(img.storagePath);
    let assetId = existing?.assetId ?? null;
    if (!assetId) {
      assetId = (
        await projects.createAsset(user.id, {
          projectId,
          mimeType: mimeTypeForPath(img.storagePath),
          sourceUrl: img.storagePath,
        })
      ).assetId;
      registered += 1;
    }
    // The render is already a finished raster — mark it parsed so every
    // consumer that requires parsedUrl (export pack, editor placement) sees
    // it. Also runs for an EXISTING row that isn't parsed yet: a crash
    // between create and this write must be repairable on retry (no parse
    // worker will ever claim a generated asset).
    if (!existing || existing.parseStatus !== 'parsed' || !existing.parsedUrl) {
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
    }
    assetIdByImage.set(img.id, assetId);
  }
  const alreadyDone = registered === 0;

  // ---- (b) canvas insertion — best-effort, never blocks completion ---------
  let canvasUpdated: boolean;
  try {
    canvasUpdated = await insertIntoCanvas(user.id, project, images, assetIdByImage);
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
  project: ProjectRow,
  images: GenerationImageRow[],
  assetIdByImage: Map<string, string>,
): Promise<boolean> {
  const projectId = project.id;
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

  // Signing + asset reads hoisted OUT of the retry loop: none of them depend
  // on the canvas rev, and each signedAssetReadUrl is a storage-API round trip.
  const signedByImageId = new Map<string, string>(
    await Promise.all(
      images.map(
        async (img) =>
          [img.id, await storage.signedAssetReadUrl(img.storagePath, CANVAS_SRC_TTL_SECONDS)] as [
            string,
            string,
          ],
      ),
    ),
  );
  const logoAsset = logo?.assetId ? await projects.getAsset(userId, logo.assetId) : null;
  // D2: a logo with no assigned zone still lands on a prominent panel (driver
  // door / hood) — mirrors the export compositor so editor and pack agree.
  const logoZoneIds =
    logo?.zonePanelIds && logo.zonePanelIds.length > 0
      ? logo.zonePanelIds
      : prominentLogoZoneIds(vehicle.panels);
  const logoKey = logoAsset?.parsedUrl ?? logoAsset?.sourceUrl ?? null;
  const logoSrcUrl =
    logoAsset && logoAsset.projectId === projectId && logoKey
      ? await storage.signedAssetReadUrl(logoKey, CANVAS_SRC_TTL_SECONDS)
      : null;

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

    let changed = false;

    // Per-view final render → a LOCKED layer at the BACK of EVERY panel in the
    // view (Goal 15 D3). One element per panel, each clipped to its own
    // wrap-safe area, all sharing the SAME cover placement over the view bbox —
    // so the design reads as ONE continuous wrap across the whole vehicle
    // instead of a single clipped fragment in the largest panel (the Goal-13
    // "messy raster fragments" bug — only the largest panel showed the design).
    for (const img of images) {
      if (!VEHICLE_VIEWS.has(img.view)) continue;
      const viewPanels = panelGeoms.filter((p) => p.view === img.view);
      const box = viewBbox(viewPanels);
      if (!box) continue;
      const assetId = assetIdByImage.get(img.id);
      const srcUrl = signedByImageId.get(img.id);
      if (!assetId || !srcUrl) continue;
      const layerName = `AI design — ${img.view}`;
      const placement = coverPlacement(box, img.width, img.height);
      for (const panel of viewPanels) {
        // Idempotency, two keys: same asset already placed in THIS panel
        // (normal retry), OR a locked AI layer with this view's name already
        // exists here (concurrent sweeps registered duplicate asset rows — the
        // rev CAS forces the loser to re-read, this name check stops its copy).
        if (hasElementForAsset(doc, panel.id, assetId)) continue;
        if (hasLockedLayerNamed(doc, panel.id, layerName)) continue;
        const el = factory.newImage(
          {
            id: mint('ai'),
            panelId: factory.panelId(panel.id),
            view: img.view as VehicleView,
            assetId: factory.assetId(assetId),
            srcUrl,
            naturalW: img.width,
            naturalH: img.height,
          },
          {
            x: placement.x,
            y: placement.y,
            scaleX: placement.scale,
            scaleY: placement.scale,
            locked: true,
            name: layerName,
          },
        );
        insertElement(doc, el, 'back');
        changed = true;
      }
    }

    // Logo on its brief-assigned zones — UNLOCKED, on top, exact uploaded art.
    // APPROXIMATION: naturalW/H come from parseMetadata; SVG logos parsed via
    // passthrough carry no dimensions, so they fall back to a 1000×1000 square
    // (possible aspect distortion). The element is unlocked — the customer can
    // resize — and the render itself is the exact uploaded artwork.
    if (logoAsset && logoSrcUrl && logo?.assetId) {
      const meta = (logoAsset.parseMetadata ?? {}) as Record<string, unknown>;
      const naturalW = typeof meta.naturalWidth === 'number' ? meta.naturalWidth : 1000;
      const naturalH = typeof meta.naturalHeight === 'number' ? meta.naturalHeight : 1000;
      for (const zoneId of logoZoneIds) {
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
            srcUrl: logoSrcUrl,
            naturalW,
            naturalH,
          },
          {
            x: placement.x,
            y: placement.y,
            scaleX: placement.scale,
            scaleY: placement.scale,
            locked: false,
            raster: logoAsset.mimeType !== 'image/svg+xml',
            name: 'Your logo',
          },
        );
        insertElement(doc, el, 'front');
        changed = true;
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

// D2: pick a prominent panel for a logo the brief left unzoned — driver door,
// else hood, else the first panel. Mirrors compose-views.defaultLogoZonePanelIds.
function prominentLogoZoneIds(panels: { id: string; name: string; view: string }[]): string[] {
  const find = (re: RegExp, view?: string) =>
    panels.find((p) => re.test(p.name) && (!view || p.view === view));
  const pick =
    find(/front door/i, 'driver') ?? find(/\bhood\b/i) ?? find(/front door/i) ?? panels[0];
  return pick ? [pick.id] : [];
}

/** True when the panel already holds a LOCKED image layer with this name. */
function hasLockedLayerNamed(doc: CanvasDocument, panelId: string, name: string): boolean {
  const panelState = doc.panels[panelId];
  if (!panelState) return false;
  return panelState.elementIds.some((id) => {
    const el = doc.elements[id];
    return el?.type === 'image' && el.locked && el.name === name;
  });
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
