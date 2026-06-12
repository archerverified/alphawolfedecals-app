'use client';

// The Generate seam (Goal 7 D5, PRD §3 step 4): lives on the brief Review
// step. Cost ON the button (PRD §5 hard rule). Zero balance never dead-ends —
// it opens the waitlist sheet. On success the client-minted UUID token makes
// double-clicks spend exactly once (startRun dedupes on it), then we hand off
// to the generation studio page.

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Loader2, Wand2 } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { startGenerationRunAction } from '@/lib/actions/generation';
import { WaitlistSheet } from './WaitlistSheet';

interface Props {
  projectId: string;
  creditBalance: number;
  /**
   * Flush pending autosaves so the run snapshots the latest brief. AWAITED
   * before the start action — the snapshot must not race the brief PATCH.
   */
  beforeStart?: () => void | Promise<void>;
}

export function GenerateButton({ projectId, creditBalance, beforeStart }: Props) {
  const [busy, setBusy] = useState(false);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const router = useRouter();
  const outOfCredits = creditBalance <= 0;

  const start = async () => {
    if (outOfCredits) {
      setWaitlistOpen(true);
      return;
    }
    setBusy(true);
    try {
      await beforeStart?.();
      const clientToken = crypto.randomUUID();
      const res = await startGenerationRunAction(projectId, clientToken);
      if (res.ok) {
        router.push(`/projects/${projectId}/generate?run=${res.runId}`);
        return; // keep the spinner through the navigation
      }
      if (res.code === 'insufficient_credits') {
        setWaitlistOpen(true);
      } else if (res.code === 'active_run') {
        // A run is already going — just take them to it.
        router.push(`/projects/${projectId}/generate`);
        return;
      } else {
        toast.error(res.message);
      }
      setBusy(false);
    } catch {
      toast.error('Something went wrong on our end. Nothing was charged — try again in a minute.');
      setBusy(false);
    }
  };

  return (
    <span className="inline-flex flex-col items-end gap-1">
      <Button
        onClick={() => void start()}
        disabled={busy}
        aria-disabled={outOfCredits}
        data-testid="generate-concepts"
        className={outOfCredits ? 'opacity-70' : undefined}
      >
        {busy ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : (
          <Wand2 className="size-4" aria-hidden />
        )}
        Generate 3 concepts — uses 1 credit
      </Button>
      {outOfCredits ? (
        <span className="text-xs text-zinc-500" data-testid="generate-no-credits">
          You&apos;re out of credits — tap to join the waitlist.
        </span>
      ) : null}
      <WaitlistSheet projectId={projectId} open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </span>
  );
}
