// Editor route (GH-008). Server Component: authorise + load project, working
// version, and vehicle panels, then hand serialisable props to the client-only
// editor (mounted via EditorMount → dynamic(ssr:false), so Konva never SSRs).

import { notFound } from 'next/navigation';
import { projects, vehicles, storage, briefs, generation } from '@alphawolf/db';
import { requireUser } from '../../../../lib/admin/guard';
import { EditorMount } from '../../../../components/editor/EditorMount';
import type { EditorPanel } from '../../../../components/editor/contract';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Editor — Alpha Wolf Wrap Studio',
};

type WrapSafeZone = { clip_path?: string };

export default async function EditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const user = await requireUser(`/projects/${projectId}/editor`);

  const project = await projects.getProject(user.id, projectId);
  if (!project || project.status === 'deleted') notFound();

  const working = await projects.getWorkingVersion(user.id, projectId);
  if (!working) notFound();

  const vehicle = await vehicles.getPublishedDetail(project.vehicleId);
  if (!vehicle) notFound();

  const panels: EditorPanel[] = vehicle.panels.map((p) => {
    const zone = (p.wrapSafeZone ?? {}) as WrapSafeZone;
    return {
      id: p.id,
      name: p.name,
      view: p.view,
      outlinePath: p.svgPath,
      // Fall back to the panel outline when a panel has no wrap-safe path, so
      // EVERY panel always clips (matches layout-sheet.ts). Without this, a
      // clip-less panel renders its locked AI layer unclipped and the design
      // bleeds across the view (Goal 15 D3 review).
      wrapSafePath: zone.clip_path ?? p.svgPath,
      finishHint: p.finishHint,
      printableAreaMm2: p.printableAreaMm2,
    };
  });

  const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');

  // The recognizable vehicle artwork (Goal 12 D2): the AW-owned wrapped art,
  // coordinate-aligned with the panel geometry. null → the editor falls back to
  // outlined zone boxes (templates without art yet, e.g. the Transit).
  const artUrl = vehicle.svgStorageKey ? storage.templatePublicUrl(vehicle.svgStorageKey) : null;

  // AI design-assistant context (Goal 12 D3): credit balance + whether a brief /
  // active run exists, so the in-editor entry shows cost and routes correctly.
  // Uses the lightweight run context (no per-image signed-URL work) — the editor
  // open path must stay snappy (review finding).
  const [runCtx, brief] = await Promise.all([
    generation.getRunContext(user.id, projectId),
    briefs.getBrief(user.id, projectId),
  ]);
  const ai = {
    creditBalance: runCtx.balance,
    hasBrief: Boolean(brief),
    hasRuns: runCtx.activeRunId !== null,
  };

  return (
    <EditorMount
      projectId={projectId}
      versionId={working.id}
      initialRev={working.rev}
      vehicle={{ id: vehicle.id, label, panels, artUrl }}
      initialDocument={(working.canvasState ?? {}) as Record<string, unknown>}
      ai={ai}
    />
  );
}
