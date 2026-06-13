// Public share-for-feedback page (Goal 9 / growth loops). Unauthenticated,
// scoped by projects.transfer_token. Shows the project's 3 AI concept directions
// and lets a visitor 👍 one ("my crew picked #2"). The export pack's QR + short
// URL feed visitors here; the loop turns one customer into many.
//
// SECURITY: the data loader (share.loadPublicShare) runs on the system
// connection but returns ONLY whitelisted, non-PII columns — the public vehicle
// label, each concept's title/summary, the WATERMARKED preview path, and vote
// tallies. No owner identity, brief, contact details, or unwatermarked original
// ever reaches this page. Signed preview URLs are time-limited (the storage
// default, ~24h); possession of the share token is the authorisation to view
// the watermarked concepts.

import { randomUUID } from 'node:crypto';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { share, storage } from '@alphawolf/db';

import { captureServerEvent } from '../../../../lib/notifications/posthog-server';
import { ShareVoting, type ShareConceptView } from '../../../../components/share/ShareVoting';
import { VOTER_COOKIE } from '../../../../lib/share/cookie';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Pick a wrap concept — Alpha Wolf Wrap Studio',
  // Per-project ephemeral content shared by link, not for search indexes.
  robots: { index: false, follow: false },
};

function vehicleLabel(v: { year: number; make: string; model: string } | null): string {
  if (!v) return 'this build';
  return `${v.year} ${v.make} ${v.model}`;
}

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await share.loadPublicShare(token);
  if (!data) notFound();

  // Resolve a short-lived signed URL for each concept's watermarked preview.
  // Best-effort per concept — a missing/expired object just renders a fallback.
  const concepts: ShareConceptView[] = await Promise.all(
    data.concepts.map(async (c) => {
      let imageUrl: string | null = null;
      if (c.previewPath) {
        try {
          imageUrl = await storage.signedAssetReadUrl(c.previewPath);
        } catch {
          imageUrl = null;
        }
      }
      return {
        conceptKey: c.conceptKey,
        title: c.title,
        summary: c.summary,
        imageUrl,
        votes: c.votes,
      };
    }),
  );

  const jar = await cookies();
  // Voter cookie when present (returning / post-vote visitor); otherwise a fresh
  // per-view id so anonymous first views don't all collapse into one PostHog
  // person. The cookie is minted by the vote route — a Server Component can't
  // set cookies in Next 15 — so pre-vote view attribution is best-effort.
  const voterId = jar.get(VOTER_COOKIE)?.value ?? `share-anon-${randomUUID()}`;
  await captureServerEvent('share_page_viewed', voterId, {
    project_id: data.projectId,
    concept_count: concepts.length,
    total_votes: data.totalVotes,
  });

  const label = vehicleLabel(data.vehicle);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-sky-600">
          Alpha Wolf Wrap Studio
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Which wrap should win?
        </h1>
        <p className="mx-auto mt-2 max-w-xl text-sm text-zinc-500">
          Three AI concept directions for the {label}. Tap the one you’d roll — your vote helps pick
          the final design.
        </p>
      </header>

      {concepts.length > 0 ? (
        <div className="mt-10">
          <ShareVoting token={token} concepts={concepts} />
        </div>
      ) : (
        <p className="mt-12 rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-12 text-center text-sm text-zinc-500">
          The concepts aren’t ready yet. Check back once the design has been generated.
        </p>
      )}

      <footer className="mt-12 text-center text-xs text-zinc-400">
        Designed with Alpha Wolf Wrap Studio.
      </footer>
    </main>
  );
}
