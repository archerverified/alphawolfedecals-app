# Goal 13 — Findings & Defects

Every defect found during the full E2E acceptance run, each marked **FIXED in-goal** or **LOGGED** (follow-up with a concrete repro). Nothing buried in a "looks good."

## Defects (real, in the product/infra)

### D13-1 — Photo upload can hang past timeout (async parse worker) — **FIXED in spec; LOGGED for infra**

- **Repro:** brief → photos step → upload a raster photo (`opaque-logo.png`). The per-photo note (`[data-testid^="photo-note-"]`) renders only after the BullMQ parse worker finishes. On a cold worker / under Upstash free-tier the job can take >120 s or be dropped — the dev log emits `IMPORTANT! Eviction policy is optimistic-volatile. It should be "noeviction"` (BullMQ requires `noeviction`; an evicting Redis can silently drop queued parse jobs).
- **Impact:** the first real-fal journey run timed out at the photos step (120 s) before reaching generation. Mock runs passed only because the worker was warm.
- **Fix (in-goal):** the durable spec's photo step is now **best-effort** — uploads, waits a bounded 45 s, fills the note if it surfaces, screenshots regardless, never blocks (photos are optional per PRD §3).
- **Follow-up (LOGGED):** the parse queue on a Redis with an evicting maxmemory-policy is a production reliability risk for photo/logo parsing. Recommend pinning the parse Redis to `noeviction` (or a dedicated instance) and surfacing a user-visible "still processing…" state with retry rather than an indefinite spinner.

### D13-2 — Editor "Save" control occluded by the success toast — **LOGGED**

- **Repro:** complete a generation → land in the editor on handoff. The green "Final design ready!" toast (top-right) overlaps and hides the top-bar **Save** button until it auto-dismisses (`23-editor-with-art.png`).
- **Impact:** cosmetic / brief unreachability of Save on fresh handoff; autosave + the export API route are unaffected, so the journey isn't blocked.
- **Fix:** toast placement / z-order or offset the top-bar controls. Low severity.

### D13-3 — Duplicated "vector file" copy on the logo step — **LOGGED**

- **Repro:** logo step with a vector SVG shows the green success "Vector file — prints sharp at any size." while the step hint also reads "…or a vector file (SVG/AI/EPS)…". The shared wording makes the success state hard to target/scan (a loose `/vector file/i` matches both).
- **Fix:** reword the success verdict to be distinct from the hint. Cosmetic.

### D13-4 — Generation studio: concept previews can present empty on the cards — **LOGGED**

- **Repro:** `/projects/[id]/generate` after the 3 concepts settle — the generated wrap preview can be missing on the cards (the headline feature lands flat; `20-three-concepts.png`). Likely a render/load timing gap between "concepts ready" and the per-view image painting.
- **Fix:** show a branded skeleton until the preview image decodes; ensure the card binds the first complete render. Medium-high (it's the money shot).

### D13-5 — Landing/welcome/auth are brand-less — **LOGGED (design)**

- The front door is ~95% grayscale; the cyan `#35B6E8` brand accent is almost entirely absent, and the layout reads as generic centered SaaS (AI-Slop C+). Fails the "logo-removed distinctiveness" test where it's seen first.
- **Fix:** brand-forward full-bleed hero (wrapped-vehicle shot, loud AW wordmark, cyan), and thread cyan into active tabs / primary buttons / focus rings app-wide (a cheap, high-impact distinctiveness win).

### D13-6 — Sign-up password strength meter mismatch — **LOGGED**

- **Repro:** `/signup` — the meter can show a short/red bar while the label reads "Strong" (color + label disagree). Trust ding on the auth screen.
- **Fix:** drive bar length, color, and label from the same score.

### D13-7 — Catalogue/vehicle-detail polish — **LOGGED**

- Duplicate "Don't see your vehicle?" line on the catalogue; on vehicle-detail the "Start design" action is a text link, not a primary button (weak primary affordance for the journey's key CTA).

> Full per-page Design + AI-Slop grades in `design-review.md` (Overall Design **B−**, AI-Slop **C+**).
> Note: `26-export-pack.png` captures the export-trigger UI (editor with applied art), not the PDF itself — the actual export proof is the committed `goal-13-export-pack.pdf` (525 KB, Flux.2/C2PA provenance).

## Test-authoring adaptations (selector drift from older specs — NOT app bugs)

- `zone-note-*` / `ai-notes` testids do not exist — those steps render plain `<textarea>`s; scoped via the step container instead.
- Materials / extras option buttons have no testids — targeted by role/name (matches `brief-wizard.spec.ts`).
- The Review step shows the credit cost **on the Generate button** ("Generate 3 concepts — uses 1 credit"), not as a standalone node — asserted there.
- Style presets are `Clean, Aggressive, Luxury, Construction, Racing, Minimalist` — there is no "Bold"; used **Aggressive**.
- Logo color extraction from the SVG (which embeds a raster) is non-deterministic — the brand palette is landed deterministically via the native color picker; `color-extract` is clicked best-effort only.

## Environment / DX observations (for whoever runs this next)

- **No throwaway-local-Postgres harness exists** in the repo; `db:*`/`dev` scripts read `.env`/`.env.local` which point at the LIVE Supabase. Goal 13 stood up a local DB by hand (create DB → `prisma migrate deploy` → `auth_rls.sql` → `ALTER ROLE app_user LOGIN` → copy the `vehicles`/`vehicle_panels` catalogue from live). A documented `db:setup-local` would help.
- A bare brew Postgres lacks the `extensions` schema that `auth_rls.sql` grants on — must `CREATE SCHEMA extensions` first.
- A fresh `git worktree` needs `pnpm install` **and** a workspace package build (`turbo run build --filter=@alphawolf/web^...`) before `next dev` resolves `@alphawolf/db`.
- Next.js loads env from `apps/web/.env.local` (its cwd), **not** the repo-root `.env.local` — runtime DB vars must live there.
- Live `pg_dump` is PG18/server PG17 → strip the PG17-only `SET transaction_timeout` when loading into a PG16 local server.

## Process note (mine, not the product's)

- `nohup … &` inside a `run_in_background` shell double-backgrounds the job: the completion signal fires when the launcher exits, **not** when the wrapped process (playwright) finishes. Twice this read as a premature "failed before generation." Correct pattern: run the long process directly (no `&`) under `run_in_background`, or wait on an explicit until-condition.

## Accessibility (axe WCAG 2.2 AA)

_Recorded after the real-fal pass — see `axe-results.md`._
