// Generation-run ADVANCE SLICE executor (Goal 7 D5 core). The pipeline design
// review made the execution model binding: there is NO durable background
// worker — THE CLIENT POLL DRIVES THE PIPELINE. Each advanceRun() call does
// one bounded slice of work (well under the 60s hobby-plan function ceiling)
// and returns a snapshot; the client polls until the run is terminal; the
// sweeper cron fails + refunds anything that stalls past its deadline.
//
// Safety properties (all enforced by the generation repo's CAS primitives):
//  - Idempotent + re-entrant: every status transition is compare-and-set, so
//    concurrent polls (two tabs, a retry racing a slow slice) never double-run
//    a stage.
//  - NEVER resubmits: claimJob (pending→submitting) gates provider.submit to
//    a single winner per job, and markJobSubmitted persists the provider
//    request id in the CAS submitting→submitted; a re-entered slice harvests
//    by the stored id (double-spend guard, design §B3 + review fix F2).
//  - Estimate-then-true-up: run cost is the conservative config estimate until
//    terminal; trueUpRunCost replaces it with job actuals + orchestrator spend.
//  - Failure → refund: a failed run refunds its credits via app_refund_credits
//    (idempotent by construction), with Sentry + PostHog so failures are LOUD.

import 'server-only';

import { createHash } from 'node:crypto';

import * as Sentry from '@sentry/nextjs';

import {
  AI_CONFIG,
  AI_MODELS,
  briefs,
  generation,
  projects,
  storage,
  vehicles,
  VIEW_ORDER,
  type AiModelKey,
  type GenerationJobRow,
  type GenerationJobStatus,
  type GenerationRunKind,
  type GenerationRunRow,
  type GenerationRunStatus,
} from '@alphawolf/db';

import { parseBriefData, type BriefData } from '../brief/schema';
import { captureServerEvent } from '../notifications/posthog-server';
import { buildGradientGuide, normalizeHex, type GuidePanel } from './gradient-guide';
import { compileBrief, compileIteration, type GradientDescriptor } from './orchestrator';
import { getImageProvider } from './provider';
import { watermarkPreview } from './watermark';

// How many jobs one rendering slice touches (submit OR harvest). 3 keeps a
// slice's worst case (3 × submit/fetch/watermark/2-uploads) ≈ 20-25s — inside
// the action budget with headroom.
const JOBS_PER_SLICE = 3;

// ---------------------------------------------------------------------------
// Snapshot — what the polling client sees. Prompts and original storage paths
// deliberately never leave the server (design §6).
// ---------------------------------------------------------------------------

export type SnapshotDirection = { key: string; title: string; summary: string };

export type RunSnapshot = {
  runId: string;
  status: GenerationRunStatus;
  kind: GenerationRunKind;
  error: string | null;
  directions?: SnapshotDirection[];
  jobs: Array<{ conceptKey: string; view: string; status: GenerationJobStatus }>;
  images?: Array<{ conceptKey: string; view: string; previewUrl: string }>;
};

// Directions JSONB persisted on the run row. Type alias (not interface) so it
// is assignable to Prisma's InputJsonValue.
export type RunDirectionsJson = {
  promptVersion: string;
  /** Orchestrator token spend — added to the job actuals at true-up. */
  orchestratorCostUsd: number;
  directions: Array<{
    key: string;
    title: string;
    summary: string;
    /** Goal 18: structured front→rear gradient for the deterministic guide.
     *  Optional so rows persisted before v5 still parse. */
    gradient?: GradientDescriptor;
    viewPrompts: Record<string, string>;
  }>;
};

// Defensive re-read of the JSONB we wrote: never trust round-tripped JSON shape.
export function parseRunDirections(value: unknown): RunDirectionsJson | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.promptVersion !== 'string' || !Array.isArray(v.directions)) return null;
  const directions: RunDirectionsJson['directions'] = [];
  for (const d of v.directions) {
    if (typeof d !== 'object' || d === null) return null;
    const dir = d as Record<string, unknown>;
    if (
      typeof dir.key !== 'string' ||
      typeof dir.title !== 'string' ||
      typeof dir.summary !== 'string' ||
      typeof dir.viewPrompts !== 'object' ||
      dir.viewPrompts === null
    ) {
      return null;
    }
    const viewPrompts: Record<string, string> = {};
    for (const [view, prompt] of Object.entries(dir.viewPrompts as Record<string, unknown>)) {
      if (typeof prompt !== 'string') return null;
      viewPrompts[view] = prompt;
    }
    // Goal 18: tolerate rows written before v5 (gradient absent) — a malformed
    // gradient is dropped, never fails the parse (the final then falls back).
    let gradient: GradientDescriptor | undefined;
    const g = dir.gradient as Record<string, unknown> | undefined;
    if (
      g &&
      typeof g.directional === 'boolean' &&
      typeof g.frontHex === 'string' &&
      typeof g.rearHex === 'string'
    ) {
      gradient = { directional: g.directional, frontHex: g.frontHex, rearHex: g.rearHex };
    }
    directions.push({
      key: dir.key,
      title: dir.title,
      summary: dir.summary,
      gradient,
      viewPrompts,
    });
  }
  const orchestratorCostUsd =
    typeof v.orchestratorCostUsd === 'number' && Number.isFinite(v.orchestratorCostUsd)
      ? Math.max(0, v.orchestratorCostUsd)
      : 0;
  return { promptVersion: v.promptVersion, orchestratorCostUsd, directions };
}

// ---------------------------------------------------------------------------
// View resolution (shared with the start actions for cost estimates).
// ---------------------------------------------------------------------------

export function sortViews(views: string[]): string[] {
  return [...views].sort((a, b) => {
    const ia = VIEW_ORDER.indexOf(a);
    const ib = VIEW_ORDER.indexOf(b);
    return (ia === -1 ? VIEW_ORDER.length : ia) - (ib === -1 ? VIEW_ORDER.length : ib);
  });
}

// Cross-view coherence (Goal 17 D2): a concept renders ONE canonical "anchor"
// view first; every other view is then conditioned on the anchor's render so all
// views share ONE base colour, gradient, and finish. Preference = a full-length
// SIDE (driver, the largest canvas that carries the whole front→rear design) →
// passenger → front → back → top; falls back to the first given view.
const ANCHOR_PREFERENCE = ['driver', 'passenger', 'front', 'back', 'top'] as const;

export function anchorViewFor(views: string[]): string {
  for (const pref of ANCHOR_PREFERENCE) {
    if (views.includes(pref)) return pref;
  }
  const [first] = views;
  if (first === undefined) throw new Error('anchorViewFor called with no views');
  return first;
}

/**
 * Render-time directive appended to a derived/final view's prompt so the image
 * model reproduces ONE shared design from a reference image (the concept's anchor
 * render for drafts; the customer-approved render for finals) instead of re-rolling
 * an independent colourway — the architectural fix for cross-view divergence
 * (Goal 17). Model-aware:
 *  - 'final' (flux-2-pro/edit — indexed @image1/@image2 reference editing): @image1
 *    is the structure, @image2 the approved design to reproduce at export quality.
 *  - draft/iteration (nano-banana — a fusion model that will freely change camera
 *    angle): pin THIS view's geometry hard, take ONLY the colour/gradient/finish.
 * Both forbid AI text/logos — the logo is composited separately, NEVER AI-rendered.
 */
export function coherenceDirective(kind: GenerationRunKind): string {
  if (kind === 'final') {
    return [
      'COHERENCE: @image1 is the clean structural render of THIS vehicle view; @image2 is the',
      "customer-APPROVED final wrap design. Reproduce @image2's EXACT base colour, gradient and its",
      "direction, accent graphics, and finish onto @image1's panels at premium export quality.",
      "Preserve @image1's geometry, camera angle, panel layout, and composition exactly — change only",
      'fidelity/resolution. Render NO text, letters, numbers, logos, emblems, or badges of any kind.',
    ].join(' ');
  }
  return [
    'COHERENCE: the reference image is the SAME wrap design on a different angle of this same vehicle.',
    'Adopt ONLY its base colour, its gradient and gradient direction, its accent colours, and its finish',
    'so every view reads as one cohesive design. Keep THIS view’s vehicle shape, camera angle, panel',
    'layout, and geometry EXACTLY as in the structural render — do NOT copy the reference’s camera angle',
    'or panel layout. Render NO text, letters, numbers, logos, emblems, or badges of any kind.',
  ].join(' ');
}

/**
 * Render-time directive for the FINAL stage when a deterministic gradient GUIDE
 * image is supplied (Goal 18). The image model ignores directional TEXT (proven
 * real-fal) but flux2_pro_edit reliably reproduces a conditioning image's
 * left-to-right colour layout, so the guide PINS the gradient direction the brief
 * asked for. Two shapes:
 *  - withApproved=true  → [@image1 structure, @image2 approved design, @image3 guide]:
 *      take the look from @image2 but the colour PLACEMENT from @image3 (guide wins
 *      any front/rear disagreement) — preserves the Goal-17 approved-draft fidelity.
 *  - withApproved=false → [@image1 structure, @image2 guide]: no approved donor, so
 *      the guide is the design + direction reference directly.
 */
export function gradientGuideDirective(withApproved: boolean): string {
  if (withApproved) {
    return [
      'DIRECTION LOCK: reproduce the SECOND image’s EXACT colours, accents, and gloss finish',
      '(the SECOND image is the authority on WHICH colours to use). The THIRD image is a',
      'left-to-right ORIENTATION map: it shows which END of the vehicle is the gradient’s dark/start',
      'end and which is the light/finish end. Orient the wrap’s gradient to match the THIRD image’s',
      'dark-to-light direction. If the SECOND image’s gradient runs the OPPOSITE direction, flip it',
      "to match the THIRD image while keeping the SECOND image's actual colours. Use the FIRST image",
      'only for vehicle shape, panels, camera angle. Keep windows, lights, wheels, and background',
      'unchanged. Render NO text, letters, numbers, logos, emblems, or badges of any kind.',
    ].join(' ');
  }
  return [
    'DIRECTION LOCK: the SECOND image is the required left-to-right COLOUR MAP for the wrap;',
    'paint the body so its colour at each horizontal position matches the second image exactly.',
    "Use the FIRST image only for the vehicle's shape, panels, camera angle, windows, wheels,",
    'and background. High-shine gloss finish. Render NO text, letters, numbers, logos, emblems,',
    'or badges of any kind.',
  ].join(' ');
}

type PanelLike = { id: string; view: string; name: string };

/**
 * The views a run renders: every view the template has panels for — narrowed,
 * on a partial wrap, to views containing at least one INCLUDED panel (no point
 * rendering a view the customer isn't wrapping).
 */
export function resolveRunViews(
  panels: PanelLike[],
  briefData: Pick<BriefData, 'zones'> | null,
): string[] {
  const included = briefData?.zones?.includedPanelIds;
  const eligible =
    included && included.length > 0 ? panels.filter((p) => included.includes(p.id)) : panels;
  return sortViews([...new Set(eligible.map((p) => p.view))]);
}

function panelsByView(panels: PanelLike[], views: string[]): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const view of views) {
    const names = panels.filter((p) => p.view === view).map((p) => p.name);
    if (names.length > 0) out[view] = names;
  }
  return out;
}

function logoZoneNames(panels: PanelLike[], briefData: BriefData | null): string[] {
  const ids = briefData?.logo?.zonePanelIds ?? [];
  if (ids.length === 0) return [];
  return panels.filter((p) => ids.includes(p.id)).map((p) => p.name);
}

// ---------------------------------------------------------------------------
// Provider-CDN byte fetch — same SSRF allowlist as the bake-off harness:
// data: URIs (the mock) and fal's own CDN hosts ONLY, never an arbitrary URL.
// ---------------------------------------------------------------------------

function extensionFor(contentType: string): string {
  if (contentType.includes('png')) return 'png';
  if (contentType.includes('webp')) return 'webp';
  return 'jpg';
}

async function fetchImageBytes(url: string): Promise<Buffer> {
  if (url.startsWith('data:')) {
    const comma = url.indexOf(',');
    if (comma === -1) throw new Error('malformed data URI');
    return Buffer.from(url.slice(comma + 1), 'base64');
  }
  const parsed = new URL(url);
  const allowedHost = /(^|\.)fal\.(media|ai|run)$/.test(parsed.hostname);
  if (parsed.protocol !== 'https:' || !allowedHost) {
    throw new Error('image URL outside the provider CDN allowlist');
  }
  // Bounded (review fix F4): a hung CDN read must never eat the slice's
  // whole function budget.
  const res = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`image fetch failed: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// Deterministic per-job seed so re-submission paths (which the resubmit guard
// prevents anyway) could never silently produce a different image.
function seedFor(jobId: string): number {
  return createHash('sha256').update(jobId).digest().readUInt32BE(0) % 2_147_483_647;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Submit-failure classification (review fix F2). A timeout/abort/network drop
// is AMBIGUOUS: the submission may exist provider-side even though no request
// id ever reached us. Releasing the claim would allow a re-submit — a
// possible double-spend — so ambiguous failures FAIL the job instead
// (conservative: the run's estimated cost still counts the maybe-spent
// dollars toward the daily cap until true-up). Only a definite rejection
// releases the claim for a retry.
function isAmbiguousSubmitError(error: unknown): boolean {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return true;
  }
  return /timeout|timed out|abort|socket|network|fetch failed|ECONNRESET|ETIMEDOUT|EAI_AGAIN/i.test(
    errorMessage(error),
  );
}

const NON_TERMINAL: readonly GenerationRunStatus[] = ['queued', 'orchestrating', 'rendering'];

// 'submitting' (the F2 claim state) is deliberately NON-terminal here: a job
// whose claiming slice crashed keeps the run open until the run deadline
// fails + refunds it (advanceRun's deadline check / the sweeper cron).
function isTerminalJob(j: GenerationJobRow): boolean {
  return j.status === 'complete' || j.status === 'failed';
}

// ---------------------------------------------------------------------------
// Loud failure: CAS to failed + refund (idempotent), Sentry, PostHog. Only the
// CAS winner reports — a concurrent slice that lost simply moves on.
// ---------------------------------------------------------------------------

async function failRunLoudly(userId: string, run: GenerationRunRow, error: string): Promise<void> {
  const result = await generation.failRun(userId, run.id, error.slice(0, 500));
  if (!result.failed) return; // already terminal — handled elsewhere
  Sentry.captureException(new Error(`[generation] run failed: ${error}`), {
    tags: { feature: 'ai-generation' },
    extra: { runId: run.id, projectId: run.projectId, kind: run.kind, refunded: result.refunded },
  });
  await captureServerEvent('generation_failed', userId, {
    runId: run.id,
    projectId: run.projectId,
    kind: run.kind,
    error: error.slice(0, 200),
    refunded: result.refunded,
  });
}

// ---------------------------------------------------------------------------
// Slice 1 — orchestration: queued → orchestrating → rendering.
// ---------------------------------------------------------------------------

async function orchestrateSlice(userId: string, run: GenerationRunRow): Promise<void> {
  let directionsJson: RunDirectionsJson;
  let jobs: Array<{ conceptKey: string; view: string; prompt: string }>;

  if (run.kind === 'initial') {
    const project = await projects.getProject(userId, run.projectId);
    if (!project) throw new Error('project not found');
    const vehicle = await vehicles.getPublishedDetail(project.vehicleId);
    if (!vehicle) throw new Error('vehicle template not found');
    const brief = await briefs.getBrief(userId, run.projectId);
    if (!brief) throw new Error('brief not found');
    const snapshot = await briefs.getBriefSnapshot(userId, brief.id, run.briefVersion);
    if (!snapshot) throw new Error(`brief snapshot v${run.briefVersion} not found`);
    const parsed = parseBriefData(snapshot.data);
    if (!parsed.ok) throw new Error('brief snapshot failed validation');
    const briefData = parsed.data;

    const views = resolveRunViews(vehicle.panels, briefData);
    if (views.length === 0) throw new Error('vehicle template has no renderable views');

    const result = await compileBrief({
      briefData,
      vehicle: {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        bodyType: vehicle.bodyType,
      },
      views,
      panelsByView: panelsByView(vehicle.panels, views),
      logoZones: logoZoneNames(vehicle.panels, briefData),
    });
    directionsJson = {
      promptVersion: result.promptVersion,
      orchestratorCostUsd: result.usage.estimatedUsd,
      directions: result.directions,
    };
    jobs = result.directions.flatMap((d) =>
      views.map((view) => ({ conceptKey: d.key, view, prompt: d.viewPrompts[view] ?? '' })),
    );
  } else {
    // iteration | final — both derive from the parent run's chosen concept.
    if (!run.parentRunId || !run.conceptKey) throw new Error('run is missing its lineage');
    const parent = await generation.getRun(userId, run.parentRunId);
    const parentDirections = parent ? parseRunDirections(parent.directions) : null;
    const concept = parentDirections?.directions.find((d) => d.key === run.conceptKey);
    if (!parent || !parentDirections || !concept) {
      throw new Error('parent run concept not found');
    }
    const views = sortViews(Object.keys(concept.viewPrompts));
    if (views.length === 0) throw new Error('parent concept has no views');

    if (run.kind === 'iteration') {
      if (!run.instruction) throw new Error('iteration run has no instruction');
      const result = await compileIteration({
        conceptSummary: concept.summary,
        viewPrompts: concept.viewPrompts,
        instruction: run.instruction,
        views,
      });
      directionsJson = {
        promptVersion: result.promptVersion,
        orchestratorCostUsd: result.usage.estimatedUsd,
        directions: [
          {
            key: concept.key,
            title: result.title,
            summary: concept.summary,
            // Carry the concept's gradient descriptor forward (Goal 18): an
            // iteration edits the look, not the front→rear direction.
            gradient: concept.gradient,
            // Carry the FULL prompt map forward (affected views updated) so a
            // later iteration/final on this run still covers every view.
            viewPrompts: {
              ...concept.viewPrompts,
              ...Object.fromEntries(result.affectedViews.map((v) => [v, result.editPrompt])),
            },
          },
        ],
      };
      // Iteration renders the AFFECTED views only (design: Kontext edit per
      // affected view, 1 credit).
      jobs = result.affectedViews.map((view) => ({
        conceptKey: concept.key,
        view,
        prompt: result.editPrompt,
      }));
    } else {
      // final: no orchestrator call — re-render the chosen concept's prompts
      // at export quality across all of its views.
      directionsJson = {
        promptVersion: parentDirections.promptVersion,
        orchestratorCostUsd: 0,
        directions: [concept],
      };
      jobs = views.map((view) => ({
        conceptKey: concept.key,
        view,
        prompt: concept.viewPrompts[view] ?? '',
      }));
    }
  }

  // recordJobs is idempotent (skipDuplicates on the (run, concept, view)
  // unique); the CAS to rendering persists the directions in the same update.
  await generation.recordJobs(userId, run.id, jobs);
  await generation.advanceStatus(userId, run.id, 'orchestrating', 'rendering', {
    directions: directionsJson,
  });
}

// ---------------------------------------------------------------------------
// Slice 2..n — rendering: submit / harvest up to JOBS_PER_SLICE jobs, then
// settle the run when every job is terminal.
// ---------------------------------------------------------------------------

async function harvestJob(
  userId: string,
  run: GenerationRunRow,
  job: GenerationJobRow,
  state: {
    images: Array<{ url: string; width: number; height: number; contentType: string }>;
    costUsd: number;
  },
  alreadyImaged: boolean,
): Promise<void> {
  if (!alreadyImaged) {
    const image = state.images[0];
    if (!image) {
      await generation.failJob(userId, job.id, 'provider returned no images');
      return;
    }
    const dims = run.kind === 'final' ? AI_CONFIG.finalImage : AI_CONFIG.draftImage;
    const bytes = await fetchImageBytes(image.url);
    const basePath = `generations/${run.projectId}/${run.id}/${job.conceptKey}-${job.view}`;
    const storagePath = `${basePath}.${extensionFor(image.contentType)}`;
    await storage.uploadAssetObject(storagePath, bytes, image.contentType);

    // Watermarked preview for draft/iteration concepts; FINAL renders are the
    // customer's paid-for artwork — no watermark, the preview IS the image.
    let previewPath = storagePath;
    if (run.kind !== 'final') {
      const preview = await watermarkPreview(bytes);
      previewPath = `${basePath}-preview.png`;
      await storage.uploadAssetObject(previewPath, preview, 'image/png');
    }

    const modelConfig = (AI_MODELS as Record<string, { id: string } | undefined>)[run.model];
    try {
      await generation.insertImage(userId, {
        runId: run.id,
        jobId: job.id,
        conceptKey: job.conceptKey,
        view: job.view,
        storagePath,
        previewPath,
        width: image.width || dims.width,
        height: image.height || dims.height,
        provider: run.provider,
        model: run.model,
        providerRequestId: job.providerRequestId ?? undefined,
        costUsd: state.costUsd,
        provenance: {
          provider: run.provider,
          model: modelConfig?.id ?? run.model,
          requestId: job.providerRequestId,
          promptVersion: parseRunDirections(run.directions)?.promptVersion ?? '',
          falRequestId: job.providerRequestId,
        },
      });
    } catch (error) {
      // Review fix F3: a concurrent harvest raced us past the listImages
      // read and the generation_images_job_once unique fired (P2002). The
      // image exists — converge to completion instead of throwing.
      if (!generation.uniqueViolationTarget(error)) throw error;
    }
  }
  await generation.completeJob(userId, job.id, { costUsd: state.costUsd });
}

// A coherence reference image (anchor / approved-draft donor) is fetched by the
// provider (fal) from a Supabase signed URL. The TTL must comfortably outlive the
// run deadline (RUN_TTL ≈ 15 min) so a slow poll never hands fal an expired URL.
const COHERENCE_URL_TTL_S = 3600;

// Final-stage conditioning donor: the customer-APPROVED render per view, resolved
// as the LATEST render for the chosen concept across the parent lineage
// (final → iteration* → draft). Closes the draft→final coherence gap — the export
// reproduces exactly what the customer approved instead of re-rolling from the
// template. Bounded walk (a draft run has no parent); first-seen wins (the
// closest parent is the most recently approved). Returns view → storagePath.
async function resolveApprovedDonors(
  userId: string,
  run: GenerationRunRow,
): Promise<Map<string, string>> {
  const donors = new Map<string, string>();
  if (!run.conceptKey) return donors;
  let cursor: string | null = run.parentRunId;
  for (let depth = 0; cursor && depth < 6; depth += 1) {
    const imgs = await generation.listImages(userId, cursor);
    for (const img of imgs) {
      if (img.conceptKey === run.conceptKey && !donors.has(img.view)) {
        donors.set(img.view, img.storagePath);
      }
    }
    const parent = await generation.getRun(userId, cursor);
    cursor = parent?.parentRunId ?? null;
  }
  return donors;
}

async function renderSlice(userId: string, run: GenerationRunRow): Promise<void> {
  const jobs = await generation.listJobs(userId, run.id);
  if (jobs.length === 0) {
    // Orchestration recorded zero jobs — structurally broken, refund.
    await failRunLoudly(userId, run, 'run has no render jobs');
    return;
  }

  const open = jobs.filter((j) => !isTerminalJob(j));
  if (open.length > 0) {
    if (!(run.model in AI_MODELS)) {
      await failRunLoudly(userId, run, `unknown model "${run.model}"`);
      return;
    }
    const modelKey = run.model as AiModelKey;
    const project = await projects.getProject(userId, run.projectId);
    if (!project) {
      await failRunLoudly(userId, run, 'project not found');
      return;
    }
    const provider = await getImageProvider();
    const dims = run.kind === 'final' ? AI_CONFIG.finalImage : AI_CONFIG.draftImage;
    const existingImages = await generation.listImages(userId, run.id);
    const imagedJobIds = new Set(existingImages.map((i) => i.jobId));

    // --- Cross-view coherence (Goal 17) --------------------------------------
    // Each concept renders ONE canonical anchor view first; every other DRAFT
    // view is then conditioned on that anchor's render so all views share one
    // base colour, gradient, and finish. FINAL views are instead conditioned on
    // the customer-APPROVED draft render (resolveApprovedDonors). Both keep their
    // OWN structure render at imageUrls[0] (per-view geometry → the editor handoff
    // + logo compositing are unaffected). NOTE: the deterministic mock ignores
    // imageUrls, so this is proven on REAL fal, not the mock.
    const runViews = [...new Set(jobs.map((j) => j.view))];
    const anchorView = anchorViewFor(runViews);
    // The anchor render per concept = the colour/style donor for derived draft views.
    const anchorImageByConcept = new Map<string, { storagePath: string }>();
    // A concept whose anchor JOB failed can never produce derived views.
    const failedAnchorConcepts = new Set<string>();
    if (run.kind === 'initial') {
      for (const img of existingImages) {
        if (img.view === anchorView) {
          anchorImageByConcept.set(img.conceptKey, { storagePath: img.storagePath });
        }
      }
      for (const j of jobs) {
        if (j.view === anchorView && j.status === 'failed') failedAnchorConcepts.add(j.conceptKey);
      }
    }
    const donorByView =
      run.kind === 'final' ? await resolveApprovedDonors(userId, run) : new Map<string, string>();

    // Cross-view DIRECTION (Goal 18): for a directional-gradient concept, the FINAL
    // export is conditioned on a deterministic per-view gradient GUIDE image whose
    // left-to-right colour layout flux2_pro_edit reproduces (the model ignores
    // directional TEXT — proven real-fal). Orientation comes from the template's
    // panel geometry. Resolved once per slice; null ⇒ keep the Goal-17 conditioning.
    let gradientGuide: {
      frontHex: string;
      rearHex: string;
      panelsByView: Map<string, GuidePanel[]>;
    } | null = null;
    if (run.kind === 'final') {
      const dirs = parseRunDirections(run.directions);
      const concept = dirs?.directions.find((d) => d.key === run.conceptKey) ?? dirs?.directions[0];
      const g = concept?.gradient;
      if (g?.directional && normalizeHex(g.frontHex) && normalizeHex(g.rearHex)) {
        const vehicle = await vehicles.getPublishedDetail(project.vehicleId);
        if (vehicle) {
          const byView = new Map<string, GuidePanel[]>();
          for (const p of vehicle.panels) {
            const arr = byView.get(p.view) ?? [];
            arr.push({ name: p.name, view: p.view, svgPath: p.svgPath });
            byView.set(p.view, arr);
          }
          gradientGuide = { frontHex: g.frontHex, rearHex: g.rearHex, panelsByView: byView };
        }
      }
    }

    // Shared per-concept seed: every view of a concept renders from one seed
    // (reinforces coherence; deterministic + resubmit-safe like the per-job seed).
    const seedForConcept = (conceptKey: string) => seedFor(`${run.id}:${conceptKey}`);

    let processed = 0;
    for (const job of open) {
      if (processed >= JOBS_PER_SLICE) break;

      // Dependency GATE for derived draft views — a skip must NOT consume the
      // slice budget (so a slice still does up to JOBS_PER_SLICE real units even
      // when some opens are anchor-blocked).
      if (
        run.kind === 'initial' &&
        job.view !== anchorView &&
        job.status === 'pending' &&
        !job.providerRequestId
      ) {
        if (failedAnchorConcepts.has(job.conceptKey)) {
          // Cascade-fail this JOB only — the anchor it derives from can never
          // render. The settle block owns the single idempotent run-level refund
          // (never strand a sibling concept's already-submitted spend).
          await generation.failJob(userId, job.id, 'anchor view failed');
          continue;
        }
        if (!anchorImageByConcept.has(job.conceptKey)) continue; // GATE: anchor not rendered yet
      }

      processed += 1;
      try {
        if (job.status === 'pending' && !job.providerRequestId) {
          // Conditioning: imageUrls[0] is ALWAYS this view's own structure render
          // (geometry). Derived draft / final views add a second reference image
          // (the anchor / approved-draft render) so the design stays coherent.
          // Resolved BEFORE the claim (review fix): signing the donor URL is
          // side-effect-free, so a transient signer error leaves the job 'pending'
          // (retried next slice) instead of stranding it 'submitting' until the
          // run deadline. A lost claim simply discards the resolved URL.
          const structureUrl = storage.templatePublicUrl(
            `views/${project.vehicleId}/${job.view}.png`,
          );
          let imageUrls = [structureUrl];
          let prompt = job.prompt;
          let finalDonorMissing = false;
          if (run.kind === 'initial' && job.view !== anchorView) {
            // Ungated above ⇒ this concept's anchor render exists.
            const anchor = anchorImageByConcept.get(job.conceptKey)!;
            imageUrls = [
              structureUrl,
              await storage.signedAssetReadUrl(anchor.storagePath, COHERENCE_URL_TTL_S),
            ];
            prompt = `${job.prompt}\n\n${coherenceDirective('initial')}`;
          } else if (run.kind === 'final') {
            const donor = donorByView.get(job.view);
            // Build + upload the directional gradient guide for this view (Goal 18).
            // A null guide (non-directional brief, unknown orientation, bad hex)
            // falls straight back to the Goal-17 approved-draft conditioning below.
            let guideUrl: string | null = null;
            if (gradientGuide) {
              const guideBytes = await buildGradientGuide({
                panels: gradientGuide.panelsByView.get(job.view) ?? [],
                frontHex: gradientGuide.frontHex,
                rearHex: gradientGuide.rearHex,
                width: dims.width,
                height: dims.height,
              });
              if (guideBytes) {
                const guidePath = `generations/${run.projectId}/${run.id}/_guide-${job.conceptKey}-${job.view}.png`;
                await storage.uploadAssetObject(guidePath, guideBytes, 'image/png');
                guideUrl = await storage.signedAssetReadUrl(guidePath, COHERENCE_URL_TTL_S);
              }
            }
            const donorUrl = donor
              ? await storage.signedAssetReadUrl(donor, COHERENCE_URL_TTL_S)
              : null;
            if (donorUrl && guideUrl) {
              // Approved look from @image2, briefed DIRECTION pinned by @image3.
              imageUrls = [structureUrl, donorUrl, guideUrl];
              prompt = `${job.prompt}\n\n${gradientGuideDirective(true)}`;
            } else if (guideUrl) {
              // No approved donor, but the guide pins design + direction directly.
              imageUrls = [structureUrl, guideUrl];
              prompt = `${job.prompt}\n\n${gradientGuideDirective(false)}`;
            } else if (donorUrl) {
              imageUrls = [structureUrl, donorUrl];
              prompt = `${job.prompt}\n\n${coherenceDirective('final')}`;
            } else {
              // No approved-draft donor AND no guide: graceful structure-only
              // fallback — a final view re-rolling independently is the Goal-16
              // divergence risk, so flag it (emitted by the claim winner) for obs.
              finalDonorMissing = true;
            }
          }

          // PER-JOB SUBMIT CLAIM (review fix F2): CAS pending→submitting before the
          // provider call. Exactly one concurrent slice wins; losers skip — two
          // racing polls can never double-submit a job.
          const claimed = await generation.claimJob(userId, job.id);
          if (!claimed) continue; // another slice holds (or held) the claim
          if (finalDonorMissing) {
            await captureServerEvent('final_donor_missing', userId, {
              runId: run.id,
              projectId: run.projectId,
              conceptKey: job.conceptKey,
              view: job.view,
            });
          }
          let submission;
          try {
            submission = await provider.submit({
              modelKey,
              prompt,
              imageUrls,
              width: dims.width,
              height: dims.height,
              seed: seedForConcept(job.conceptKey),
            });
          } catch (submitError) {
            Sentry.captureException(submitError, {
              tags: { feature: 'ai-generation' },
              extra: { runId: run.id, jobId: job.id, jobStatus: 'submitting' },
            });
            if (isAmbiguousSubmitError(submitError)) {
              // AMBIGUOUS (timeout/abort/network): the submission may exist
              // provider-side. Re-claiming could double-spend, so fail the
              // job conservatively — the run's cost estimate keeps counting
              // the maybe-spent dollars against the daily cap.
              await generation.failJob(
                userId,
                job.id,
                `submit ambiguous: ${errorMessage(submitError).slice(0, 400)}`,
              );
            } else {
              // DEFINITE rejection — nothing exists provider-side. Release
              // the claim (submitting→pending) so a later poll retries.
              await generation.releaseJobClaim(userId, job.id);
            }
            continue;
          }
          // RESUBMIT GUARD: the request id is persisted in the CAS that
          // flips submitting→submitted, BEFORE any polling.
          await generation.markJobSubmitted(
            userId,
            job.id,
            submission.requestId,
            submission.estimatedCostUsd,
          );
        } else if (job.providerRequestId) {
          const state = await provider.check(modelKey, job.providerRequestId);
          if (state.status === 'complete') {
            await harvestJob(userId, run, job, state, imagedJobIds.has(job.id));
          } else if (state.status === 'failed') {
            await generation.failJob(userId, job.id, state.error.slice(0, 500));
          }
          // pending → nothing; next poll re-checks by the stored request id.
        }
      } catch (error) {
        // Transient (CDN fetch, storage, network) — leave the job non-terminal
        // for the next poll slice; the run deadline + sweeper backstop a job
        // that never recovers. NEVER resubmit here: the request id is already
        // persisted if submit succeeded.
        Sentry.captureException(error, {
          tags: { feature: 'ai-generation' },
          extra: { runId: run.id, jobId: job.id, jobStatus: job.status },
        });
      }
    }
  }

  // Settle: when every job is terminal, the run completes only if EVERY
  // expected unit produced an image; anything less refunds the customer.
  const after = await generation.listJobs(userId, run.id);
  if (after.length === 0 || !after.every(isTerminalJob)) return;

  const completedCount = after.filter((j) => j.status === 'complete').length;
  if (completedCount === after.length) {
    const won = await generation.advanceStatus(userId, run.id, 'rendering', 'complete', {
      completedAt: new Date(),
    });
    if (!won) return; // another slice settled it
    const orchestratorCostUsd = parseRunDirections(run.directions)?.orchestratorCostUsd ?? 0;
    const costUsd = await generation.trueUpRunCost(userId, run.id, orchestratorCostUsd);
    await captureServerEvent('generation_run_completed', userId, {
      runId: run.id,
      projectId: run.projectId,
      kind: run.kind,
      jobs: after.length,
      costUsd,
    });
  } else {
    const failedCount = after.length - completedCount;
    await failRunLoudly(
      userId,
      run,
      completedCount === 0
        ? 'all render jobs failed'
        : `${failedCount} of ${after.length} render jobs failed`,
    );
    // True-up even on failure so the daily spend cap sums actuals + the
    // orchestrator spend, not the stale estimate.
    const orchestratorCostUsd = parseRunDirections(run.directions)?.orchestratorCostUsd ?? 0;
    await generation.trueUpRunCost(userId, run.id, orchestratorCostUsd);
  }
}

// ---------------------------------------------------------------------------
// Snapshot builder.
// ---------------------------------------------------------------------------

async function signedPreviewUrl(previewPath: string): Promise<string | null> {
  try {
    return await storage.signedAssetReadUrl(previewPath);
  } catch {
    return null; // storage unconfigured/transient — the poll retries anyway
  }
}

// Review fix F7: the snapshot is CUSTOMER-facing. Raw failure text (provider
// errors, validation issues, dev-speak) stays server-side — Sentry/PostHog
// get it via failRunLoudly; the client only ever sees friendly copy.
function friendlySnapshotError(error: string | null): string | null {
  if (!error) return null;
  if (/timeout|deadline|swept/i.test(error)) {
    return 'This run took longer than expected and was stopped. Any credits were refunded — please try again.';
  }
  return 'Something went wrong generating your designs. Any credits were refunded — please try again.';
}

async function buildSnapshot(userId: string, run: GenerationRunRow): Promise<RunSnapshot> {
  const jobs = await generation.listJobs(userId, run.id);
  const parsed = parseRunDirections(run.directions);

  const snapshot: RunSnapshot = {
    runId: run.id,
    status: run.status,
    kind: run.kind,
    error: friendlySnapshotError(run.error),
    jobs: jobs.map((j) => ({ conceptKey: j.conceptKey, view: j.view, status: j.status })),
  };
  if (parsed) {
    // Customer-facing fields only — prompts never reach the client.
    snapshot.directions = parsed.directions.map(({ key, title, summary }) => ({
      key,
      title,
      summary,
    }));
  }

  const images = await generation.listImages(userId, run.id);
  if (images.length > 0) {
    const signed = await Promise.all(
      images.map(async (img) => {
        if (!img.previewPath) return null;
        const previewUrl = await signedPreviewUrl(img.previewPath);
        if (!previewUrl) return null;
        return { conceptKey: img.conceptKey, view: img.view, previewUrl };
      }),
    );
    const present = signed.filter((s): s is NonNullable<typeof s> => s !== null);
    if (present.length > 0) snapshot.images = present;
  }
  return snapshot;
}

// ---------------------------------------------------------------------------
// THE entry point — one bounded slice per call, driven by the client poll.
// ---------------------------------------------------------------------------

export async function advanceRun(userId: string, runId: string): Promise<RunSnapshot | null> {
  let run = await generation.getRun(userId, runId);
  if (!run) return null;

  // Deadline first: a run past its TTL fails + refunds LOUDLY, no matter what
  // state it stalled in (the sweeper cron does the same for abandoned runs).
  if (
    NON_TERMINAL.includes(run.status) &&
    run.deadlineAt &&
    run.deadlineAt.getTime() < Date.now()
  ) {
    await failRunLoudly(userId, run, 'timeout: run exceeded its deadline');
    run = (await generation.getRun(userId, runId)) ?? run;
    return buildSnapshot(userId, run);
  }

  if (run.status === 'queued') {
    // CAS gives exactly ONE slice the orchestration; losers fall through to a
    // fresh read (the winner is doing the work).
    const won = await generation.advanceStatus(userId, runId, 'queued', 'orchestrating');
    if (won) {
      try {
        await orchestrateSlice(userId, run);
      } catch (error) {
        // Orchestration failure (invalid model output after repair, missing
        // lineage, transport error) — fail + refund. The customer's poll sees
        // a terminal state instead of a hang.
        await failRunLoudly(userId, run, errorMessage(error));
      }
      run = (await generation.getRun(userId, runId)) ?? run;
      return buildSnapshot(userId, run);
    }
    run = (await generation.getRun(userId, runId)) ?? run;
  }

  // status 'orchestrating' with a different slice holding the work: return the
  // snapshot as-is; the deadline backstops a crashed orchestrator slice.

  if (run.status === 'rendering') {
    await renderSlice(userId, run);
    run = (await generation.getRun(userId, runId)) ?? run;
  }

  return buildSnapshot(userId, run);
}
