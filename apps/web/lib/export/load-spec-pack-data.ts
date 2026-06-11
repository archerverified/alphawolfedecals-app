// Server-side data assembly for the Wrap Spec Pack (Goal 5 / B2C-009).
// Same auth doctrine as every project surface: the caller passes an
// authenticated userId and every read is RLS-scoped (withUser) — a
// non-owner's loads return null and the route 404s.

import { briefs, projects, storage, vehicles } from '@alphawolf/db';
import { parseBriefData, type BriefData } from '@/lib/brief/schema';
import type { SpecPackData, SpecPackPhoto } from './spec-pack';

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
  const heroPng = await fetchHeroPng(vehicle.thumbPngUrl);
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
    },
    panels: vehicle.panels.map((p) => ({
      id: p.id,
      name: p.name,
      view: p.view,
      outlinePath: p.svgPath,
    })),
    brief: briefData,
    briefVersion,
    photos,
    createdAt: new Date(),
  };
}
