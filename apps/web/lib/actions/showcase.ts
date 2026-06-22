'use server';

// Goal 21 T6 - Owner-scoped server action that builds and caches the
// multi-view marketing showcase composite for a chosen concept.
//
// Security model (CLAUDE.md §2):
//   - requireUser for auth
//   - projects.getProject(user.id, ...) for RLS ownership (withUser under the hood)
//   - every subsequent read is owner-scoped via repo calls that use withUser
//   - NEVER withSystem for any user-scoped path here
//
// Caching: the PNG is written to project-assets at
//   showcase/<projectId>/<runId>-<conceptKey>.png
// via uploadAssetObject (idempotent overwrite). The signed URL is returned
// fresh each time so it does not expire mid-session.

import * as Sentry from '@sentry/nextjs';

import { briefs, generation, projects, storage, vehicles } from '@alphawolf/db';
import { parseBriefData } from '../brief/schema';
import { composeView, defaultLogoZonePanelIds, type ExportPanel } from '../export/compose-views';
import { requireUser } from '../admin/guard';
import { composeShowcase } from '../generation/showcase';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type BuildShowcaseResult =
  | { ok: true; url: string }
  | { ok: false; code: 'not_found' | 'not_ready' | 'error' };

// ---------------------------------------------------------------------------
// Logo loader (mirrors load-spec-pack-data.ts exactly)
// ---------------------------------------------------------------------------

async function loadLogoBytes(
  userId: string,
  projectId: string,
  briefLogoAssetId: string | null | undefined,
): Promise<Uint8Array | null> {
  if (!briefLogoAssetId) return null;
  try {
    const asset = await projects.getAsset(userId, briefLogoAssetId);
    if (!asset || asset.projectId !== projectId) return null;
    const key = asset.parsedUrl ?? asset.sourceUrl;
    if (!key) return null;
    const bytes = await storage.downloadAssetObject(key);
    if (bytes.byteLength > 4 * 1024 * 1024) return null;
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main action
// ---------------------------------------------------------------------------

/**
 * Build (or rebuild from cache) the on-brand multi-view marketing showcase
 * for the given concept.
 *
 * Owner-scoped: returns not_found for non-owners and non-existent projects.
 * Returns not_ready when no template renders exist yet for the concept.
 * Returns error on unexpected failures (captured to Sentry).
 */
export async function buildShowcaseAction(
  projectId: string,
  runId: string,
  conceptKey: string,
): Promise<BuildShowcaseResult> {
  let userId: string;
  try {
    const user = await requireUser(`/projects/${projectId}/studio`);
    userId = user.id;
  } catch {
    return { ok: false, code: 'not_found' };
  }

  try {
    // RLS ownership check
    const project = await projects.getProject(userId, projectId);
    if (!project) return { ok: false, code: 'not_found' };

    // Load all runs for this project (withUser-backed, RLS enforced)
    const runs = await generation.listRunsForProject(userId, projectId);

    // Identify the run that runId refers to (must belong to this project/concept)
    const targetRun = runs.find((r) => r.id === runId);
    if (!targetRun) return { ok: false, code: 'not_found' };

    // Prefer a complete final run for the concept; fall back to the target run.
    const finalRun =
      runs.find(
        (r) =>
          r.kind === 'final' &&
          r.status === 'complete' &&
          r.conceptKey === conceptKey &&
          r.images.some((i) => i.renderTarget === 'template'),
      ) ?? targetRun;

    // Collect template renders for this concept (render_target='template')
    const templateImages = finalRun.images.filter(
      (i) =>
        i.conceptKey === conceptKey &&
        i.renderTarget === 'template' &&
        (i.storagePath.endsWith('.png') || i.storagePath.endsWith('.jpg')),
    );

    if (templateImages.length === 0) return { ok: false, code: 'not_ready' };

    // Largest per view
    const bestByView = new Map<string, (typeof templateImages)[number]>();
    for (const img of templateImages) {
      const cur = bestByView.get(img.view);
      if (!cur || img.width * img.height > cur.width * cur.height) {
        bestByView.set(img.view, img);
      }
    }

    // On-photo hero: prefer the final run's photo image, else the initial run's
    const photoImage =
      finalRun.images.find((i) => i.conceptKey === conceptKey && i.renderTarget === 'photo') ??
      runs
        .flatMap((r) => r.images)
        .find((i) => i.conceptKey === conceptKey && i.renderTarget === 'photo');

    // Load brief + vehicle for logo compositing
    const brief = await briefs.getBrief(userId, projectId);
    const parsedBrief = parseBriefData(brief?.data ?? {});
    const briefData = parsedBrief.ok ? parsedBrief.data : {};

    const vehicle = await vehicles.getPublishedDetail(project.vehicleId);
    const panels: ExportPanel[] = (vehicle?.panels ?? []).map((p) => ({
      id: p.id,
      name: p.name,
      view: p.view,
      outlinePath: p.svgPath,
    }));

    // Logo
    const logoBytes = await loadLogoBytes(userId, projectId, briefData.logo?.assetId);
    let logoZoneIds = briefData.logo?.zonePanelIds ?? [];
    if (logoBytes && logoZoneIds.length === 0) {
      logoZoneIds = defaultLogoZonePanelIds(panels);
    }
    const logoZoneSet = new Set(logoZoneIds);

    // Build per-view composites (logo on template render)
    const composedViews: Array<{ view: string; png: Uint8Array }> = [];
    for (const [view, img] of bestByView) {
      try {
        const raw = await storage.downloadAssetObject(img.storagePath);
        if (raw.byteLength > 8 * 1024 * 1024) continue;
        const viewPanels = panels.filter((p) => p.view === view);
        const zoneIdsInView = viewPanels.filter((p) => logoZoneSet.has(p.id)).map((p) => p.id);
        const bytes = await composeView({
          renderBytes: new Uint8Array(raw),
          viewPanels,
          logoZonePanelIds: zoneIdsInView,
          logoBytes,
        });
        composedViews.push({ view, png: bytes });
      } catch {
        // Failing a single view is non-fatal; skip it
      }
    }

    if (composedViews.length === 0) return { ok: false, code: 'not_ready' };

    // Load hero bytes (the on-photo render, un-watermarked original)
    let heroPng: Uint8Array | null = null;
    if (photoImage) {
      try {
        const raw = await storage.downloadAssetObject(photoImage.storagePath);
        if (raw.byteLength <= 8 * 1024 * 1024) {
          heroPng = new Uint8Array(raw);
        }
      } catch {
        // Hero missing is non-fatal
      }
    }

    // Compose the showcase PNG
    const showcasePng = await composeShowcase({
      heroPng,
      views: composedViews,
      logoPng: logoBytes,
    });

    // Cache to project-assets (idempotent overwrite)
    const cacheKey = `showcase/${projectId}/${runId}-${conceptKey}.png`;
    await storage.uploadAssetObject(cacheKey, showcasePng, 'image/png');
    const url = await storage.signedAssetReadUrl(cacheKey);

    return { ok: true, url };
  } catch (error) {
    Sentry.captureException(error, { tags: { feature: 'goal-21-showcase' } });
    return { ok: false, code: 'error' };
  }
}
