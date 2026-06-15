'use client';

// In-editor AI design entry (Goal 12 D3). A clear "Design with AI" button that
// opens a dialog showing the credit cost up front and runs the EXISTING Goal 7
// brief→3-concepts pipeline (reuses GenerateButton). The chosen concept composites
// onto the vehicle views in the AI studio; the customer's logo is composited,
// never AI-rendered. We do NOT rebuild the pipeline — we surface it.

import { useState } from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@alphawolf/ui/components/ui/dialog';
import { GenerateButton } from '@/components/generation/GenerateButton';
import type { EditorAiContext } from './contract';

interface Props {
  projectId: string;
  ai: EditorAiContext;
  /** Render as the compact top-bar button (default) or a full-width CTA. */
  variant?: 'bar' | 'cta';
}

export function AiDesignButton({ projectId, ai, variant = 'bar' }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        size="sm"
        variant={variant === 'cta' ? 'outline' : 'default'}
        className="gap-1.5"
        data-testid="design-with-ai"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="size-4" aria-hidden /> Design with AI
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-white">
          <DialogHeader>
            <DialogTitle>Design with AI</DialogTitle>
            <DialogDescription>
              Generate three wrap concepts rendered on your own vehicle, refine the one you like,
              then drop it straight onto the canvas.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3 py-1">
            <div className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 text-sm">
              <span className="text-zinc-600">Generation credits</span>
              <span className="font-semibold text-zinc-900" data-testid="ai-credit-balance">
                {ai.creditBalance}
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Your uploaded logo is composited onto the wrap — never AI-generated.
            </p>
          </div>

          <DialogFooter className="flex-col items-stretch gap-2 sm:flex-col sm:items-stretch">
            {ai.hasBrief ? (
              <GenerateButton projectId={projectId} creditBalance={ai.creditBalance} />
            ) : (
              <Button asChild className="w-full gap-1.5">
                <a href={`/projects/${projectId}/brief`} data-testid="ai-start-brief">
                  Start your design brief <ArrowRight className="size-4" aria-hidden />
                </a>
              </Button>
            )}
            {ai.hasRuns ? (
              <Button asChild variant="ghost" size="sm">
                <a href={`/projects/${projectId}/generate`} data-testid="ai-open-studio">
                  Open AI studio
                </a>
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
