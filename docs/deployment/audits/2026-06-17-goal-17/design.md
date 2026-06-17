# Goal 17 — Cross-View Coherence — D1 Root Cause + Design (systematic-debugging)

Executor: Claude (Opus 4.8) in Claude Code, autonomous. Base: `goal/16-launch-readiness` @ `43ef618`
(7 commits on `origin/main` @ `1bb9d00` = Goal 15 = live prod; Goal 16 unmerged — Archer confirmed
basing Goal 17 on the Goal-16 branch). Environment: local build + LOCAL throwaway Postgres
(`alphawolf_g16`, NEVER prod) + real-fal-capable + LIVE storage (hard-purged after). Net-zero on prod.

## Root cause (CONFIRMED with code evidence — systematic-debugging Phase 1)

Carryover B = the four export views disagree on base colour (Goal-16 real-fal: driver = gloss-black +
cyan wireframe, passenger = solid cyan; neither is the brief's gradient). **Root cause is architectural,
not the prompt:**

`renderSlice()` (`apps/web/lib/ai/run-pipeline.ts:454-529`) submits **every view as a fully independent
img2img call** with NO cross-view linkage:

- `seed: seedFor(job.id)` (L478) → a **different seed per view** (sha256 of the per-job id).
- `imageUrls: [conditioningUrl]` (L475) → **only its own per-view structural line-art**; no shared
  reference, no canonical anchor.
- `prompt: job.prompt` → its own per-view prompt.

Independent diffusion samples over identical _text_ directives diverge in base colour + render style.
This is why Goal-16's orchestrator **v3** — which already says "keep the design CONTINUOUS across views…
RENDER-STYLE CONSISTENCY (critical)… passenger MIRRORS driver" (`orchestrator/prompts.ts:108-115`) —
**failed to fix B on real fal.** Text alone cannot pin pixel-level colour/gradient across independent
samples. Goal-16's verified D6 finding reached the same conclusion. **Fix lever = the image/conditioning
layer (a shared visual anchor), not more prompt text.**

Provider capability (gates the fix): `ProviderRequest.imageUrls` is already `string[]`; `fal.ts buildInput`
maps **all** urls when `imageField==='image_urls'`. The pipeline's draft model `nano_banana_edit` and final
model `flux2_pro_edit` are both `image_urls` (`ai-config.ts:53-83`) → **multi-image conditioning is natively
supported.** (`kontext_dev` iteration = single `image_url`; iteration handled separately — see below.)

## Chosen approach (DECISION): canonical-anchor cross-view conditioning + shared seed + v4 gradient contract

The minimal architectural change that attacks the exact root cause, reuses existing multi-image model
support, and preserves every Goal-15 win. Per concept, for the `image_urls` stages (draft + final):

1. **Anchor view:** deterministically pick one canonical view that best displays the whole design —
   preference `driver > passenger > front > back > top` (a side view shows the full front→rear gradient),
   falling back to the run's first view. Render it FIRST, structure-only conditioning, as today.
2. **Derived views:** gate each non-anchor view until its concept's anchor image is `complete`; then submit
   with `imageUrls: [structureUrl, anchorReadUrl]` (structure[0] = THIS view's geometry to wrap; anchor[1] =
   the colourway/gradient/finish donor) + a render-time **coherence directive** ("image 2 is the SAME wrap
   on a different angle of this same vehicle — reproduce its EXACT base colour, gradient direction [front of
   vehicle darkest → rear brightest], accents, and finish; use image 1 ONLY for this view's panel geometry;
   do not copy image 2's camera angle/layout").
3. **Shared per-concept seed:** `seedFor(`${runId}:${conceptKey}`)` so all views of a concept share init
   noise (reinforces coherence; also makes the deterministic mock render one coherent hue per concept).
4. **Fast-fail:** if a concept's anchor job fails, fail its gated derived jobs immediately (→ run fails +
   refunds without waiting for the deadline).

Coherence is now **by construction** relative to the anchor. Per-view structure conditioning is retained,
so per-panel fill + editor handoff + logo compositing (Goal 15) are untouched.

**v4 orchestrator (supporting, generalizes):** bump `ORCHESTRATOR_PROMPT_VERSION` v3→v4 — add a single
shared "design signature" each direction restates identically across views, and an explicit directional/
gradient contract (one global front→rear direction, both sides identical) so directional briefs map
consistently. The architectural fix is primary; v4 is reinforcement, validated by the multi-brief eval.

**Logo:** stays a composited sharp layer (never AI-rendered) on both doors + hood — unchanged.

**Iteration (`kontext_dev`, single image):** left as a targeted per-view edit. The FINAL re-renders ALL
views with the anchor approach, so the **exported product** (the deliverable) is coherent regardless of
iteration internals. Documented, not a regression.

## Rejected alternatives

- **(c) single-pass multi-view (one grid image):** strongest coherence but breaks per-view outline
  registration → regresses Goal-15 per-panel fill + editor handoff; lower per-view resolution. REJECT (risk).
- **(d) post-gen palette normalization (deterministic recolor):** doesn't fix _style_ divergence (photoreal
  vs cel-shaded); remapping arbitrary AI output to a directional gradient is fragile/artificial. REJECT as
  primary — kept as a possible defense-in-depth only if the eval shows residual divergence.
- **shared seed alone:** insufficient — different conditioning + geometry per view still diverges; seed only
  fixes init noise. Folded in as reinforcement, not the fix.

## Risks + mitigations

- R1 model copies anchor _geometry_ not just colourway → wrong view: prompt wording (structure = image[0],
  "colourway only" from image[1]); validate on real fal, tune prompt. **Primary technical risk.**
- R2 anchor is a single sample → all views inherit it: acceptable — it's ONE coherent design (the goal);
  customer iterates if unhappy. Coherence > per-view lottery.
- R3 extra latency (anchor before derived): ~1 poll cycle, within deadline.
- R4 cost: extra input image on metered final ≈ +$0.015/view; nano `per_image` unchanged. Negligible.

## D1.1 — Post-validation refinements (4-lens adversarial workflow: architect / image-gen-skeptic / regression-hunter / devils-advocate)

All four lenses returned **sound-with-changes, zero fatal flaws**. Canonical-anchor confirmed the soundest
primary (single-pass-multiview rejected: breaks per-view outline registration + editor handoff; post-gen
normalization can't fix style divergence). Consensus refinements ADOPTED into the locked design:

1. **Data-driven gating, NOT order-based** (architect+image-gen+regression). `listJobs` orders by `createdAt`
   asc with no tiebreak and `recordJobs` uses a batched `createMany` (identical `createdAt`) → submit order is
   indeterminate. Gate each derived job on the **existence of its concept's anchor IMAGE row**
   (`listImages` (conceptKey, anchorView)); prioritise anchor jobs within the slice; never rely on row order.
2. **Fast-fail JOBS-only** (architect+regression). On anchor-job `failed`, `failJob` ONLY the same concept's
   still-`pending`+unsubmitted derived jobs (mirror the claim CAS); NEVER fail an already-`submitted` derived
   job (harvest it so cost trues up); do NOT call `failRunLoudly` from the fast-path — the existing settle
   block (`renderSlice:534-560`) owns the single idempotent run-level refund. Avoids stranding sibling
   concepts' in-flight spend.
3. **Gated jobs don't consume the slice budget** — only increment `processed` on a real submit/harvest.
4. **Anchor/donor URL = `signedAssetReadUrl(storagePath)`** (the non-watermarked ORIGINAL, not `previewPath`);
   fal fetches the Supabase signed host (a new outbound surface); TTL = `COHERENCE_URL_TTL_S` = 1h
   (3600s) — still ≫ the 15-min RUN_TTL, kept tight to minimize the window the unwatermarked original
   is reachable. The signing call is resolved BEFORE `claimJob` (post-review fix) so a transient signer
   error leaves the job `pending`/retryable instead of stranded `submitting` until the deadline.
5. **Cost-estimate undercount** (all four). `estimateRunCostUsd` (`actions/generation.ts:110`) hardcodes
   `inputImages=1`; `flux2_pro_metered` bills input MP, so a 2-input final view is ~$0.03 (not $0.015) — the
   daily $5 cap is a non-negotiable real-dollar control. Bump the pre-estimate to `inputImages=2` for `final`;
   nano `per_image` (draft) is flat so its estimate is already exact. Unit-test estimate ≥ worst actual.
6. **THE headline (devils-advocate) — close the draft→final gap.** The FINAL stage (the actual exported
   deliverable) ALWAYS conditions on the template render (`run-pipeline.ts:467` ignores `run.kind`), so even a
   perfectly-coherent approved draft lets the export re-roll a different / brief-wrong colour — the exact
   Goal-16 cyan failure. Trusting the v4 prompt for draft→final fidelity would repeat Goal-16's
   trust-the-prompt mistake. **FIX:** condition each FINAL view on the **customer-approved draft render** for
   that (conceptKey, view) — resolved as the latest render across the parent lineage (final → iteration\* →
   draft) — as `[structureUrl(@image1=geometry), approvedDraftUrl(@image2=design)]` with a "reproduce image 2's
   exact design at export quality" directive. The export then faithfully reproduces the approved coherent draft
   (coherence inherited per-view; NO anchor gating needed for final — donors pre-exist). Graceful fallback to
   `[structureUrl]` if a view has no lineage render.
7. **Mock CANNOT prove coherence** (all four). `mock.hueFor` keys on `modelKey:seed` and ignores `imageUrls`;
   with a shared per-concept seed the mock renders identical hues per concept regardless of conditioning — a
   tautology. The mock validates the STATE MACHINE only; the "coherence fixed" claim is gated on **real-fal
   evidence**.
8. **Model split** (image-gen). `flux2_pro_edit` (final) has documented @image1/@image2 reference editing —
   well-matched; use that syntax + assert array order. `nano_banana_edit` (draft) is a Gemini FUSION model that
   freely changes camera angle — geometry-bleed is a real risk; the derived-view directive must say "keep THIS
   image's vehicle shape and camera angle EXACTLY; adopt ONLY the colours / gloss-black→cyan gradient direction /
   finish from the reference." **Probe BOTH models on real fal (2-image) BEFORE the full eval**; if nano bleeds
   geometry, draft falls back to single-image + shared seed (lower draft coherence) while the final
   (flux-2-pro, draft-conditioned) carries the deliverable.
9. **Eval = real-fal, per-view, coherent AND brief-faithful.** Measure gradient PHASE per view (front = darkest
   end, back = brightest end — a side anchor shows that axis foreshortened for the end views), not just
   base-colour agreement; agreement alone passes a coherently-brief-WRONG concept (the Goal-16 trap). Locked
   brief + 2 eval briefs (≥ the prompt's "2-3 brief eval").
10. **v3→v4 in the SAME change** as the runtime coherence directive (provenance traceability). v4 adds a single
    shared design-signature each direction restates across views + an explicit directional-gradient contract.
11. **Palette normalization** stays a measured, eval-gated backstop (only if residual COLOUR divergence) — NOT
    pre-wired (it can't fix geometry bleed anyway).

### Locked design (post-validation)

- **Draft (initial):** anchor-coherence — anchor view first (data-gated, anchor-prioritised), derived views
  `[structure, signed(anchorRender)]` + fusion-safe directive + shared per-concept seed; fast-fail jobs-only.
- **Final:** per-view condition on the approved-draft render `[structure, signed(approvedRender)]` (lineage
  resolver) + @image-ref directive + shared seed; graceful single-image fallback. No gating.
- **Iteration:** unchanged (kontext single-image); its renders become donors for affected views in the final.
- Cross-cutting: shared per-concept seed; cost-estimate bump; v3→v4; real-fal probe + real-fal-only eval.
