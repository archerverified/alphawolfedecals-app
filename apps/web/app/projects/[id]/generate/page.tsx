// Generation studio route (Goal 7 D5). Server Component shell: authorise +
// load project/vehicle, compute the stock view-render URLs (the before image
// for the compare slider), and the initial generation context, then hand
// serialisable props to the client GenerationStudio (which owns the poll).

import { notFound } from 'next/navigation';
import { briefs, projects, storage, vehicles } from '@alphawolf/db';
import { requireUser } from '../../../../lib/admin/guard';
import { getGenerationContextAction } from '../../../../lib/actions/generation';
import { resolveRunViews } from '../../../../lib/ai/run-pipeline';
import { parseBriefData } from '../../../../lib/brief/schema';
import { GenerationStudio } from '../../../../components/generation/GenerationStudio';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'AI design studio',
};

export default async function GeneratePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ run?: string }>;
}) {
  const { id: projectId } = await params;
  const { run } = await searchParams;
  const user = await requireUser(`/projects/${projectId}/generate`);

  const project = await projects.getProject(user.id, projectId);
  if (!project || project.status === 'deleted') notFound();

  const vehicle = await vehicles.getPublishedDetail(project.vehicleId);
  if (!vehicle) notFound();

  // Stock template renders for the views this project can generate (narrowed
  // by the brief's included zones, same rule as the pipeline itself).
  const brief = await briefs.getBrief(user.id, projectId);
  const parsed = parseBriefData(brief?.data ?? {});
  const views = resolveRunViews(vehicle.panels, parsed.ok ? parsed.data : null);
  const stockViews = Object.fromEntries(
    views.map((v) => [v, storage.templatePublicUrl(`views/${vehicle.id}/${v}.png`)]),
  );

  const context = await getGenerationContextAction(projectId);
  if (!context.ok) notFound();

  const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');

  return (
    <main className="min-h-screen bg-zinc-50">
      <GenerationStudio
        projectId={projectId}
        vehicleLabel={label}
        initialRunId={typeof run === 'string' && run.length > 0 ? run : null}
        stockViews={stockViews}
        initialContext={context}
      />
    </main>
  );
}
