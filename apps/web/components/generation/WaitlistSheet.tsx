'use client';

// Credit-exhaustion sheet (Goal 7 D5, PRD §5 decision 8). NO Stripe, NO
// checkout — a friendly waitlist over the in-progress design, never a
// dead-end page. Purchase-ready: when credit packs go live, this ONE
// component swaps its copy + button action for checkout.

import { useState } from 'react';
import { Sparkles, Check } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@alphawolf/ui/components/ui/dialog';
import { capture } from '@/lib/analytics';

interface Props {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WaitlistSheet({ projectId, open, onOpenChange }: Props) {
  const [joined, setJoined] = useState(false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="waitlist-sheet"
        className="bottom-0 top-auto translate-y-0 rounded-b-none sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-b-lg"
      >
        <DialogHeader>
          <DialogTitle>You&apos;re out of credits for now — more are on the way.</DialogTitle>
          <DialogDescription>
            Credit packs are coming soon. Join the waitlist and we&apos;ll email you the moment
            they&apos;re ready. Everything you&apos;ve made is saved — you can keep working on it in
            the editor anytime.
          </DialogDescription>
        </DialogHeader>
        {joined ? (
          <p
            data-testid="waitlist-joined"
            className="flex items-center gap-2 rounded-md bg-emerald-50 p-3 text-sm text-emerald-800"
          >
            <Check className="size-4 shrink-0" aria-hidden />
            You&apos;re on the list! We&apos;ll let you know as soon as credit packs are ready.
          </p>
        ) : (
          <Button
            data-testid="waitlist-join"
            className="w-full justify-center gap-2"
            onClick={() => {
              capture('credit_waitlist_joined', { projectId });
              setJoined(true);
            }}
          >
            <Sparkles className="size-4" aria-hidden />
            Join the waitlist for credit packs
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
