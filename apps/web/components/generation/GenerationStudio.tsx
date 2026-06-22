'use client';

// Generation studio (Goal 7 D5, PRD §3 step 4 + §5). The client side of the
// poll-driven pipeline: every ~2.5s tick calls advanceGenerationAction, which
// BOTH advances the run one slice AND returns the snapshot this UI renders —
// the poll IS the pipeline driver (pipeline design review item 1).
//
// PRD §5 hard rules honored here: credit balance always visible; cost on every
// button; zero balance opens the waitlist sheet (never a dead-end); originals
// stay server-side — everything pre-selection renders watermarked previews.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ArrowLeft,
  BadgeCheck,
  Camera,
  Coins,
  Images,
  Loader2,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { Button } from '@alphawolf/ui/components/ui/button';
import { Card } from '@alphawolf/ui/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@alphawolf/ui/components/ui/dialog';
import { capture } from '@/lib/analytics';
import { ITERATION_CHIPS } from '@/lib/ai/orchestrator/chips';
import {
  advanceGenerationAction,
  getGenerationContextAction,
  startIterationAction,
  startFinalAction,
  type GenerationContextResult,
} from '@/lib/actions/generation';
import { finalizeFinalRunAction } from '@/lib/actions/generation-finalize';
import { addProjectPhotoAction } from '@/lib/actions/brief';
import { buildShowcaseAction } from '@/lib/actions/showcase';
import type { RunSnapshot } from '@/lib/ai/run-pipeline';
import {
  deriveConcepts,
  progressCopy,
  sortViewKeys,
  viewLabel,
  type ConceptCard,
} from '@/lib/generation/gallery';
import { useAssetUpload, PHOTO_MIME } from '../brief/useAssetUpload';
import { BeforeAfterSlider } from './BeforeAfterSlider';
import { GenerateButton } from './GenerateButton';
import { ShareForFeedback } from './ShareForFeedback';
import { WaitlistSheet } from './WaitlistSheet';

// Goal 21 brand accent for the on-photo + showcase chrome (cyan on black).
const BRAND_CYAN = '#00AEEF';

type GenerationContext = Extract<GenerationContextResult, { ok: true }>;

/**
 * Concept preview with a branded skeleton until the design image actually
 * decodes (Goal 15 D5 / D13-4 — the money shot must never flash blank). Keyed
 * by afterUrl at the call site, so switching views or landing a final re-arms
 * the skeleton until the new image paints.
 */
function ConceptMedia({
  beforeUrl,
  afterUrl,
  alt,
}: {
  beforeUrl: string | null;
  afterUrl: string;
  alt: string;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="relative min-h-32 overflow-hidden rounded-md">
      {!loaded ? (
        <div
          data-testid="concept-skeleton"
          className="absolute inset-0 z-10 animate-pulse bg-gradient-to-br from-zinc-100 via-white to-cyan-50"
          aria-hidden
        />
      ) : null}
      <BeforeAfterSlider
        beforeUrl={beforeUrl}
        afterUrl={afterUrl}
        alt={alt}
        onAfterLoad={() => setLoaded(true)}
      />
    </div>
  );
}

const POLL_MS = 2500;

interface Props {
  projectId: string;
  vehicleLabel: string;
  /** ?run= handoff from the Generate button (fresh run to poll immediately). */
  initialRunId: string | null;
  /** view → public stock template render URL (the before image). */
  stockViews: Record<string, string>;
  initialContext: GenerationContext;
  /**
   * Goal 21 T7: the first uploaded vehicle photo (signed URL), if the brief
   * already has one. Seeds the in-studio uploader's "current photo" state.
   */
  initialPhoto: { assetId: string; url: string } | null;
}

export function GenerationStudio({
  projectId,
  vehicleLabel,
  initialRunId,
  stockViews,
  initialContext,
  initialPhoto,
}: Props) {
  const [ctx, setCtx] = useState<GenerationContext>(initialContext);
  const [activeRunId, setActiveRunId] = useState<string | null>(
    initialRunId ?? initialContext.activeRunId,
  );
  const [snapshot, setSnapshot] = useState<RunSnapshot | null>(null);
  const [pendingConceptKey, setPendingConceptKey] = useState<string | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [confirmConcept, setConfirmConcept] = useState<ConceptCard | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  // Goal 21 T7: in-studio vehicle photo (optional). Seeded from the brief, can
  // be added/replaced here so a customer who skipped the brief photo step still
  // gets the on-photo render path.
  const [photo, setPhoto] = useState<{ assetId: string; url: string } | null>(initialPhoto);
  const { phase: photoPhase, upload: uploadPhoto } = useAssetUpload(projectId);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  // Goal 21 T7: the multi-view marketing showcase modal.
  const [showcaseConcept, setShowcaseConcept] = useState<ConceptCard | null>(null);
  const [showcaseState, setShowcaseState] = useState<
    | { status: 'loading' }
    | { status: 'ready'; url: string }
    | { status: 'error'; message: string }
    | null
  >(null);
  // photo_concept_viewed fires once per concept that surfaces an on-photo render.
  const photoViewedRef = useRef<Set<string>>(new Set());
  // Final runs whose editor/export handoff already ran (or is running) this
  // session — the sweep effect below retries on failure and on every visit.
  const finalizedRef = useRef<Set<string>>(new Set());
  // Runs this session actually WATCHED in a non-terminal state — money/result
  // toasts fire only for those, so revisiting a stale ?run= URL of a long-
  // finished run never re-announces a refund or a fresh final.
  const watchedRunsRef = useRef<Set<string>>(new Set());
  // First-seen preview URL per (run, concept, view): every poll snapshot
  // mints FRESH signed URLs, and a changing src would re-download the same
  // preview on every 2.5s tick.
  const livePreviewUrlsRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    capture('generation_viewed', { projectId });
  }, [projectId]);

  // The Generate button can land here via a SAME-ROUTE push (?run=… from the
  // studio's own empty state) — the component instance survives, so useState's
  // initializer never re-reads the prop. Arm the poll whenever it changes.
  useEffect(() => {
    if (initialRunId) setActiveRunId(initialRunId);
  }, [initialRunId]);

  const refreshContext = useCallback(async () => {
    try {
      const res = await getGenerationContextAction(projectId);
      if (res.ok) setCtx(res);
    } catch {
      // Next poll/action refreshes again — never break the page over a read.
    }
  }, [projectId]);

  // THE POLL. One advance slice per tick; in-flight guard so a slow slice
  // never stacks calls; stops on terminal status.
  useEffect(() => {
    if (!activeRunId) return;
    let stopped = false;
    let inFlight = false;

    const tick = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const res = await advanceGenerationAction(activeRunId);
        if (stopped) return;
        if (!res.ok) {
          setActiveRunId(null);
          setPendingConceptKey(null);
          return;
        }
        setSnapshot(res.run);
        if (res.run.status !== 'complete' && res.run.status !== 'failed') {
          watchedRunsRef.current.add(res.run.runId);
        } else {
          setActiveRunId(null);
          setPendingConceptKey(null);
          // Toasts only for runs we watched happen — a stale ?run= URL whose
          // run finished long ago must not re-announce results on revisit.
          const watched = watchedRunsRef.current.has(res.run.runId);
          if (res.run.status === 'failed' && watched) {
            toast.error(
              "That run didn't work out. Your credit is back in your balance — try again.",
            );
          } else if (res.run.status === 'complete' && res.run.kind === 'final') {
            // Handoff BEFORE the gallery flips to "Final": when the badge and
            // "Open in editor" appear, the locked layers are already in the
            // working document. The sweep effect below is the retry/repair
            // path for crashes and revisits.
            if (!finalizedRef.current.has(res.run.runId)) {
              finalizedRef.current.add(res.run.runId);
              try {
                const fin = await finalizeFinalRunAction(projectId, res.run.runId);
                if (!fin.ok) finalizedRef.current.delete(res.run.runId);
              } catch {
                finalizedRef.current.delete(res.run.runId); // sweep retries
              }
            }
            if (watched) {
              toast.success('Final design ready! It’s in your editor and on your spec pack cover.');
            }
          }
          await refreshContext();
          if (res.run.status === 'complete') setSnapshot(null);
        }
      } catch {
        // Transient — the next tick retries.
      } finally {
        inFlight = false;
      }
    };

    void tick();
    const id = setInterval(() => void tick(), POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [activeRunId, projectId, refreshContext]);

  const concepts = useMemo(() => deriveConcepts(ctx.runs), [ctx.runs]);

  // Editor/export handoff sweep (D6): every complete FINAL run gets its
  // (idempotent, server-side) finalize call — on live completion AND on every
  // later visit, so a crash or closed tab mid-handoff is repaired the next
  // time the customer opens the studio. Silent: the result toast belongs to
  // the watched completion above.
  useEffect(() => {
    for (const c of concepts) {
      const runId = c.finalRunId;
      if (!runId || finalizedRef.current.has(runId)) continue;
      finalizedRef.current.add(runId); // claims it; released on failure
      void (async () => {
        try {
          const fin = await finalizeFinalRunAction(projectId, runId);
          if (!fin.ok) finalizedRef.current.delete(runId);
        } catch {
          finalizedRef.current.delete(runId); // next refresh/visit retries
        }
      })();
    }
  }, [concepts, projectId]);

  const views = useMemo(() => {
    const keys = new Set<string>(Object.keys(stockViews));
    for (const c of concepts) {
      for (const v of Object.keys(c.views)) keys.add(v);
      for (const v of Object.keys(c.finalViews ?? {})) keys.add(v);
    }
    return sortViewKeys([...keys]);
  }, [stockViews, concepts]);
  const [selectedView, setSelectedView] = useState<string | null>(null);
  const view = selectedView && views.includes(selectedView) ? selectedView : (views[0] ?? null);

  const runBusy = Boolean(activeRunId);

  /** Stable preview URL for the live grid (see livePreviewUrlsRef). */
  const stableLiveUrl = (runId: string, conceptKey: string, viewKey: string, url: string) => {
    const key = `${runId}:${conceptKey}:${viewKey}`;
    const cached = livePreviewUrlsRef.current.get(key);
    if (cached) return cached;
    livePreviewUrlsRef.current.set(key, url);
    return url;
  };

  const startIteration = useCallback(
    async (concept: ConceptCard) => {
      const instruction = (drafts[concept.key] ?? '').trim();
      if (!instruction) {
        toast.message('Tell us what to change — tap a quick tweak or type your own.');
        return;
      }
      if (ctx.balance <= 0) {
        setWaitlistOpen(true);
        return;
      }
      try {
        const res = await startIterationAction(
          projectId,
          concept.latestRunId,
          concept.key,
          instruction,
          crypto.randomUUID(),
        );
        if (res.ok) {
          setPendingConceptKey(concept.key);
          setSnapshot(null);
          setActiveRunId(res.runId);
          setDrafts((d) => ({ ...d, [concept.key]: '' }));
          void refreshContext();
        } else if (res.code === 'insufficient_credits') {
          setWaitlistOpen(true);
        } else {
          toast.error(res.message);
        }
      } catch {
        toast.error('Something went wrong on our end. Nothing was charged — try again.');
      }
    },
    [drafts, ctx.balance, projectId, refreshContext],
  );

  const startFinal = useCallback(async () => {
    const concept = confirmConcept;
    if (!concept) return;
    setConfirmBusy(true);
    try {
      capture('concept_selected', { projectId, conceptKey: concept.key });
      const res = await startFinalAction(
        projectId,
        concept.latestRunId,
        concept.key,
        crypto.randomUUID(),
      );
      if (res.ok) {
        setPendingConceptKey(concept.key);
        setSnapshot(null);
        setActiveRunId(res.runId);
        setConfirmConcept(null);
      } else if (res.code === 'final_exists') {
        toast.message('This concept already has its final artwork.');
        setConfirmConcept(null);
        void refreshContext();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error('Something went wrong on our end. Nothing was charged — try again.');
    } finally {
      setConfirmBusy(false);
    }
  }, [confirmConcept, projectId, refreshContext]);

  // Goal 21 T7: add (or replace) the vehicle photo from the studio. Persists to
  // the brief so the next run's orchestrator fans out the on-photo jobs.
  const addPhoto = useCallback(
    async (file: File) => {
      const result = await uploadPhoto(file, PHOTO_MIME);
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      const { view } = result.asset;
      const res = await addProjectPhotoAction({ projectId, assetId: view.assetId });
      if (!res.ok) {
        toast.error(
          res.reason === 'full'
            ? 'You already have the maximum number of photos.'
            : "We couldn't save that photo. Try again.",
        );
        return;
      }
      if (view.url) setPhoto({ assetId: view.assetId, url: view.url });
      toast.success("Photo saved. Your next design run will also render on your vehicle's photo.");
    },
    [uploadPhoto, projectId],
  );

  // Goal 21 T7: open the on-brand multi-view showcase for a concept.
  const openShowcase = useCallback(
    async (card: ConceptCard) => {
      setShowcaseConcept(card);
      setShowcaseState({ status: 'loading' });
      capture('showcase_opened', { projectId, conceptKey: card.key });
      try {
        const runId = card.finalRunId ?? card.latestRunId;
        const res = await buildShowcaseAction(projectId, runId, card.key);
        if (res.ok) {
          setShowcaseState({ status: 'ready', url: res.url });
        } else {
          setShowcaseState({
            status: 'error',
            message:
              res.code === 'not_ready'
                ? "Your showcase isn't ready yet. Pick a final, then try again."
                : "We couldn't build your showcase just now. Try again in a moment.",
          });
        }
      } catch {
        setShowcaseState({
          status: 'error',
          message: "We couldn't build your showcase just now. Try again in a moment.",
        });
      }
    },
    [projectId],
  );

  // photo_concept_viewed: fire once per concept whose on-photo preview surfaces.
  useEffect(() => {
    for (const c of concepts) {
      if (!(c.finalPhotoView ?? c.photoView)) continue;
      if (photoViewedRef.current.has(c.key)) continue;
      photoViewedRef.current.add(c.key);
      capture('photo_concept_viewed', { projectId, conceptKey: c.key });
    }
  }, [concepts, projectId]);

  const photoBusy = photoPhase !== 'idle';

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-16" data-testid="generation-studio">
      {/* Credit balance header — ALWAYS visible (PRD §5 hard rule). */}
      <header className="sticky top-0 z-10 -mx-4 mb-6 border-b border-zinc-200 bg-zinc-50/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button asChild variant="ghost" size="sm">
              <Link href={`/projects/${projectId}/brief`}>
                <ArrowLeft className="size-4" aria-hidden /> Brief
              </Link>
            </Button>
            <div>
              <h1 className="text-lg font-semibold leading-tight">AI design studio</h1>
              <p className="text-xs text-zinc-500">{vehicleLabel}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              data-testid="credit-balance"
              className="flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1 text-sm font-medium"
            >
              <Coins className="size-4 text-amber-500" aria-hidden />
              {ctx.balance} credit{ctx.balance === 1 ? '' : 's'}
            </span>
            <span className="hidden text-xs text-zinc-500 sm:block">
              {ctx.runsThisMonth} of {ctx.monthlyRunLimit} design runs used this month
            </span>
            <Button asChild variant="outline" size="sm">
              <Link href={`/projects/${projectId}/editor`}>Open editor</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Active-run progress. */}
      {runBusy ? (
        <section
          data-testid="run-progress"
          className="mb-6 flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-4"
          aria-live="polite"
        >
          <Loader2 className="size-5 shrink-0 animate-spin text-zinc-500" aria-hidden />
          <div>
            <p className="text-sm font-medium">
              {snapshot ? progressCopy(snapshot) : 'Warming up…'}
            </p>
            <p className="text-xs text-zinc-500">
              You can leave this page — your run keeps its place and your work is saved.
            </p>
          </div>
        </section>
      ) : null}

      {/* Live first-run preview: direction titles + thumbnails as they land. */}
      {runBusy && snapshot?.kind === 'initial' && snapshot.directions?.length ? (
        <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {snapshot.directions.map((d) => {
            // Template renders only: the on-photo preview has its own captioned
            // figure on the concept card, never an uncaptioned live thumbnail.
            const imgs = (snapshot.images ?? []).filter(
              (i) => i.conceptKey === d.key && i.renderTarget !== 'photo' && i.view !== 'photo',
            );
            const first = imgs[0];
            return (
              <div key={d.key} className="rounded-xl border border-zinc-200 bg-white p-3">
                <p className="text-sm font-medium">{d.title}</p>
                <p className="mb-2 text-xs text-zinc-500">{d.summary}</p>
                {first ? (
                  <img
                    src={stableLiveUrl(snapshot.runId, d.key, first.view, first.previewUrl)}
                    alt={`${d.title}, first preview`}
                    className="w-full rounded-md"
                  />
                ) : (
                  <div className="flex h-28 animate-pulse items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-500">
                    Painting…
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ) : null}

      {concepts.length === 0 && !runBusy ? (
        <section className="flex flex-col items-center gap-4 rounded-xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
          <Wand2 className="size-8 text-zinc-500" aria-hidden />
          <div>
            <h2 className="text-lg font-medium">No designs yet</h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
              Generate three different takes on your brief — pick your favorite, tweak it with quick
              refinements, then lock in a full-quality final for free.
            </p>
          </div>
          <GenerateButton projectId={projectId} creditBalance={ctx.balance} />

          {/* Goal 21 T7: optional vehicle-photo uploader. With a photo, each
              concept also renders ON the customer's vehicle. Without one, the
              template-only flow is unchanged. */}
          <div
            data-testid="studio-photo-uploader"
            className="mt-2 w-full max-w-md rounded-lg border border-zinc-200 bg-zinc-50 p-4 text-left"
          >
            <input
              ref={photoInputRef}
              data-testid="studio-photo-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/heic,image/heif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) void addPhoto(file);
              }}
            />
            <div className="flex items-start gap-3">
              {photo ? (
                <img
                  src={photo.url}
                  alt="Your vehicle"
                  className="size-16 shrink-0 rounded object-cover"
                />
              ) : (
                <span
                  className="flex size-16 shrink-0 items-center justify-center rounded bg-zinc-200 text-zinc-500"
                  aria-hidden
                >
                  <Camera className="size-6" />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {photo ? 'Photo added' : 'See it on your actual vehicle (optional)'}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {photo
                    ? "We'll also render each concept on your vehicle's photo, a preview only, not the print file."
                    : 'Add one photo of your vehicle and each concept also renders on it. Skip this for the template-only flow.'}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-2 gap-2"
                  disabled={photoBusy}
                  onClick={() => photoInputRef.current?.click()}
                  data-testid="studio-photo-add"
                >
                  {photoBusy ? (
                    <>
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      {photoPhase === 'uploading' ? 'Uploading…' : 'Processing…'}
                    </>
                  ) : (
                    <>
                      <Camera className="size-4" aria-hidden />
                      {photo ? 'Replace photo' : 'Add a photo'}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          <Link
            href={`/projects/${projectId}/brief`}
            className="text-xs text-zinc-500 underline underline-offset-2"
          >
            Review your brief first
          </Link>
        </section>
      ) : null}

      {concepts.length > 0 ? (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-medium">Your three directions</h2>
            {views.length > 1 ? (
              <nav aria-label="Vehicle view" className="flex flex-wrap gap-1">
                {views.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setSelectedView(v)}
                    aria-pressed={v === view}
                    data-testid={`view-tab-${v}`}
                    className={
                      'rounded-full px-3 py-1 text-xs transition-colors ' +
                      (v === view
                        ? 'bg-zinc-900 text-white'
                        : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200')
                    }
                  >
                    {viewLabel(v)}
                  </button>
                ))}
              </nav>
            ) : null}
          </div>

          <p className="mb-4 text-xs text-zinc-500">
            Drag any preview to compare with the blank vehicle. Previews stay watermarked until you
            pick a final.
          </p>
          <div className="mb-4">
            <ShareForFeedback projectId={projectId} />
          </div>

          <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {concepts.map((card) => {
              // D5: show the selected view if it has rendered, else the FIRST
              // rendered view (canonical order), so a settled card is never
              // blank during the per-view paint gap (D13-4 — the money shot).
              const shownView =
                (view && (card.finalViews?.[view] ?? card.views[view]) ? view : undefined) ??
                views.find((v) => card.finalViews?.[v] ?? card.views[v]);
              const finalUrl = shownView ? (card.finalViews?.[shownView] ?? null) : null;
              const previewUrl = shownView ? (card.views[shownView] ?? null) : null;
              const mediaUrl = finalUrl ?? previewUrl;
              const beforeUrl = shownView ? (stockViews[shownView] ?? null) : null;
              const busyHere = runBusy && pendingConceptKey === card.key;
              return (
                <Card
                  key={card.key}
                  data-testid={`concept-card-${card.key}`}
                  aria-current={card.finalViews ? 'true' : undefined}
                  className={
                    'flex flex-col gap-3 p-4 transition-all duration-200 ' +
                    // D6: the SELECTED/final concept is distinctly more prominent
                    // (brand-cyan ring + lift); the others animate on hover.
                    (card.finalViews
                      ? 'border-[#35B6E8] shadow-lg shadow-cyan-100 ring-2 ring-[#35B6E8]/60 -translate-y-0.5'
                      : 'hover:-translate-y-0.5 hover:shadow-md')
                  }
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="text-sm font-semibold">{card.title}</h3>
                      <p className="text-xs text-zinc-500">{card.summary}</p>
                    </div>
                    {card.finalViews ? (
                      <span
                        data-testid={`final-badge-${card.key}`}
                        className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-800"
                      >
                        <BadgeCheck className="size-3.5" aria-hidden /> Final
                      </span>
                    ) : null}
                  </div>

                  {mediaUrl ? (
                    <>
                      <ConceptMedia
                        key={mediaUrl}
                        beforeUrl={beforeUrl}
                        afterUrl={mediaUrl}
                        alt={`${card.title} — ${shownView ? viewLabel(shownView) : 'preview'}`}
                      />
                      {finalUrl ? (
                        <p className="text-[11px] text-zinc-500">
                          Full-quality final — no watermark.
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <div
                      className={
                        'flex h-32 items-center justify-center rounded-md bg-zinc-100 text-xs text-zinc-500' +
                        (busyHere ? ' animate-pulse' : '')
                      }
                    >
                      {busyHere ? 'Painting this view…' : "This view hasn't been rendered yet."}
                    </div>
                  )}

                  {/* Goal 21 T7: on-photo concept preview (the design applied to
                      the customer's vehicle photo). A final un-watermarked render
                      wins over the watermarked initial preview. Marketing only. */}
                  {(() => {
                    const rawPhotoUrl = card.finalPhotoView ?? card.photoView;
                    if (!rawPhotoUrl) return null;
                    const photoUrl = stableLiveUrl(
                      card.finalRunId ?? card.latestRunId,
                      card.key,
                      'photo',
                      rawPhotoUrl,
                    );
                    return (
                      <figure
                        data-testid={`photo-concept-${card.key}`}
                        className="overflow-hidden rounded-md border border-zinc-200"
                      >
                        <div className="flex items-center gap-1.5 bg-black px-2 py-1">
                          <Camera className="size-3" style={{ color: BRAND_CYAN }} aria-hidden />
                          <span className="text-[10px] font-medium uppercase tracking-wide text-white">
                            On your vehicle
                          </span>
                        </div>
                        {/* Signed URL: next/image's optimizer can't fetch it. */}
                        <img
                          src={photoUrl}
                          alt={`${card.title} rendered on your vehicle (concept preview)`}
                          className="block w-full"
                          draggable={false}
                        />
                        <figcaption className="px-2 py-1 text-[11px] text-zinc-500">
                          Concept preview, not the print file.
                        </figcaption>
                      </figure>
                    );
                  })()}

                  {/* Goal 21 T7: multi-view marketing showcase. Available once a
                      concept has a final (or is selected). */}
                  {card.finalViews ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 border-[#00AEEF] text-[#00AEEF] hover:bg-[#00AEEF]/10 hover:text-[#00AEEF]"
                      onClick={() => void openShowcase(card)}
                      data-testid={`showcase-open-${card.key}`}
                    >
                      <Images className="size-3.5" aria-hidden />
                      See it across your vehicle
                    </Button>
                  ) : null}

                  {busyHere && snapshot ? (
                    <p className="flex items-center gap-2 text-xs text-zinc-500" aria-live="polite">
                      <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      {progressCopy(snapshot)}
                    </p>
                  ) : null}

                  {card.finalViews ? (
                    <div className="mt-auto flex flex-col gap-2">
                      <Button asChild data-testid={`open-editor-${card.key}`}>
                        <Link href={`/projects/${projectId}/editor`}>Open in editor</Link>
                      </Button>
                      <Button asChild variant="outline">
                        <a href={`/projects/${projectId}/export`}>Download spec pack (PDF)</a>
                      </Button>
                      <Link
                        href="/find-a-shop"
                        data-testid="find-a-shop-link"
                        className="text-center text-xs text-zinc-500 underline underline-offset-2 hover:text-zinc-700"
                      >
                        No shop? Find one near you →
                      </Link>
                    </div>
                  ) : (
                    <div className="mt-auto flex flex-col gap-2">
                      <div className="flex flex-wrap gap-1.5">
                        {ITERATION_CHIPS.map((chip, i) => (
                          <button
                            key={chip.label}
                            type="button"
                            data-testid={`iteration-chip-${card.key}-${i}`}
                            onClick={() =>
                              setDrafts((d) => ({ ...d, [card.key]: chip.instruction }))
                            }
                            className={
                              'rounded-full border px-2.5 py-1 text-[11px] transition-colors ' +
                              ((drafts[card.key] ?? '') === chip.instruction
                                ? 'border-zinc-900 bg-zinc-900 text-white'
                                : 'border-zinc-200 text-zinc-600 hover:border-zinc-400')
                            }
                          >
                            {chip.label}
                          </button>
                        ))}
                      </div>
                      <textarea
                        rows={2}
                        maxLength={500}
                        placeholder="Or tell us in your own words…"
                        value={drafts[card.key] ?? ''}
                        onChange={(e) => setDrafts((d) => ({ ...d, [card.key]: e.target.value }))}
                        data-testid={`refine-input-${card.key}`}
                        className="w-full rounded-md border border-zinc-200 p-2 text-xs focus:outline-none focus:ring-2 focus:ring-zinc-400"
                      />
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1"
                          disabled={runBusy}
                          onClick={() => void startIteration(card)}
                          data-testid={`refine-submit-${card.key}`}
                        >
                          <Sparkles className="size-3.5" aria-hidden />
                          Refine — uses 1 credit
                        </Button>
                        <Button
                          size="sm"
                          className="flex-1"
                          disabled={runBusy}
                          onClick={() => setConfirmConcept(card)}
                          data-testid={`use-design-${card.key}`}
                        >
                          Use this design
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </section>
        </>
      ) : null}

      {/* Selection → final confirm. */}
      <Dialog
        open={confirmConcept !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmConcept(null);
        }}
      >
        <DialogContent data-testid="final-confirm">
          <DialogHeader>
            <DialogTitle>
              Lock in {confirmConcept ? `“${confirmConcept.title}”` : 'this design'}?
            </DialogTitle>
            <DialogDescription>
              We&apos;ll render your chosen design at full quality — included free. Your logo gets
              placed exactly as you uploaded it, never redrawn by AI. The final lands in your editor
              and on your spec pack.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setConfirmConcept(null)} disabled={confirmBusy}>
              Not yet
            </Button>
            <Button
              onClick={() => void startFinal()}
              disabled={confirmBusy}
              data-testid="confirm-final"
            >
              {confirmBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
              Render final design — free
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Goal 21 T7: multi-view marketing showcase modal. */}
      <Dialog
        open={showcaseConcept !== null}
        onOpenChange={(open) => {
          if (!open) {
            setShowcaseConcept(null);
            setShowcaseState(null);
          }
        }}
      >
        <DialogContent data-testid="showcase-modal" className="max-w-2xl border-2 border-[#00AEEF]">
          <DialogHeader>
            <DialogTitle>
              {showcaseConcept ? `“${showcaseConcept.title}” across your vehicle` : 'Your showcase'}
            </DialogTitle>
            <DialogDescription>
              A marketing preview of this design across your vehicle. It is not the print
              deliverable, your spec pack stays the source of truth for production.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md bg-black p-3">
            {showcaseState?.status === 'loading' ? (
              <div
                className="flex h-64 items-center justify-center gap-2 text-sm text-white"
                aria-live="polite"
              >
                <Loader2
                  className="size-5 animate-spin"
                  style={{ color: BRAND_CYAN }}
                  aria-hidden
                />
                Building your showcase…
              </div>
            ) : showcaseState?.status === 'ready' ? (
              /* Signed URL: next/image's optimizer can't fetch it. */
              <img
                src={showcaseState.url}
                alt={
                  showcaseConcept
                    ? `Marketing showcase of “${showcaseConcept.title}” across multiple vehicle views`
                    : 'Marketing showcase across multiple vehicle views'
                }
                className="block w-full rounded"
                draggable={false}
                data-testid="showcase-image"
              />
            ) : showcaseState?.status === 'error' ? (
              <p
                className="flex h-32 items-center justify-center px-4 text-center text-sm text-white"
                data-testid="showcase-error"
                aria-live="polite"
              >
                {showcaseState.message}
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      <WaitlistSheet projectId={projectId} open={waitlistOpen} onOpenChange={setWaitlistOpen} />
    </div>
  );
}
