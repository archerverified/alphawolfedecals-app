// Guided design-brief wizard route (Goal 5 / B2C-002). Server Component:
// authorise + load project, brief (created on first visit), and the vehicle's
// panel breakdown, then hand serialisable props to the client wizard.

import { notFound } from 'next/navigation';
import { briefs, projects, vehicles } from '@alphawolf/db';
import { requireUser } from '../../../../lib/admin/guard';
import { BriefWizard } from '../../../../components/brief/BriefWizard';
import { parseBriefData, type BriefData } from '../../../../lib/brief/schema';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Design brief — Alpha Wolf Wrap Studio',
};

export default async function BriefPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = await params;
  const user = await requireUser(`/projects/${projectId}/brief`);

  const project = await projects.getProject(user.id, projectId);
  if (!project || project.status === 'deleted') notFound();

  const brief = await briefs.getOrCreateBrief(user.id, projectId);
  if (!brief) notFound();

  const vehicle = await vehicles.getPublishedDetail(project.vehicleId);
  if (!vehicle) notFound();

  // A historical brief that fails today's schema starts fresh rather than
  // crashing the wizard (the autosave will overwrite it on first edit).
  const parsed = parseBriefData(brief.data ?? {});
  const initialData: BriefData = parsed.ok ? parsed.data : {};

  const label = [vehicle.year, vehicle.make, vehicle.model, vehicle.trim].filter(Boolean).join(' ');

  return (
    <main className="min-h-screen bg-zinc-50">
      <BriefWizard
        projectId={projectId}
        briefId={brief.id}
        initialRev={brief.rev}
        initialData={initialData}
        initialStep={brief.currentStep}
        vehicleLabel={label}
        panels={vehicle.panels.map((p) => ({ id: p.id, name: p.name, view: p.view }))}
      />
    </main>
  );
}
