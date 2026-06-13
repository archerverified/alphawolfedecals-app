'use client';

// Share-for-feedback entry point (Goal 9). Sits in the concept gallery once the
// 3 directions exist: mints the public /share/<token> link (owner-scoped action)
// and lets the customer copy it to send to their crew. The far side is the
// unauthenticated voting page — no PII leaves the studio, just the share URL.

import { useState } from 'react';
import { Check, Copy, Share2 } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';

import { createShareLinkAction } from '@/lib/actions/share';

export function ShareForFeedback({ projectId }: { projectId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(false);

  async function makeLink() {
    setBusy(true);
    setError(false);
    try {
      const res = await createShareLinkAction(projectId);
      if (res.ok) setUrl(res.url);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked — the input is selectable as a fallback
    }
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-zinc-900">Not sure which to pick?</p>
          <p className="text-xs text-zinc-500">
            Share these three with your crew and let them vote.
          </p>
        </div>
        {!url ? (
          <Button onClick={() => void makeLink()} disabled={busy} data-testid="share-feedback-btn">
            <Share2 className="size-4" aria-hidden />
            {busy ? 'Creating link…' : 'Share for feedback'}
          </Button>
        ) : null}
      </div>

      {url ? (
        <div className="mt-3 flex items-center gap-2">
          <input
            readOnly
            value={url}
            onFocus={(e) => e.currentTarget.select()}
            data-testid="share-feedback-url"
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-700"
          />
          <Button variant="outline" onClick={() => void copy()} data-testid="share-feedback-copy">
            {copied ? (
              <Check className="size-4" aria-hidden />
            ) : (
              <Copy className="size-4" aria-hidden />
            )}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="mt-2 text-xs text-red-600">Couldn’t create a link. Please try again.</p>
      ) : null}
    </div>
  );
}
