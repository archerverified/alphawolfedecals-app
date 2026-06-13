'use client';

// Public concept voting (Goal 9). Client island on the unauthenticated share
// page: renders the 3 concepts, posts a 👍 to /share/<token>/vote, and reflects
// the live tally. No PII, no auth — the visitor is identified only by an opaque
// httpOnly cookie the vote route sets. Optimistic + best-effort: a failed vote
// rolls back, never breaks the page.

import { useState } from 'react';
import { ThumbsUp } from 'lucide-react';

export type ShareConceptView = {
  conceptKey: string;
  title: string;
  summary: string;
  imageUrl: string | null;
  votes: number;
};

type Props = {
  token: string;
  concepts: ShareConceptView[];
};

export function ShareVoting({ token, concepts: initial }: Props) {
  const [concepts, setConcepts] = useState(initial);
  const [voted, setVoted] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const total = concepts.reduce((sum, c) => sum + c.votes, 0);
  const leader =
    total > 0 ? concepts.reduce((a, b) => (b.votes > a.votes ? b : a), concepts[0]!) : null;

  async function castVote(conceptKey: string) {
    if (busy) return;
    setBusy(conceptKey);
    try {
      const res = await fetch(`/share/${encodeURIComponent(token)}/vote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conceptKey }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as {
        ok: boolean;
        concepts: Array<{ conceptKey: string; votes: number }>;
        voted: string;
      };
      if (!data.ok) return;
      const byKey = new Map(data.concepts.map((c) => [c.conceptKey, c.votes]));
      setConcepts((prev) => prev.map((c) => ({ ...c, votes: byKey.get(c.conceptKey) ?? c.votes })));
      setVoted(data.voted);
    } catch {
      // best-effort — leave the UI as-is
    } finally {
      setBusy(null);
    }
  }

  return (
    <div>
      {leader ? (
        <p
          className="mb-6 text-center text-sm font-medium text-sky-700"
          aria-live="polite"
          data-testid="vote-leader"
        >
          Crew favorite so far: <span className="font-semibold">{leader.title}</span> · {total}{' '}
          {total === 1 ? 'vote' : 'votes'}
        </p>
      ) : (
        <p className="mb-6 text-center text-sm text-zinc-400">Be the first to vote.</p>
      )}

      <ul className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        {concepts.map((c, i) => {
          const isVoted = voted === c.conceptKey;
          return (
            <li
              key={c.conceptKey}
              data-testid={`share-concept-${c.conceptKey}`}
              className={
                'flex flex-col overflow-hidden rounded-xl border bg-white transition-colors ' +
                (isVoted ? 'border-sky-500 ring-1 ring-sky-500' : 'border-zinc-200')
              }
            >
              <div className="relative aspect-[4/3] w-full bg-zinc-100">
                {c.imageUrl ? (
                  <img
                    src={c.imageUrl}
                    alt={`Concept ${i + 1}: ${c.title}`}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-xs text-zinc-400">
                    Preview coming soon
                  </div>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-zinc-900/80 px-2 py-0.5 text-[11px] font-medium text-white">
                  #{i + 1}
                </span>
              </div>

              <div className="flex flex-1 flex-col gap-2 p-4">
                <h2 className="text-sm font-semibold text-zinc-900">{c.title}</h2>
                <p className="line-clamp-3 text-xs text-zinc-500">{c.summary}</p>
                <button
                  type="button"
                  onClick={() => void castVote(c.conceptKey)}
                  disabled={busy === c.conceptKey}
                  data-testid={`share-vote-${c.conceptKey}`}
                  aria-pressed={isVoted}
                  className={
                    'mt-auto inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ' +
                    (isVoted
                      ? 'bg-sky-600 text-white hover:bg-sky-700'
                      : 'bg-zinc-100 text-zinc-800 hover:bg-zinc-200')
                  }
                >
                  <ThumbsUp className="size-4" aria-hidden />
                  {isVoted ? 'Your pick' : 'Pick this'}
                  <span className="tabular-nums text-xs opacity-80">{c.votes}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-center text-xs text-zinc-400">
        One vote per visitor — you can change your mind anytime.
      </p>
    </div>
  );
}
