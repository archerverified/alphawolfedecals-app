'use client';

// Guided design-brief wizard (Goal 5 / B2C-002). Stepped intake form: every
// input optional, progress autosaved per change (useBriefAutosave), resumable
// via design_briefs.current_step. Steps activate as their story lands (see
// BRIEF_STEPS in lib/brief/schema.ts); Review ends at "Save brief" in Phase 1 —
// the Generate button is the Phase 2 seam (B2C-007), marked below.

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check, ChevronLeft, ChevronRight, CloudUpload, Loader2 } from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { capture } from '@/lib/analytics';
import { snapshotBriefAction } from '@/lib/actions/brief';
import { enabledBriefSteps, type BriefData, type BriefStepKey } from '@/lib/brief/schema';
import { useBriefAutosave } from './useBriefAutosave';
import {
  ExtrasStep,
  MaterialsStep,
  NotesStep,
  ReviewStep,
  StyleStep,
  ZoneNotesStep,
  ZonesStep,
  type BriefPanel,
} from './steps';
import { PhotosStep } from './PhotosStep';
import { LogoStep } from './LogoStep';
import { ColorsStep } from './ColorsStep';

export interface BriefWizardProps {
  projectId: string;
  briefId: string;
  initialRev: number;
  initialData: BriefData;
  initialStep: string | null;
  vehicleLabel: string;
  panels: BriefPanel[];
  /** Real overall vehicle dimensions (mm) — anchor for the logo DPI gate. */
  vehicleDims: { lengthMm: number; widthMm: number };
}

export function BriefWizard({
  projectId,
  briefId,
  initialRev,
  initialData,
  initialStep,
  vehicleLabel,
  panels,
  vehicleDims,
}: BriefWizardProps) {
  const steps = useMemo(() => enabledBriefSteps(), []);
  const initialIndex = Math.max(
    0,
    steps.findIndex((s) => s.key === initialStep),
  );
  const [stepIndex, setStepIndex] = useState(initialIndex);
  const [data, setData] = useState<BriefData>(initialData);
  const [savingBrief, setSavingBrief] = useState(false);
  const router = useRouter();

  const step = steps[stepIndex]!;
  const autosave = useBriefAutosave({
    projectId,
    briefId,
    initialRev,
    data,
    currentStep: step.key,
  });

  // Immutable update helper: every step edit produces a new data identity,
  // which is what arms the autosave.
  const patch = useCallback((updater: (prev: BriefData) => BriefData) => {
    setData((prev) => updater(prev));
  }, []);

  const goTo = useCallback(
    (nextIndex: number) => {
      const bounded = Math.min(Math.max(nextIndex, 0), steps.length - 1);
      if (bounded === stepIndex) return;
      if (bounded > stepIndex) {
        capture('brief_step_completed', { projectId, step: step.key });
      }
      // No flush here: useBriefAutosave saves the new step in an effect AFTER
      // the render commits, so the resume point is the step being entered.
      setStepIndex(bounded);
    },
    [stepIndex, steps.length, projectId, step.key],
  );

  const saveBrief = useCallback(() => {
    setSavingBrief(true);
    autosave.flushNow();
    void (async () => {
      try {
        const res = await snapshotBriefAction({ projectId, briefId });
        if (res.ok) {
          capture('brief_step_completed', { projectId, step: 'review' });
          toast.success(`Brief saved (v${res.version}).`);
          router.push(`/projects/${projectId}/editor`);
        } else {
          toast.error('Could not save the brief.');
        }
      } catch {
        toast.error('Could not save the brief.');
      } finally {
        setSavingBrief(false);
      }
    })();
  }, [projectId, briefId, autosave, router]);

  const saveBadge =
    autosave.status === 'saving' || autosave.status === 'pending' ? (
      <span className="flex items-center gap-1 text-xs text-zinc-400">
        <Loader2 className="size-3 animate-spin" aria-hidden /> Saving…
      </span>
    ) : autosave.status === 'saved' ? (
      <span className="flex items-center gap-1 text-xs text-zinc-400">
        <Check className="size-3" aria-hidden /> Saved
      </span>
    ) : autosave.status === 'error' ? (
      <button
        type="button"
        onClick={autosave.flushNow}
        className="flex items-center gap-1 text-xs text-red-500 underline"
      >
        <CloudUpload className="size-3" aria-hidden /> Save failed — retry
      </button>
    ) : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8" data-testid="brief-wizard">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Design brief</h1>
          <p className="text-sm text-zinc-500">{vehicleLabel}</p>
        </div>
        <div className="flex items-center gap-3">
          {saveBadge}
          <Button asChild variant="ghost" size="sm">
            <Link href={`/projects/${projectId}/editor`}>Open editor</Link>
          </Button>
        </div>
      </header>

      <nav aria-label="Brief steps" className="mb-6 flex flex-wrap gap-1">
        {steps.map((s, i) => (
          <button
            key={s.key}
            type="button"
            onClick={() => goTo(i)}
            aria-current={i === stepIndex ? 'step' : undefined}
            data-testid={`brief-step-tab-${s.key}`}
            className={
              'rounded-full px-3 py-1 text-xs transition-colors ' +
              (i === stepIndex
                ? 'bg-zinc-900 text-white'
                : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')
            }
          >
            {s.label}
          </button>
        ))}
      </nav>

      <section className="min-h-[320px]" data-testid={`brief-step-${step.key}`}>
        {step.key === 'zones' && <ZonesStep data={data} patch={patch} panels={panels} />}
        {step.key === 'photos' && <PhotosStep projectId={projectId} data={data} patch={patch} />}
        {step.key === 'logo' && (
          <LogoStep
            projectId={projectId}
            data={data}
            patch={patch}
            panels={panels}
            vehicleDims={vehicleDims}
          />
        )}
        {step.key === 'colors' && <ColorsStep projectId={projectId} data={data} patch={patch} />}
        {step.key === 'style' && <StyleStep data={data} patch={patch} />}
        {step.key === 'zoneNotes' && <ZoneNotesStep data={data} patch={patch} panels={panels} />}
        {step.key === 'materials' && <MaterialsStep data={data} patch={patch} />}
        {step.key === 'extras' && <ExtrasStep data={data} patch={patch} />}
        {step.key === 'aiNotes' && <NotesStep data={data} patch={patch} />}
        {step.key === 'review' && (
          <ReviewStep
            data={data}
            panels={panels}
            vehicleLabel={vehicleLabel}
            onJumpTo={(key: BriefStepKey) => {
              const idx = steps.findIndex((s) => s.key === key);
              if (idx >= 0) setStepIndex(idx);
            }}
          />
        )}
      </section>

      <footer className="mt-8 flex items-center justify-between">
        <Button variant="outline" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
          <ChevronLeft className="size-4" aria-hidden /> Back
        </Button>
        {step.key === 'review' ? (
          // PHASE 2 SEAM (B2C-007): "Generate concepts — uses 1 credit" lands
          // here, next to Save; the snapshot path below is the same one a
          // generation run will version against.
          <Button onClick={saveBrief} disabled={savingBrief} data-testid="brief-save">
            {savingBrief ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
            Save brief
          </Button>
        ) : (
          <Button onClick={() => goTo(stepIndex + 1)} data-testid="brief-next">
            Next <ChevronRight className="size-4" aria-hidden />
          </Button>
        )}
      </footer>
    </div>
  );
}
