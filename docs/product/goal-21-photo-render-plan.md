# Goal 21 - Photo-render concepts + multi-view marketing showcase - implementation plan

Source prompt: `prompts/23-goal-21-photo-render-multiview-showcase.md`. Audit-first map drove this
plan (generation pipeline / fal+orchestrator / photo-storage-RLS / editor-export / studio-UI /
schema-RLS-migrations / verify-deploy-harness). Execute via subagent-driven-development.

## What ships

The app already does ~80%: year/make/model picks a real vehicle outline; the brief has an optional
"add vehicle photos" step + a logo step; a plain-language prompt + style presets; generation returns
3 concept directions with a 4-view switcher (rendered on the TEMPLATE outline); the chosen final
flows to the editor with the real logo composited; export produces a 4-page spec pack derived from
template panel geometry.

The Goal-21 delta, additive only:

- **D2 - photo concepts.** When the customer has uploaded a vehicle photo, each of the 3 concept
  directions ALSO renders ON that photo (image-to-image), shown beside the existing template render.
- **D3 - multi-view showcase.** Selecting a concept opens a polished, on-brand marketing composite
  showing that design across the (already-coherent) template views PLUS the on-photo hero.
- **D4 - protect the print path.** The export spec pack keeps deriving from the template-geometry
  render. The photo render is a clearly-labeled marketing/preview output, never the print file.

## DECISIONS (logged per the prompt's decision policy - chosen, not asked)

- **D-A. Spend ceiling.** Hard cap for build/verify fal spend = **$10** (precedent: Goals 7/13/20 each
  landed under $1.20 against $9-$10 caps). The in-code global rail `AI_CONFIG.dailySpendCapUsd = 5`
  also bounds every run. Estimated marginal cost of the photo feature: +3 nano-banana renders on the
  initial run (~$0.117) and +1 on the final (~$0.039). One full verify e2e ≈ **$0.85**.
- **D-B. Photo i2i model.** Reuse **`nano_banana_edit`** (`fal-ai/nano-banana/edit`, op=edit,
  `image_urls`, $0.039 flat) - already the draft default and a true image-to-image edit that restyles
  the supplied image while preserving the vehicle. The customer photo is passed as `imageUrls[0]` via
  a freshly-minted signed read URL (the photo is private). No adapter change required.
- **D-C. Multi-view consistency + showcase composition.** One customer photo cannot yield
  geometrically-accurate 4 sides via i2i. The template pipeline ALREADY produces a coherent multi-view
  design (Goal 17/18 cross-view coherence). So the showcase is a **deterministic server-side `sharp`
  composite** of: the selected concept's template-conditioned per-view renders (logo composited, as the
  spec pack does) + the on-photo hero, in an on-brand layout (cyan `#00AEEF` + black, an Alpha Wolf
  wordmark banner as an APP OVERLAY, never AI-generated). $0 marginal fal; fully consistent; protects
  the print path.
- **D-D. Logo policy.** Real-asset composite everywhere; the AI never redraws the logo (existing
  invariant, ORCHESTRATOR clear-space rule preserved). The on-photo render and the showcase composite
  the REAL uploaded logo asset server-side (sharp), same as the final/editor/export already do.
- **D-E. Storage shape.** Reuse the existing `generation_jobs` / `generation_images` machinery with a
  new `render_target` discriminator column (`'template'` default | `'photo'`). Photo concepts are
  additive jobs on the `initial` and `final` runs (one credit spend, reused CAS/credit/refund/cap
  rails). No new tables, no new RLS policies (existing owner policies cover the new column). The
  showcase composite is cached as a project-assets object (no new table). Print-reading seams filter
  `render_target = 'template'`.
- **D-F. Run integration.** Photo jobs ride the existing `initial` + `final` runs (NOT a new run kind),
  so they share the one credit spend and all money rails. They use `view = 'photo'` (a sentinel that is
  never a real template view) and are partitioned OUT of the Goal-17/18 coherence machinery, which keys
  off `view`. Iteration does not re-render the photo (out of scope; the hero refreshes at final).

## Global Constraints (BINDING - every task and reviewer must honor)

- **No em-dashes anywhere** (copy, code comments, commits, UI strings, docs). Use commas, colons,
  parentheses, or two sentences.
- **The print path is LOCKED.** The export spec pack and editor canvas must keep deriving from the
  TEMPLATE-geometry render (`views/<vehicleId>/<view>.png` conditioning → `kind='final'` render →
  `loadFinalViews` hero + `panelPrintSizesIn` geometry). A photo render must NEVER:
  reach `loadFinalViews`/`buildSpecPack` as a hero or view; reach `insertIntoCanvas` as an editor
  layer; alter `imageUrls[0]` (the per-view structure render) for template jobs. Photo renders are
  identified by `render_target = 'photo'` (and `view = 'photo'`) and must be filtered out at every
  print/editor read.
- **DB split + RLS (CLAUDE.md §2).** Every customer read/write uses `withUser` (app_user, RLS). Never
  `withSystem` for user-scoped photo/showcase paths. New column needs no new policy; if any SQL is
  applied out-of-band via Supabase MCP, insert the `_prisma_migrations` row with the SHA-256 checksum
  so `prisma migrate deploy` skips cleanly.
- **Money rails.** Credits only via `app_spend_credits` / `app_refund_credits`. Photo jobs ride the
  existing run's single credit spend - never a hand-rolled credit write, never a second money path.
- **Spend cap is real money.** `estimateRunCostUsd` must conservatively bound photo + template renders
  so the daily `$5` cap stays a true upper bound. `trueUpRunCost` replaces the estimate with actuals.
- **Logo never AI-redrawn.** The model is never handed the logo to draw; the real logo asset is
  composited after rendering. Preserve the orchestrator clear-space rule.
- **Hobby deploy limits.** `maxDuration <= 60s`; the client-poll slice model is preserved - photo jobs
  share `JOBS_PER_SLICE = 3` and add poll slices, never a single long call. Crons stay daily-only.
- **Watermark discipline.** Draft/iteration previews are watermarked; finals are not. The on-photo
  preview shown pre-selection is watermarked; the post-selection showcase (paid) is not.
- **Provider fetch.** fal fetches the submit input URL itself, so a signed private photo URL as the
  i2i base is fine (it does not hit our SSRF allowlist; that allowlist only gates harvesting fal
  OUTPUT, always fal CDN). Mint the signed photo URL fresh per submit with a TTL that outlives the run.
- **Prompt versioning.** The new photo-render prompt lives behind its own version constant
  (`PHOTO_PROMPT_VERSION`), decoupled from `ORCHESTRATOR_PROMPT_VERSION`. Do not edit the orchestrator
  system/user prompts or its structured-output schema.
- **Client bundle hygiene.** `lib/generation/gallery.ts` ships in the client bundle and must NOT import
  `@alphawolf/db` or any server-only module.

## Key interfaces (verified against the worktree at origin/main f6e2215)

- `AI_MODELS.nano_banana_edit`: `{ id:'fal-ai/nano-banana/edit', op:'edit', imageField:'image_urls',
pricing:{kind:'per_image',usd:0.039} }`. `AI_CONFIG.defaults.draft = 'nano_banana_edit'`,
  `.final = 'flux2_pro_edit'`, `draftImage 1024x768`, `finalImage 1600x1200`, `dailySpendCapUsd 5`.
- `run-pipeline.ts`: `orchestrateSlice` builds `jobs: {conceptKey, view, prompt}[]` then
  `generation.recordJobs(userId, runId, jobs)` + CAS to `rendering`. `renderSlice` partitions open jobs,
  conditions each template job on `storage.templatePublicUrl('views/'+vehicleId+'/'+view+'.png')` at
  `imageUrls[0]` (line ~682), with Goal-17 anchor + Goal-18 gradient-guide second/third images.
  `harvestJob` uploads to `generations/<projectId>/<runId>/<concept>-<view>.<ext>`, watermarks non-final,
  `generation.insertImage(...)`. `seedFor`, `JOBS_PER_SLICE=3`, settle block requires every job complete.
- `generation.ts` actions: `estimateRunCostUsd(modelKey, kind, views)` (initial=3 directions, final=1);
  `checkSharedGates` (rate limit + daily spend cap); `startRun` (credit spend, one tx). Snapshot images:
  `{conceptKey, view, previewUrl}`. `getGenerationContextAction` signs `img.previewPath`.
- Print reads: `load-spec-pack-data.ts loadFinalViews` (line 79-93) picks `kind='final'` complete run,
  `renderable` = png/jpg images, `bestByView` = largest per view. `generation-finalize.ts insertIntoCanvas`
  places per-view renders + real logo into the editor canvas.
- `gallery.ts deriveConcepts`: folds runs into 3 `ConceptCard`s, `views: Record<view,url>`,
  `finalViews`, `finalRunId`. `VIEW_LABELS` is the client-side view set (no 'photo').
- Storage: `project-assets` PRIVATE bucket; `storage.signedAssetReadUrl(key, ttl?)`,
  `storage.uploadAssetObject(key, bytes, contentType)`, `storage.downloadAssetObject(key)`.
  Customer photos: `brief.data.photos[] = {assetId, note?}` → `project_assets` rows
  (`source_url`/`parsed_url` are bucket keys, not URLs). Logo: `brief.data.logo.assetId`.
- `compose-views.ts`: `composeView` composites the logo onto a render at its zone; `pickHeroView`.

---

## Task 1: render_target discriminator (schema + migration + repo)

**Goal.** Add a `render_target` column (`'template'` default | `'photo'`) to `generation_jobs` and
`generation_images` so photo renders are explicitly distinguishable from template renders at every read.
No new tables, no new RLS policy.

**Files.**

- `packages/db/prisma/schema.prisma`: add to `GenerationJob` and `GenerationImage`:
  `renderTarget String @default("template") @map("render_target")`.
- `packages/db/prisma/migrations/<timestamp>_generation_render_target/migration.sql`: for BOTH tables,
  `ALTER TABLE ... ADD COLUMN render_target text NOT NULL DEFAULT 'template';` and a raw-SQL CHECK
  `ALTER TABLE ... ADD CONSTRAINT chk_<table>_render_target CHECK (render_target IN ('template','photo'));`
  (mirror the migration style of `20260612200100_generation_runs/migration.sql`, whose header documents
  the `_prisma_migrations` checksum ritual). Use a fixed timestamp string; do not call Date.now().
- `packages/db/src/repos/generation.ts`:
- `recordJobs(userId, runId, jobs)` - accept `renderTarget?: 'template'|'photo'` per job item, default
  `'template'`, persist it on insert (skipDuplicates unchanged).
- `insertImage(userId, input)` - accept `renderTarget?: 'template'|'photo'` (default `'template'`),
  persist it.
- `GenerationJobRow` and `GenerationImageRow` types: add `renderTarget: 'template'|'photo'`.
- `listJobs`, `listImages`, `listRunsForProject` image rows, and `getRunContext`/`getRun` images:
  select and return `renderTarget`.
- Re-export any new type from `packages/db/src/index.ts` if needed.

**Tests** (`packages/db` test conventions; do not require a live DB - follow how existing repo tests
mock/stub Prisma, or add a focused unit test of the row-mapping if that is the existing pattern). At
minimum: a test asserting `recordJobs`/`insertImage` pass `render_target` through and default to
`'template'` when omitted, and that the row types expose `renderTarget`. If the repo layer has no
unit-test harness, add a typed mapping test for the row shape.

**Done when.** Prisma schema validates (`pnpm --filter @alphawolf/db prisma:validate` or
`prisma format`/`validate`), the package builds (`turbo run build --filter=@alphawolf/db`), the new
migration SQL is present and idempotent-safe in style, and the repo round-trips `render_target`.

**Out of scope.** No RLS policy changes. No reads in apps/web yet (later tasks consume it).

---

## Task 2: photo-render config + prompt builder

**Goal.** Add the photo-render model default and a versioned, deterministic prompt builder that wraps a
concept direction's design summary into an image-to-image instruction for a REAL customer photo.

**Files.**

- `packages/db/src/ai-config.ts`: add `photo: 'nano_banana_edit' as AiModelKey` to `AI_CONFIG.defaults`
  (a comment: photo i2i reuses the nano-banana edit model - true image-to-image, $0.039 flat). Export a
  `PHOTO_VIEW = 'photo'` constant from the db package (a sentinel view name; document that it is never a
  real template view and is filtered out of every print/editor read and the 4-view switcher).
- `apps/web/lib/ai/orchestrator/prompts.ts`: add `export const PHOTO_PROMPT_VERSION = 'p1';` and
  `export function buildPhotoRenderPrompt(input: { summary: string }): string`. The prompt must:
  apply the design described by `summary` to the vehicle IN THE SUPPLIED PHOTO via image-to-image;
  preserve the vehicle's exact shape, the photo's background, perspective, and lighting; render NO text,
  letters, numbers, logos, emblems, or badges, and reserve clear space where a logo would sit (the real
  logo is composited separately); keep the result photorealistic. Do NOT modify the existing
  `ORCHESTRATOR_SYSTEM_PROMPT`, `ITERATION_SYSTEM_PROMPT`, `buildCompileUserMessage`, or
  `ORCHESTRATOR_PROMPT_VERSION`.

**Tests** (`apps/web` vitest, alongside existing `lib/ai/orchestrator` tests). `buildPhotoRenderPrompt`:
includes the design summary verbatim; forbids text/logos; mentions preserving the photo (background /
shape / lighting); `PHOTO_PROMPT_VERSION` is a non-empty string. No em-dashes in the produced prompt.

**Done when.** Tests pass; db + web typecheck; no orchestrator-prompt or version drift.

---

## Task 3: pipeline - photo job fan-out + isolated photo render branch

**Goal.** Generate the on-photo concept renders inside the existing `initial` (3, watermarked) and
`final` (1, un-watermarked) runs, fully isolated from the Goal-17/18 coherence machinery and never
touching the template conditioning.

**Files.** `apps/web/lib/ai/run-pipeline.ts` (+ `packages/db` repo helpers from Task 1).

**Spec.**

- Add a server-only helper `resolveCustomerPhotoKey(userId, projectId, briefData)` → the storage key of
  the first uploaded vehicle photo (`briefData.photos[0].assetId` → `projects.getAsset` →
  `parsedUrl ?? sourceUrl`), or `null` if none. Guard ownership (asset.projectId === projectId).
- `orchestrateSlice`:
- `initial`: after building the template `jobs`, if a customer photo exists, append one photo job per
  direction: `{ conceptKey: d.key, view: PHOTO_VIEW, prompt: buildPhotoRenderPrompt({summary: d.summary}),
renderTarget: 'photo' }`.
- `final`: after building the template `jobs` for the chosen concept, if a photo exists, append one
  photo job for that concept (`view: PHOTO_VIEW`, `renderTarget: 'photo'`,
  prompt = `buildPhotoRenderPrompt({summary: concept.summary})`).
- `iteration`: no photo job (out of scope).
- Pass `renderTarget` through `generation.recordJobs`.
- `renderSlice`:
- Partition `open` jobs into `templateJobs` (`renderTarget==='template'`) and `photoJobs`
  (`renderTarget==='photo'`). The EXISTING coherence machinery (runViews, anchorView,
  anchorImageByConcept, failedAnchorConcepts, donorByView, gradientGuide, the per-job loop) must
  operate on TEMPLATE jobs only - compute `runViews` from template jobs, iterate template jobs for the
  existing submit/harvest path UNCHANGED. Do not alter `imageUrls[0] = structureUrl` for template jobs.
- Add a separate, simple photo loop (sharing the `JOBS_PER_SLICE` budget with the template loop - the
  total submitted/harvested across both loops per slice is bounded by `JOBS_PER_SLICE`): for each open
  photo job, on `pending` + no requestId: `claimJob` → mint a fresh `storage.signedAssetReadUrl(photoKey,
COHERENCE_URL_TTL_S)` → `provider.submit({ modelKey: AI_CONFIG.defaults.photo, prompt: job.prompt,
imageUrls: [photoUrl], width, height, seed: seedForConcept(conceptKey) })` → `markJobSubmitted`. On a
  submitted photo job: `provider.check(AI_CONFIG.defaults.photo, requestId)` → harvest. Reuse the same
  ambiguous-vs-definite submit-error handling as the template loop.
- `harvestJob` must record the correct per-image model and `renderTarget`: thread the model used
  (photo jobs → `AI_CONFIG.defaults.photo`; template jobs → `run.model`) and `render_target` into
  `generation.insertImage`. Photo previews are watermarked when `run.kind !== 'final'`, same as template.
  Storage path keeps the `<concept>-<view>` scheme (`view='photo'` makes photo paths distinct).
- The settle block (every job terminal/complete) already spans all jobs - leave it; a photo job is just
  another unit that must complete for the run to complete and true-up.
- If a photo job exists but `resolveCustomerPhotoKey` returns null at submit time (photo deleted
  mid-run), fail just that job with a clear message (do not crash the slice; the run settle will refund
  if it cannot complete) - but note orchestrate only creates photo jobs when a photo exists, so this is
  a defensive guard.

**Tests** (`apps/web/tests` / `lib/ai`, using the deterministic mock provider - real i2i visual behavior
is verified later on real fal):

- `orchestrateSlice` (or its job-building helper) creates N+3 jobs for an initial run with a photo (3
  photo jobs, `view='photo'`, `renderTarget='photo'`), and N jobs with no photo.
- `final` adds exactly one photo job when a photo exists.
- `renderSlice` partition: template jobs still get `imageUrls[0] = templatePublicUrl(...)` and the anchor
  logic computes `runViews`/`anchorView` from template jobs only (a `view='photo'` job never becomes an
  anchor and never gates a template job).
- A photo job submits with `imageUrls = [signed photo url]` and the photo model, harvests with
  `render_target='photo'`, and is watermarked on a non-final run.
- Settle still completes only when ALL jobs (template + photo) are complete.

**Done when.** Tests pass with the mock provider; no change to template conditioning; web typechecks/builds.

**DONE_WITH_CONCERNS if.** The renderSlice changes feel like they entangle the coherence machinery -
report it rather than forcing it.

---

## Task 4: start actions - estimate + gate include photo renders

**Goal.** Keep the daily spend cap a true upper bound when photo renders are added.

**Files.** `apps/web/lib/actions/generation.ts`.

**Spec.**

- `estimateRunCostUsd(modelKey, kind, views, opts?: { photoRenders?: number })`: add
  `photoRenders * estimateImageCostUsd(AI_MODELS[AI_CONFIG.defaults.photo].pricing, draftImage|finalImage)`
  to the existing template estimate. Photo renders use draft dims on initial/iteration, final dims on
  final (mirror the existing `dims` selection). Keep the existing template terms unchanged.
- `startGenerationRunAction`: compute `hasPhoto = (parsed.data.photos?.length ?? 0) > 0`; pass
  `photoRenders: hasPhoto ? 3 : 0` to the estimate.
- `startFinalAction`: compute `hasPhoto` from the run's brief snapshot (or the live brief -
  match what orchestrate uses to decide photo jobs; simplest: read the brief like orchestrate does, or
  pass through the parent's brief). Pass `photoRenders: hasPhoto ? 1 : 0`.
- NOTE: orchestrate decides photo jobs from `briefData.photos`. The estimate must use the SAME source
  so the cap is consistent. If reading the brief in the action is awkward, document the chosen source.
- `startIterationAction`: unchanged (no photo render on iteration).

**Tests.** `estimateRunCostUsd` includes photo cost when `photoRenders>0` and is unchanged when 0; the
initial estimate with a photo equals template estimate + 3 nano renders.

**Done when.** Tests pass; web typechecks.

---

## Task 5: protect the print + editor path (defense filters + tests)

**Goal.** Guarantee the photo render NEVER reaches the export spec pack or the editor canvas, with tests
proving it.

**Files.**

- `apps/web/lib/export/load-spec-pack-data.ts`: in `loadFinalViews`, filter the `renderable` set to
  `img.renderTarget === 'template'` (exclude `'photo'`) in addition to the existing png/jpg filter. The
  hero + per-view spec pack images must only ever come from template renders.
- `apps/web/lib/actions/generation-finalize.ts`: in `insertIntoCanvas` (and any place it selects the
  per-view renders to place as locked editor layers), filter to `renderTarget === 'template'` so a
  `view='photo'` render is never inserted as an editor layer.

**Tests** (`apps/web/tests`):

- A `loadFinalViews`-level (or `bestByView`-level) test: given a final run whose images include a
  `render_target='photo'` (`view='photo'`) entry plus template views, the result contains ONLY template
  views and no `'photo'` view. (Mock `generation.listRunsForProject` / the repo read as existing export
  tests do.)
- An `insertIntoCanvas` test: a photo render is not placed as a canvas layer.

**Done when.** Tests pass and demonstrably exclude the photo render from both seams; web typechecks.

---

## Task 6: showcase compositor (sharp) + server action

**Goal.** Produce the on-brand multi-view marketing showcase as a deterministic server-side composite,
exposed via an owner-scoped server action that caches its output.

**Files.**

- `apps/web/lib/generation/showcase.ts` (server-only): `export async function composeShowcase(input: {
heroPng: Uint8Array | null; views: Array<{ view: string; png: Uint8Array }>; brand?: {...} }):
Promise<Uint8Array>`. Use `sharp` (already a dep) to lay out: the on-photo hero featured large at top
  (if present), the template views in a row/grid beneath, on a black canvas with a cyan `#00AEEF`
  accent bar and an "ALPHA WOLF" wordmark text banner (rendered via an SVG buffer composited with sharp -
  no external font dependency beyond what sharp/SVG supports) plus a small "Concept preview - not the
  print file" caption. Deterministic output (no randomness, no Date). Reasonable fixed canvas size
  (e.g. 1600x1200). The brand tokens (`#00AEEF` cyan, `#141b2d` ink, `#f8f8f6` paper) match
  `packages/db/src/svg/theme.ts`.
- `apps/web/lib/actions/showcase.ts` (`'use server'`): `buildShowcaseAction(projectId, runId,
conceptKey)`. `requireUser`; verify ownership via `projects.getProject` (RLS) - return a typed
  not-found for non-owners (404 semantics). Load the concept's final TEMPLATE views (reuse
  `compose-views.composeView` with the real logo, exactly like the spec pack, filtered to
  `render_target='template'`) + the on-photo hero (`render_target='photo'` image for the concept, final
  run preferred, else initial). Call `composeShowcase`. Cache the PNG to project-assets
  `showcase/<projectId>/<runId>-<conceptKey>.png` via `storage.uploadAssetObject` (idempotent - overwrite
  ok). Return `{ ok: true, url: signedReadUrl }` or `{ ok:false, code }`. Owner-scoped throughout;
  never `withSystem`.

**Tests** (`apps/web/tests`):

- `composeShowcase` with fixture PNGs (a 1x1 or small generated png buffer via sharp) returns a valid PNG
  of the expected dimensions, including when `heroPng` is null (template-only showcase) and when present.
- Assert the output is a PNG (magic bytes) and non-trivial size. (Pixel-perfect layout is verified
  visually in the e2e run; the unit test guards "produces a valid composite, handles missing hero".)

**Done when.** Tests pass; web typechecks/builds. The action compiles and is owner-scoped. No price-like
content on the composite (CLAUDE.md no-pricing rule).

---

## Task 7: studio UI - gallery split, on-photo preview, showcase modal, brand, in-studio uploader

**Goal.** Surface the on-photo concept render beside each concept, an in-studio photo uploader for
customers who skipped the brief photo step, and a click-to-expand multi-view showcase, all on-brand and
clearly labeled "concept preview, not the print file."

**Files.**

- `apps/web/lib/generation/gallery.ts` (client-safe - NO db import): add to `GalleryRun['images']` an
  optional `renderTarget?: 'template'|'photo'` field; add to `ConceptCard`:
  `photoView: string | null` (watermarked on-photo preview) and `finalPhotoView: string | null`.
  `deriveConcepts` routes images with `renderTarget==='photo'` (or `view==='photo'`) into `photoView` /
  `finalPhotoView` instead of `card.views` (so the 4-view switcher never shows a 'photo' view).
- `apps/web/lib/actions/generation.ts`: include `renderTarget` on the snapshot/summary image entries
  (both `RunSnapshot.images` in run-pipeline and `GenerationRunSummary.images`), signing photo previews
  exactly like template previews. (Coordinate the `RunSnapshot` image type change with run-pipeline.)
- `apps/web/lib/ai/run-pipeline.ts` `buildSnapshot`: include `renderTarget` (and keep `view='photo'`) on
  emitted images so the live poll surfaces the on-photo preview.
- `apps/web/components/generation/GenerationStudio.tsx`:
- **D1 in-studio uploader**: in the empty/pre-generate state, add a vehicle-photo uploader reusing
  `useAssetUpload` + `PHOTO_MIME` (mirror `components/brief/PhotosStep.tsx`), persisting `{assetId}` to
  `brief.data.photos` via `saveBriefAction` and flushing before start so the run snapshot includes it.
  If a photo already exists (from the brief), show it and allow replace. Keep it optional - no photo =
  today's template-only experience.
- **D2 on-photo concept**: per concept card, when `photoView`/`finalPhotoView` exists, show an "On your
  vehicle" image (reuse `BeforeAfterSlider` with the customer photo as `before` and the on-photo render
  as `after`, or a labeled image). Caption: "Concept preview - not the print file."
- **D3 showcase modal**: a "See it across your vehicle" button on a selected/final concept opens a
  Dialog (reuse `packages/ui` `dialog.tsx`, like `WaitlistSheet`) that calls `buildShowcaseAction` and
  renders the returned composite, on-brand (cyan `#00AEEF` + black). Show a loading state; handle
  errors gracefully. Caption it a marketing/preview render, not the print deliverable.
- **Brand**: introduce the cyan/ink/paper tokens for the showcase chrome (a small scoped addition -
  hardcoded hex or Tailwind arbitrary values; do not restructure the whole theme).
- **Analytics**: fire `captureEvent('photo_concept_viewed', ...)` and `('showcase_opened', ...)` via the
  existing client analytics, matching the existing event style.
- Preserve existing a11y patterns (aria-live, aria-pressed view tabs, raw `<img>` for signed URLs,
  `data-testid`s) and the signed-URL stabilization (do not refetch every 2.5s tick).

**Tests.** Extend `gallery.test.ts` (or equivalent): `deriveConcepts` routes a `render_target='photo'`
image into `photoView` and a final photo into `finalPhotoView`, and never into `card.views`; the 4-view
switcher view set excludes `'photo'`. Component-level tests follow existing studio test conventions if
present; otherwise the gallery derivation test + the e2e in Task 8 cover behavior.

**Done when.** Tests pass; web typechecks/builds; the studio renders the on-photo preview + uploader +
showcase modal; no 'photo' leaks into the view switcher.

---

## Task 8: e2e spec + verification scaffolding

**Goal.** An automated end-to-end spec that exercises the photo path against the MOCK provider (CI-safe)
and asserts the print path is unaffected, plus a reusable throwaway-DB recipe for the manual real-fal run.

**Files.**

- `apps/web/e2e/goal-21-photo-render.spec.ts`: drive (against a seeded test project, mock provider):
  upload a vehicle photo in the brief (or studio), generate, assert the studio shows 3 concepts AND an
  "on your vehicle" preview per concept (a `render_target='photo'` image surfaces), open the showcase
  modal and assert a composite renders, then request the export and assert the spec pack is produced and
  does NOT include a 'photo' view (the print path is template-only). Follow the patterns in
  `apps/web/e2e/generation.spec.ts` and `brief-wizard.spec.ts`.
- `docs/deployment/goal-21-verify-recipe.md`: codify the Goal-16/20 throwaway-DB + real-fal recipe
  adapted for the photo path (createdb, extensions+pgcrypto, app_user role, migrate:deploy + apply-sql,
  copy the X3 catalogue read-only, apps/web/.env.local with local DB + AI_PROVIDER=fal + FAL_KEY +
  blanked POSTHOG/SENTRY, run the spec with real fal under the $10 cap, net-zero purge by project id via
  the Storage API). This documents the manual D5 verification; it does not run in CI.

**Tests.** The spec itself is the test; it must pass against the mock provider locally
(`AI_PROVIDER` unset → mock). Keep it within the existing e2e harness.

**Done when.** The spec passes locally against the mock; the recipe doc is complete and accurate.

---

## After all tasks (controller-run, not a subagent task)

- Final whole-branch review (most-capable model) via requesting-code-review.
- `advisor()` second opinion on the generation/RLS/spend surface (CLAUDE.md §3) if available; else a
  second independent code-review subagent in fresh context.
- Real-fal D5 verification run within the $10 cap on a throwaway DB; confirm: 3 on-photo concepts, the
  showcase across views, the export pack unaffected + panel-accurate (manual pdf check), multi-view
  consistency. Purge net-zero by project id.
- Deploy: migration applied (Supabase MCP + `_prisma_migrations` checksum), push branch, PR, CI green,
  Vercel prod smoke, Sentry 0-new.
- Closeout: `activities.md` entry (top), mermaid diagram `docs/vault/diagrams/goal-21-*.md`,
  `graphify update .`, worktree cleanup.
