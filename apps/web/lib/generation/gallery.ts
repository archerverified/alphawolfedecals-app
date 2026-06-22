// Pure derivation helpers for the generation studio (Goal 7 D5). Client-safe:
// no server imports — the studio component and its unit tests both consume
// these. The shapes mirror GenerationRunSummary (lib/actions/generation.ts)
// and RunSnapshot (lib/ai/run-pipeline.ts) without importing server modules.

// Mirrors VIEW_ORDER (packages/db svg/numbering.ts — THE canonical order).
// Duplicated here because this module ships in the CLIENT bundle and must not
// import @alphawolf/db; keep in sync when a view is ever added.
export const VIEW_LABELS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'front', label: 'Front' },
  { key: 'driver', label: 'Driver side' },
  { key: 'back', label: 'Back' },
  { key: 'passenger', label: 'Passenger side' },
  { key: 'top', label: 'Top' },
];

// Sentinel for on-photo renders (mirrors PHOTO_VIEW in @alphawolf/db). Kept as
// a local literal because this module ships client-side and must not import the
// db package. Photo renders are routed to photoView/finalPhotoView, never into
// the 4-view switcher set.
export const PHOTO_VIEW = 'photo';

export function viewLabel(view: string): string {
  return VIEW_LABELS.find((v) => v.key === view)?.label ?? view;
}

export function sortViewKeys(views: string[]): string[] {
  const order = VIEW_LABELS.map((v) => v.key);
  return [...views].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? order.length : ia) - (ib === -1 ? order.length : ib);
  });
}

// --- gallery derivation ------------------------------------------------------

export type GalleryRun = {
  runId: string;
  kind: 'initial' | 'iteration' | 'final';
  status: 'queued' | 'orchestrating' | 'rendering' | 'complete' | 'failed';
  conceptKey: string | null;
  createdAt: string; // ISO
  directions: Array<{ key: string; title: string; summary: string }>;
  images: Array<{
    conceptKey: string;
    view: string;
    previewUrl: string;
    // Goal 21 T7: 'photo' = an on-vehicle marketing render (view='photo'),
    // routed away from the 4-view switcher. Optional so older snapshots and
    // tests that omit it default to template behavior.
    renderTarget?: 'template' | 'photo';
  }>;
};

export type ConceptCard = {
  key: string;
  title: string;
  summary: string;
  /**
   * The run the NEXT iteration/final should parent on: the newest COMPLETE
   * run whose directions still carry this concept (its prompt map is the
   * concept's current state — see run-pipeline orchestrateSlice).
   */
  latestRunId: string;
  /** view → watermarked preview URL, newest refinement wins per view. */
  views: Record<string, string>;
  /** view → un-watermarked FINAL render URL (null until a final completes). */
  finalViews: Record<string, string> | null;
  finalRunId: string | null;
  /**
   * Goal 21 T7: watermarked on-photo concept preview (the design applied to the
   * customer's uploaded vehicle photo), from the INITIAL run. null when the
   * customer uploaded no photo. This is a marketing preview, never the print
   * file, and is kept OUT of `views` so the view switcher never shows 'photo'.
   */
  photoView: string | null;
  /** Un-watermarked on-photo render from a FINAL run (null until one exists). */
  finalPhotoView: string | null;
};

/**
 * Fold the project's run history (newest-first, as the context action returns
 * it) into the 3 concept cards. Anchors on the newest COMPLETE initial run;
 * later complete iteration runs override their affected views; a complete
 * final run attaches its un-watermarked renders.
 */
export function deriveConcepts(runs: GalleryRun[]): ConceptCard[] {
  const initial = runs.find((r) => r.kind === 'initial' && r.status === 'complete');
  if (!initial) return [];

  const anchorTime = Date.parse(initial.createdAt);
  // Oldest → newest so later refinements override earlier ones per view.
  const laterChrono = [...runs]
    .filter((r) => r.status === 'complete' && Date.parse(r.createdAt) >= anchorTime)
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));

  return initial.directions.map((d) => {
    const card: ConceptCard = {
      key: d.key,
      title: d.title,
      summary: d.summary,
      latestRunId: initial.runId,
      views: {},
      finalViews: null,
      finalRunId: null,
      photoView: null,
      finalPhotoView: null,
    };
    for (const img of initial.images) {
      if (img.conceptKey !== d.key) continue;
      // Photo renders never enter `views` (the 4-view switcher set); they get
      // their own marketing surface. Identify by renderTarget, with view as a
      // defensive fallback for snapshots that predate the discriminator.
      if (isPhotoImage(img)) card.photoView = img.previewUrl;
      else card.views[img.view] = img.previewUrl;
    }
    for (const run of laterChrono) {
      if (run.conceptKey !== d.key) continue;
      if (run.kind === 'iteration') {
        for (const img of run.images) {
          if (isPhotoImage(img)) continue; // iteration never re-renders the photo
          card.views[img.view] = img.previewUrl;
        }
        card.latestRunId = run.runId;
        const title = run.directions[0]?.title;
        if (title) card.title = title;
      } else if (run.kind === 'final') {
        card.finalViews = {};
        for (const img of run.images) {
          if (isPhotoImage(img)) card.finalPhotoView = img.previewUrl;
          else card.finalViews[img.view] = img.previewUrl;
        }
        card.finalRunId = run.runId;
      }
    }
    return card;
  });
}

function isPhotoImage(img: GalleryRun['images'][number]): boolean {
  return img.renderTarget === 'photo' || img.view === PHOTO_VIEW;
}

// --- progress copy -----------------------------------------------------------

export type ProgressSnapshot = {
  kind: 'initial' | 'iteration' | 'final';
  status: 'queued' | 'orchestrating' | 'rendering' | 'complete' | 'failed';
  // 'submitting' = claimed-but-not-yet-submitted (PR #150 F2 claim step);
  // progress copy treats it like any other in-flight state.
  jobs: Array<{ status: 'pending' | 'submitting' | 'submitted' | 'complete' | 'failed' }>;
};

/** Friendly, customer-voice progress line for the active run. */
export function progressCopy(snap: ProgressSnapshot): string {
  if (snap.status === 'queued' || snap.status === 'orchestrating') {
    if (snap.kind === 'initial') return 'Sketching your three directions…';
    if (snap.kind === 'iteration') return 'Working out your tweak…';
    return 'Preparing your final design…';
  }
  if (snap.status === 'rendering') {
    // Jobs are per-(concept, view) units — an initial run has views × 3
    // concepts of them, so the copy says "renders", never "views".
    const total = snap.jobs.length;
    const done = snap.jobs.filter((j) => j.status === 'complete').length;
    const progress = total > 0 ? ` — ${done} of ${total} renders done` : '';
    if (snap.kind === 'initial') return `Painting your concepts${progress}…`;
    if (snap.kind === 'iteration') return `Repainting the views your tweak touches${progress}…`;
    return `Rendering at full quality${progress}…`;
  }
  if (snap.status === 'failed') {
    return "That run didn't work out. Your credit is back in your balance — try again.";
  }
  return 'Done!';
}
