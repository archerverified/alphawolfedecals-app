// Server-side data assembly for the Wrap Spec Pack (Goal 5 / B2C-009).
// Same auth doctrine as every project surface: the caller passes an
// authenticated userId and every read is RLS-scoped (withUser) — a
// non-owner's loads return null and the route 404s.

import * as Sentry from '@sentry/nextjs';
import { VIEW_ORDER, briefs, generation, projects, storage, vehicles } from '@alphawolf/db';
import { parseBriefData, type BriefData } from '@/lib/brief/schema';
import type { AiProvenance, SpecPackData, SpecPackPhoto } from './spec-pack';
import {
  composeView,
  defaultLogoZonePanelIds,
  pickHeroView,
  type ComposedView,
  type ExportPanel,
} from './compose-views';

const MAX_EMBEDDED_PHOTOS = 4;

function appBaseUrl(): string {
  // Prod URL until a custom domain lands; override via env for previews.
  return process.env.APP_BASE_URL ?? 'https://alphawolfedecals-app-web.vercel.app';
}

async function fetchHeroPng(url: string | null): Promise<Uint8Array | undefined> {
  if (!url || !url.endsWith('.png')) return undefined;
  // Allowlist: only our Supabase public-storage origin — thumbPngUrl is
  // admin-written catalog data, but a server-side fetch embedded into a
  // user-delivered PDF deserves the one-line SSRF pin (PR #129 review).
  const base = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base || !url.startsWith(`${base.replace(/\/+$/, '')}/storage/v1/object/public/`)) {
    return undefined;
  }
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return undefined;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return undefined;
  }
}

// The logo bytes (parsed PNG, or the raw SVG which sharp rasterizes) to
// composite onto the renders. Capped — a giant upload must not blow up memory.
async function loadLogoBytes(
  userId: string,
  projectId: string,
  brief: BriefData,
): Promise<Uint8Array | null> {
  const logo = brief.logo;
  if (!logo?.assetId) return null;
  try {
    const asset = await projects.getAsset(userId, logo.assetId);
    if (!asset || asset.projectId !== projectId) return null;
    const key = asset.parsedUrl ?? asset.sourceUrl;
    if (!key) return null;
    const bytes = await storage.downloadAssetObject(key);
    if (bytes.byteLength > 4 * 1024 * 1024) return null;
    return new Uint8Array(bytes);
  } catch (error) {
    Sentry.captureException(error, { tags: { feature: 'spec-pack-logo' } });
    return null;
  }
}

// Goal 7 D6 + Goal 15 D2/D4: the pack shows the customer's CHOSEN design across
// every view (the largest render per view), with the LOGO COMPOSITED onto each
// view at its assigned zone (D2) — over the stock template thumb. PNG/JPEG only
// (what pdf-lib can embed); composited output is always JPEG. A webp-only final
// or an oversized render is skipped rather than failing the pack.
async function loadFinalViews(
  userId: string,
  projectId: string,
  brief: BriefData,
  panels: ExportPanel[],
): Promise<{ views: ComposedView[]; provenance: AiProvenance } | null> {
  try {
    const runs = await generation.listRunsForProject(userId, projectId);
    const finalRun = runs.find(
      (r) => r.kind === 'final' && r.status === 'complete' && r.images.length > 0,
    );
    if (!finalRun) return null;
    const renderable = finalRun.images.filter(
      (i) => i.storagePath.endsWith('.png') || i.storagePath.endsWith('.jpg'),
    );
    if (renderable.length === 0) return null;

    // Largest render per view (a view can have multiple if re-rendered).
    const bestByView = new Map<string, (typeof renderable)[number]>();
    for (const img of renderable) {
      const cur = bestByView.get(img.view);
      if (!cur || img.width * img.height > cur.width * cur.height) bestByView.set(img.view, img);
    }

    const logoBytes = await loadLogoBytes(userId, projectId, brief);
    let logoZoneIds = brief.logo?.zonePanelIds ?? [];
    // D2: a logo with no assigned zone defaults to a prominent panel.
    if (logoBytes && logoZoneIds.length === 0) logoZoneIds = defaultLogoZonePanelIds(panels);
    const logoZoneSet = new Set(logoZoneIds);

    const orderedViews = [...bestByView.keys()].sort((a, b) => {
      const ia = VIEW_ORDER.indexOf(a);
      const ib = VIEW_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });

    const views: ComposedView[] = [];
    for (const view of orderedViews) {
      const img = bestByView.get(view)!;
      const raw = await storage.downloadAssetObject(img.storagePath);
      // The pack is emailed (B2C-010) — skip an outsized source render.
      if (raw.byteLength > 8 * 1024 * 1024) continue;
      const viewPanels = panels.filter((p) => p.view === view);
      const zoneIdsInView = viewPanels.filter((p) => logoZoneSet.has(p.id)).map((p) => p.id);
      const bytes = await composeView({
        renderBytes: new Uint8Array(raw),
        viewPanels,
        logoZonePanelIds: zoneIdsInView,
        logoBytes,
      });
      views.push({ view, bytes, kind: 'jpg' });
    }
    if (views.length === 0) return null;

    const prov = (renderable[0]!.provenance ?? {}) as Record<string, unknown>;
    return {
      views,
      provenance: {
        provider: typeof prov.provider === 'string' ? prov.provider : finalRun.provider,
        model: typeof prov.model === 'string' ? prov.model : finalRun.model,
        runId: finalRun.id,
        promptVersion: typeof prov.promptVersion === 'string' ? prov.promptVersion : '',
      },
    };
  } catch (error) {
    // A missing object / transient storage error never blocks the pack — but
    // it must not be INVISIBLE either (generation tables missing on a surface =
    // the whole hero feature silently dead).
    Sentry.captureException(error, { tags: { feature: 'spec-pack-hero' } });
    return null;
  }
}

async function loadPhotos(
  userId: string,
  projectId: string,
  brief: BriefData,
): Promise<SpecPackPhoto[]> {
  const refs = (brief.photos ?? []).slice(0, MAX_EMBEDDED_PHOTOS);
  const out: SpecPackPhoto[] = [];
  for (const ref of refs) {
    const asset = await projects.getAsset(userId, ref.assetId);
    // parsedUrl only: the worker normalizes every raster to PNG; raw HEIC/JPG
    // sources aren't embeddable.
    if (!asset || asset.projectId !== projectId || !asset.parsedUrl) continue;
    try {
      const png = await storage.downloadAssetObject(asset.parsedUrl);
      out.push({ png: new Uint8Array(png), note: ref.note });
    } catch {
      // A missing object never blocks the pack.
    }
  }
  return out;
}

export async function loadSpecPackData(
  userId: string,
  userContact: { name: string; email: string; phone?: string | null },
  projectId: string,
): Promise<SpecPackData | null> {
  const project = await projects.getProject(userId, projectId);
  if (!project || project.status === 'deleted') return null;

  const vehicle = await vehicles.getPublishedDetail(project.vehicleId);
  if (!vehicle) return null;

  // Read-only: a GET must not insert (PR #129 review) — a project whose
  // wizard was never opened still exports an (empty-brief) pack.
  const brief = await briefs.getBrief(userId, projectId);
  const parsed = parseBriefData(brief?.data ?? {});
  const briefData: BriefData = parsed.ok ? parsed.data : {};

  const briefVersion = brief
    ? ((await briefs.listBriefSnapshots(userId, brief.id).catch(() => []))[0]?.version ?? null)
    : null;

  const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');
  const exportPanels: ExportPanel[] = vehicle.panels.map((p) => ({
    id: p.id,
    name: p.name,
    view: p.view,
    outlinePath: p.svgPath,
  }));
  const finalViews = await loadFinalViews(userId, projectId, briefData, exportPanels);
  // D4: hero is a strong angle (driver/front), never the bare rear.
  const hero = finalViews ? pickHeroView(finalViews.views) : null;
  const heroPng = hero?.bytes ?? (await fetchHeroPng(vehicle.thumbPngUrl));
  const photos = await loadPhotos(userId, projectId, briefData);

  return {
    projectId,
    projectName: project.name,
    projectUrl: `${appBaseUrl()}/projects/${projectId}`,
    customer: userContact,
    vehicle: {
      label,
      lengthMm: vehicle.lengthMm,
      widthMm: vehicle.widthMm,
      heightMm: vehicle.heightMm,
      heroPng,
      heroKind: hero ? 'jpg' : 'png',
      ...(finalViews
        ? { views: finalViews.views.map((v) => ({ view: v.view, png: v.bytes, kind: v.kind })) }
        : {}),
    },
    panels: exportPanels,
    brief: briefData,
    briefVersion,
    photos,
    createdAt: new Date(),
    ...(finalViews ? { aiProvenance: finalViews.provenance } : {}),
  };
}
