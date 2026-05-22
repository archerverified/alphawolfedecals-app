// Customer project list (GH-008 supporting scope). A logged-in customer's
// projects, newest first, each opening into the wrap editor. Server Component:
// gates on requireUser, reads the RLS-scoped project list, and hands a
// double-submit CSRF token down to the rename/delete forms (the same token the
// auth flow bootstrapped via middleware, scoped path:'/').

import Link from 'next/link';
import { projects } from '@alphawolf/db';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@alphawolf/ui/components/ui/card';
import { requireUser } from '../../lib/admin/guard';
import { getOrCreateFormCsrfToken } from '../../lib/csrf';
import { ProjectCardMenu } from '../../components/projects/ProjectCardMenu';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Your projects — Alpha Wolf Wrap Studio',
};

function formatUpdated(date: Date): string {
  return new Date(date).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default async function ProjectsPage() {
  const user = await requireUser('/projects');
  const [rows, csrfToken] = await Promise.all([
    projects.listProjects(user.id),
    getOrCreateFormCsrfToken(),
  ]);

  return (
    <main className="min-h-screen bg-zinc-50 px-4 py-12">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-widest text-zinc-500">
              Alpha Wolf Wrap Studio
            </p>
            <h1 className="mt-1 text-2xl font-semibold text-zinc-900">Your projects</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-600">
              Pick up where you left off, or start a new wrap design from a vehicle template.
            </p>
          </div>
          <Link
            href="/vehicles/select"
            className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
          >
            New project
          </Link>
        </header>

        {rows.length === 0 ? (
          <Card className="border-dashed text-center" data-testid="projects-empty">
            <CardHeader>
              <CardTitle>No projects yet</CardTitle>
              <CardDescription>
                Choose a vehicle template and start your first wrap design.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Link
                href="/vehicles/select"
                className="inline-flex items-center justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-zinc-800"
              >
                Start your first project
              </Link>
            </CardContent>
          </Card>
        ) : (
          <ul
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="projects-grid"
          >
            {rows.map((p) => (
              <li key={p.id}>
                <Card className="flex h-full flex-col" data-testid="project-card">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="truncate" title={p.name}>
                        {p.name}
                      </CardTitle>
                      <ProjectCardMenu
                        projectId={p.id}
                        projectName={p.name}
                        csrfToken={csrfToken}
                      />
                    </div>
                    <CardDescription>Updated {formatUpdated(p.updatedAt)}</CardDescription>
                  </CardHeader>
                  <CardContent className="mt-auto">
                    <Link
                      href={`/projects/${p.id}/editor`}
                      className="inline-flex items-center justify-center rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm font-medium text-zinc-800 shadow-sm transition hover:bg-zinc-50"
                      data-testid="project-open"
                    >
                      Open
                    </Link>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
