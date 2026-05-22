# PR #39 fixup — Sentry PII scrubber (P0)

Paste-ready prompt for a fresh Claude Code session. Single fixup commit on the existing branch (no new PR). Branch protection requires CI green so push then wait for checks.

---

## Pre-flight (run on your Mac, in the repo root)

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
git checkout feat/observability-posthog-sentry
git pull --ff-only
git status --short  # should be clean
```

---

## Prompt to paste into a fresh Claude Code session

````
Apply the PR #39 review fixup. Single P0 — the Sentry inits ship sensitive PII (cookies, auth headers, IPs, query strings, user emails) to Sentry by default, which routes the same data your pgcrypto/PII encryption layer exists to protect to a third-party vendor in plaintext. Fix is a shared scrubber module imported by every Sentry init.

Single commit on top of `feat/observability-posthog-sentry`. No new PR — push to the same branch and CI will gate the merge.

## Read first
- /docs/claude-code-prompts/step-5-fixup-pr39.md (this prompt persisted to disk)
- /apps/api/src/instrument.ts (Node SDK init for the API)
- /services/parse/src/instrument.ts (Node SDK init for the parse worker)
- /apps/web/sentry.server.config.ts (Next.js server-side)
- /apps/web/sentry.edge.config.ts (Next.js edge runtime)
- /apps/web/instrumentation-client.ts (Next.js browser)
- /packages/db/src/client.ts (pattern for the cross-cutting helper module — co-locate similarly)

## Scope — exact changes

### 1. Create the shared scrubber module
Pick one of two homes:
  (a) `packages/observability/src/sentry-scrub.ts` — new tiny package, peer dep on `@sentry/types`. Cleanest if you anticipate adding more observability helpers (metric naming, log shape).
  (b) `packages/db/src/observability/sentry-scrub.ts` re-exported from a new barrel `@alphawolf/observability` via tsconfig path alias. Less ceremony.
Pick (a) unless creating a new package adds material setup cost. Document the choice in the commit message.

File: `packages/observability/src/sentry-scrub.ts` (or chosen path)

```ts
import type { Event, EventHint } from '@sentry/types';

const TOKEN_QUERY_RE = /([?&](?:token|access_token|api_key|key|signature)=)[^&#]*/gi;
const SIGNED_URL_RE = /([?&]token=)[^&#]+/gi;

const HEADERS_TO_DROP = new Set([
  'authorization',
  'cookie',
  'set-cookie',
  'x-csrf-token',
  'x-api-key',
  'proxy-authorization',
]);

function redactUrl(url: string | undefined): string | undefined {
  if (!url) return url;
  return url.replace(TOKEN_QUERY_RE, '$1[redacted]').replace(SIGNED_URL_RE, '$1[redacted]');
}

function scrubHeaders(headers: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!headers) return headers;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(headers)) {
    out[k] = HEADERS_TO_DROP.has(k.toLowerCase()) ? '[redacted]' : v;
  }
  return out;
}

/**
 * Strips PII and credentials from a Sentry event before it's sent.
 * Use as the `beforeSend` option on every Sentry.init() call in the monorepo.
 * Pair with `sendDefaultPii: false` (the Sentry SDK default we explicitly opt into).
 *
 * Drops/redacts:
 *  - event.user.email, event.user.ip_address, event.user.username
 *  - event.request.cookies (whole object)
 *  - sensitive request headers (Authorization, Cookie, X-CSRF-Token, etc.)
 *  - query-string tokens in event.request.url and every breadcrumb URL
 *  - Supabase signed-URL ?token= values everywhere they appear
 */
export function scrubSentryEvent(event: Event, _hint: EventHint): Event | null {
  // user identifiers — keep only the opaque DB id, never email/ip/username
  if (event.user) {
    event.user = {
      id: event.user.id,
    };
  }

  if (event.request) {
    event.request.cookies = undefined;
    event.request.headers = scrubHeaders(event.request.headers as Record<string, unknown> | undefined);
    event.request.url = redactUrl(event.request.url);
    if (event.request.query_string) {
      event.request.query_string = '[redacted]';
    }
  }

  if (Array.isArray(event.breadcrumbs)) {
    event.breadcrumbs = event.breadcrumbs.map((bc) => ({
      ...bc,
      data: bc.data
        ? Object.fromEntries(
            Object.entries(bc.data).map(([k, v]) => [
              k,
              k === 'url' || k === 'to' || k === 'from' ? redactUrl(String(v)) : v,
            ]),
          )
        : bc.data,
    }));
  }

  return event;
}
````

Add a co-located unit test `packages/observability/tests/sentry-scrub.test.ts` (or wherever the module landed) covering:

- `event.user.email` and `ip_address` are stripped, `id` survives
- `event.request.cookies` is undefined after scrub
- `event.request.headers.Cookie` and `Authorization` redacted (case-insensitive)
- `event.request.url` with `?token=abc&foo=bar` → `?token=[redacted]&foo=bar`
- A breadcrumb with `data.url = 'https://x.supabase.co/...?token=eyJ...'` → token redacted
- A clean event with no PII passes through untouched (no false positives)

### 2. Wire the scrubber into every Sentry init

Five files, identical pattern. In each, set `sendDefaultPii: false` (override the PR #39 default of `true`) and pass `beforeSend: scrubSentryEvent`.

#### `apps/api/src/instrument.ts`

```ts
import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';
import { scrubSentryEvent } from '@alphawolf/observability'; // adjust import path to chosen home

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [nodeProfilingIntegration()],
    tracesSampleRate: 1.0,
    profileSessionSampleRate: 1.0,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    environment: process.env.NODE_ENV,
  });
}
```

#### `services/parse/src/instrument.ts`

Same shape as above. Identical settings.

#### `apps/web/sentry.server.config.ts`

```ts
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@alphawolf/observability';

if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    tracesSampleRate: 1.0,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    environment: process.env.NODE_ENV,
  });
}
```

#### `apps/web/sentry.edge.config.ts`

Same shape as `sentry.server.config.ts`. The scrubber module must be edge-runtime-safe (the implementation above is pure JS, no Node APIs — verify your chosen home doesn't accidentally pull `node:`-prefixed imports into the edge bundle).

#### `apps/web/instrumentation-client.ts`

```ts
import * as Sentry from '@sentry/nextjs';
import { scrubSentryEvent } from '@alphawolf/observability';

if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.0,
    replaysOnErrorSampleRate: 0.0,
    sendDefaultPii: false,
    beforeSend: scrubSentryEvent,
    environment: process.env.NODE_ENV,
  });
}
```

Replays are off for this PR — Session Replay captures DOM, which would defeat the scrubber. If you want replays later, that's an ADR-0011 conversation (capture must be PII-aware).

### 3. Verify the scrub actually fires end-to-end

- Run `pnpm --filter @alphawolf/api dev` (or the parse worker) and hit the `/debug-sentry` route.
- Open the Sentry project's issue feed; the test event should appear within ~30s.
- Inspect the event detail in Sentry's UI: confirm `user.email` is absent, `request.cookies` is absent, headers show `[redacted]` for `Cookie`/`Authorization`. Screenshot the event for the PR description.

### 4. Document the boundary

- Append a short section to `/docs/vault/70-quick-reference.md` under a new "Observability" heading:
  - Sentry is opt-in via `SENTRY_DSN` / `NEXT_PUBLIC_SENTRY_DSN`. No DSN → no init → no events.
  - Every init MUST pass `beforeSend: scrubSentryEvent`. Never use `sendDefaultPii: true`. Never add a new `Sentry.init` without importing the scrubber.
  - To add a new captured field, audit it for PII first; if it could carry user identifiers, add a scrub rule to `scrubSentryEvent` before merging.
- Add a top-5 pattern entry to `/docs/vault/00-START-HERE.md` Critical Learnings: "Third-party observability bypasses the encryption boundary unless every init scrubs. Never `sendDefaultPii: true`."

### 5. (Optional, recommend) ESLint rule to prevent regression

- Add a `no-restricted-syntax` rule to `eslint.config.mjs`:
  ```js
  {
    selector: "Property[key.name='sendDefaultPii'][value.value=true]",
    message: "Sentry sendDefaultPii must be false. Use the shared scrubber instead — see packages/observability/src/sentry-scrub.ts.",
  },
  {
    selector: "CallExpression[callee.object.name='Sentry'][callee.property.name='init'] > ObjectExpression:not(:has(Property[key.name='beforeSend']))",
    message: "Every Sentry.init must pass beforeSend: scrubSentryEvent.",
  },
  ```
- This catches both regressions: turning `sendDefaultPii` back on, and any future `Sentry.init` that forgets the scrubber.

## Tests

- `packages/observability/tests/sentry-scrub.test.ts` — the six cases listed in step 1.
- Existing `turbo run lint typecheck test` must stay green (no behavior change in any non-Sentry path).

## Done definition

- All five `Sentry.init` calls pass `sendDefaultPii: false` and `beforeSend: scrubSentryEvent`
- Shared scrubber module exists, is unit-tested, and exports `scrubSentryEvent`
- `/debug-sentry` manual test shows a scrubbed event in the Sentry UI (screenshot in PR description)
- `pnpm turbo run lint typecheck test` green
- CI green on the branch
- `/docs/vault/70-quick-reference.md` "Observability" section added
- `/docs/vault/00-START-HERE.md` Critical Learnings updated
- /activities.md updated with a "PR #39 review fixup: Sentry PII scrubber" entry
- (Optional) ESLint guard from step 5 added

## Commit message

```
fix(pr-39): scrub PII from every Sentry event

PR #39 set sendDefaultPii: true with no beforeSend across all five
Sentry inits (apps/api, services/parse, apps/web server/edge/client).
That bypassed the pgcrypto encryption boundary by routing cookies,
Authorization headers, user emails, IPs, and Supabase signed-URL
tokens to a third-party vendor in plaintext.

- new shared module packages/observability/src/sentry-scrub.ts
- set sendDefaultPii: false on every Sentry.init
- import scrubSentryEvent as beforeSend on every Sentry.init
- unit tests for the scrubber (cookies, headers, query tokens, breadcrumbs)
- ESLint guard against regressions (sendDefaultPii=true, missing beforeSend)
- vault docs: Observability section + Critical Learning entry
```

## Hard constraints

- No expansion into Session Replay, PostHog scrubbing, or log routing — separate concerns, separate PRs.
- The scrubber must be edge-runtime-safe (no `node:` imports anywhere in its module graph). If your chosen home accidentally pulls Node-only deps, refactor before push.
- Do NOT remove `tracesSampleRate: 1.0` / `profileSessionSampleRate: 1.0` in this PR — quota-management is a follow-up, not a security fix.
- Branch protection enforced. Push then wait for CI green.
- **Never paste a real Sentry DSN, real cookie value, or real Authorization header into chat output or commit messages**, including test fixtures. Use synthetic values like `https://[redacted]@sentry.io/0` and `Bearer test`.

## After committing the fixup — open follow-up GH issues

After the fixup commit pushes and CI goes green, batch-open the deferred follow-up issues so they don't get lost. Use `gh issue create` for each. Title, body, labels are spelled out below. If a label doesn't exist in the repo yet, create it once via `gh label create <name> --color <hex>` (suggested colours noted) before opening issues that use it.

### Suggested labels (create once if missing)

- `epic` (purple `8b5cf6`) — parent issues that group sub-issues
- `phase-2` (blue `3b82f6`) — Phase 2 polish / AI prep
- `architecture` (slate `64748b`)
- `adr` (zinc `52525b`)
- `security` (red `dc2626`)
- `tech-debt` (amber `f59e0b`)
- `observability` (teal `0d9488`)

### EPIC #1 — Phase 2 frontend polish

```
gh issue create \
  --title "[EPIC] Phase 2 frontend polish — layer panel, properties inspector, thumbnails, drag-drop, responsive, armed click-to-place" \
  --label "epic,phase-2,frontend" \
  --body "Parent for the six deferred editor polish items surfaced in the PR #38 review. Each sub-issue is independently shippable; the epic exists to sequence them before Phase 2 AI generation lands (so the editor surface is stable when AI features attach to it).

**Sub-issues** (link as they're opened):
- [ ] Layer panel
- [ ] Properties inspector
- [ ] Project thumbnails
- [ ] Drag-and-drop upload onto canvas
- [ ] Responsive editor (drawer-collapse below md:)
- [ ] Armed click-to-place cursor (replaces fixup option (b))

**Definition of done for the epic:** all six children merged, /projects gallery shows thumbnails, editor works thumb-to-fingertip on a 13\" laptop in portrait window, AI generation panel can mount in the existing inspector sidebar without UI rewrite.

Surfaced by: review of PR #38 (commit 7079b00, fixup commit on top)."
```

### Children of EPIC #1

```
gh issue create \
  --title "Phase 2 polish: layer panel (z-order, visibility, lock per element)" \
  --label "phase-2,frontend" \
  --body "**Context:** the canvas-state schema already has zIndex per element; useEditorStore has selection but no visibility/lock state per element yet.

**Scope:**
- Add \`visible: boolean\` and \`locked: boolean\` to ElementBase in packages/canvas/src/schema/types.ts (default true/false). Run a schema migration: bump SchemaVersion to 2, add migrate(1→2) that fills missing fields.
- New apps/web/components/editor/LayerPanel.tsx — shadcn Card listing elements in the active panel in z-order, with toggle buttons for visibility (Eye / EyeOff) and lock (Lock / Unlock).
- Drag-to-reorder via dnd-kit/sortable (already a sibling-pkg pattern in React 19).
- Hide hidden elements from render; ignore selection/move on locked elements.

**Done definition:** Vitest covers the schema migration; Playwright covers toggle + reorder; 60fps benchmark still passes."
```

```
gh issue create \
  --title "Phase 2 polish: properties inspector (fill, stroke, font, size, rotation, opacity)" \
  --label "phase-2,frontend" \
  --body "**Context:** all element fields exist in the canvas-state schema; none are editable from the UI today.

**Scope:**
- New apps/web/components/editor/PropertiesInspector.tsx — shadcn Card + Form rendering type-discriminated fields for the selected element. Text: content, fontFamily, fontSize, fill, align. Shape: kind, fill, stroke, gradient. Image: opacity, finishSwatch.
- Common controls (all element types): x/y, rotation, scaleX/scaleY, opacity, zIndex (read-only — surface 'Move to front/back' buttons).
- Wire dispatches through useEditorStore.updateElement(id, patch) as undoable commands.

**Done definition:** every field in the canvas-state schema is reachable from the inspector; Vitest covers update commands undo/redo; manual test confirms autosave fires on inspector change."
```

```
gh issue create \
  --title "Phase 2 polish: project thumbnails (PNG snapshot via stage.toDataURL on save)" \
  --label "phase-2,frontend" \
  --body "**Context:** /projects gallery currently shows vehicle outline only — no preview of the user's actual artwork.

**Scope:**
- On debounced autosave (after the DB write succeeds), generate stage.toDataURL({ pixelRatio: 0.5, mimeType: 'image/png' }) for the active view.
- POST as base64 to a new server action saveThumbnail(projectId, dataURL) that uploads to project-assets bucket under \`{userId}/{projectId}/thumb.png\` and writes the URL into a new projects.thumb_url column.
- /projects renders thumb_url with shadcn Skeleton fallback; falls back to vehicle outline if thumb_url is null.

**Done definition:** new column migration; signed 24h URL minted on /projects render; integration test confirms cross-tenant thumb access denied."
```

```
gh issue create \
  --title "Phase 2 polish: drag-and-drop upload onto canvas" \
  --label "phase-2,frontend" \
  --body "**Context:** uploads today require clicking through the UploadPanel + Crop dialog. Power users (Mara persona, PRD §3.2) want to drag a file straight onto the canvas.

**Scope:**
- Wire react-dropzone (or HTML5 dnd directly) on the CanvasStage host. Drop file → reuse existing assetUpload action (signed-URL chunked upload) → place at drop coordinates in the active panel.
- Visual cue: outline the active panel in indigo on dragenter; revert on dragleave/drop.
- Multiple files queued sequentially with toast progress per file.

**Done definition:** Playwright covers drop-on-panel → element placed at drop coords; toast fires per file."
```

```
gh issue create \
  --title "Phase 2 polish: responsive editor (drawer-collapse below md:)" \
  --label "phase-2,frontend" \
  --body "**Context:** the editor is desktop-first per PRD scope, but a 13\" laptop in portrait window today crops the tool palette and inspector.

**Scope:**
- Below md: (768px) collapse the right inspector into a shadcn Sheet (drawer from right) toggled by a Tool icon in the top bar.
- Tool rail stays fixed left, becomes icon-only (no labels) below md:.
- Canvas takes the freed space.

**Done definition:** Playwright at 1280×800 (desktop), 768×1024 (split-screen portrait), 1366×768 (small laptop) all render usable editors; no regression on 1920×1080."
```

```
gh issue create \
  --title "Phase 2 polish: armed click-to-place cursor (replaces fixup option (b))" \
  --label "phase-2,frontend" \
  --body "**Context:** PR #38 fixup chose option (b) — 'Add text/Add shape' + cascade placement at panel centre. Option (a) — an armed placement cursor — was deferred. This issue is the upgrade path.

**Scope:**
- Clicking 'Add text' or 'Add shape' arms a placement mode (toggle the tool button's data-state='on', show a cursor crosshair).
- Next click on canvas places the element at the click point; clears arm; toast confirms placement.
- Esc cancels arm without placing.
- Re-clicking the same tool button while armed disarms.

**Done definition:** Playwright covers arm → place → autosave; arm → Esc → no placement; tooltip explains the affordance."
```

### EPIC #2 — Architecture follow-ups

```
gh issue create \
  --title "[EPIC] Architecture follow-ups — mint helpers, view-layout move, tab-divergence, SchemaVersion broaden, transfer atomicity" \
  --label "epic,architecture,tech-debt" \
  --body "Parent for the five deferred architecture items surfaced in the PR #38 review. None are blockers; all reduce future change cost.

**Sub-issues:**
- [ ] Type-safe signed-URL mint helpers
- [ ] Move computeViewLayouts to packages/canvas
- [ ] BroadcastChannel tab-divergence heartbeat
- [ ] Broaden SchemaVersion union from 1-as-const
- [ ] GH-012 transfer atomicity design

Surfaced by: review of PR #38."
```

### Children of EPIC #2

```
gh issue create \
  --title "Architecture: mintAssetReadUrl / mintAssetUploadUrl type-safe helpers around signed URL minting" \
  --label "architecture,tech-debt,security" \
  --body "**Context:** code in apps/web/lib/actions/asset.ts mints signed URLs by calling \`signedAssetReadUrl\` directly. Authorization (\`projects.getAsset(userId, assetId)\` under withUser) is done by the calling action, but the boundary is by convention — a new caller could mint without first authorizing.

**Scope:**
- New \`mintAssetReadUrl(userId, assetId, opts?)\` and \`mintAssetUploadUrl(userId, assetId, filename, opts?)\` in packages/db/src/storage/supabase.ts.
- Both call \`projects.getAsset(userId, assetId)\` under withUser BEFORE minting; throw if user does not own the asset.
- Mark the raw \`signedAssetReadUrl\` as \`@internal\`; remove from the package barrel.
- Replace all existing call sites in apps/web/lib/actions/*.ts.

**Done definition:** grep for \`signedAssetReadUrl\` returns only the internal definition + the new helpers; integration test confirms cross-tenant mint denied."
```

```
gh issue create \
  --title "Architecture: move computeViewLayouts from CanvasStage.tsx into packages/canvas/src/geometry/view-layout.ts" \
  --label "architecture,tech-debt" \
  --body "**Context:** \`computeViewLayouts\` in apps/web/components/editor/CanvasStage.tsx:46-77 is pure geometry (no React/DOM/Konva). Phase 3 export and Phase 3 paneling will both need it; today it'd be duplicated.

**Scope:**
- Move to packages/canvas/src/geometry/view-layout.ts.
- Add Vitest covering the four view positions (front/driver/back/passenger) at the spec'd viewBox 0 0 4800 1200.
- Re-import in CanvasStage.tsx.

**Done definition:** no behavior change; canvas package still type-checks DOM-lib-free."
```

```
gh issue create \
  --title "Architecture: BroadcastChannel tab-divergence heartbeat keyed on versionId" \
  --label "architecture,tech-debt" \
  --body "**Context:** today, opening the same project in two tabs is detected only on reload (the 'saved elsewhere — reloading' toast). User loses any unsaved work in the second tab.

**Scope:**
- New BroadcastChannel(\`project:\${projectId}\`) in useEditorStore. Tab on mount publishes \`{ versionId, tabId, openedAt }\`.
- Each tab listens; if it sees another tab on the same project with an older openedAt, the newer tab opens read-only with a 'Take over editing' button.
- 'Take over' bumps openedAt and publishes; the older tab demotes to read-only with 'Editing moved to another tab'.

**Done definition:** Playwright covers two-tab scenario; takeover transitions both tabs cleanly."
```

```
gh issue create \
  --title "Architecture: broaden SchemaVersion from \`1 as const\` to \`1 | 2 | …\` union" \
  --label "architecture,tech-debt" \
  --body "**Context:** packages/canvas/src/schema/versions.ts types SchemaVersion as \`1 as const\`. When v2 lands, every consumer that asserts \`schemaVersion === 1\` will type-error — sweeping refactor.

**Scope:**
- Change to \`export type SchemaVersion = 1 | 2;\` now (2 is unused but reserved).
- Add a migrate(1, 2) stub that returns the input unchanged with a TODO comment.
- All existing code that narrows on \`schemaVersion === 1\` continues to compile; v2 work later adds the second branch.

**Done definition:** no behavior change; type-checks pass; migrate-on-load registry remains correct."
```

```
gh issue create \
  --title "Architecture: GH-012 transfer atomicity — single withSystem txn for owner reassignment" \
  --label "architecture,security" \
  --body "**Context:** the schema reserves \`projects.transferToken\` (NULL when not transferring). No transfer function exists yet. When GH-012 (shop → customer handoff) ships, the transfer must be atomic across three tables.

**Scope:**
- New \`projects.transferProject(token, newOwnerUserId)\` repo function inside a single withSystem txn:
  1. SELECT project WHERE transfer_token = token (else throw).
  2. UPDATE projects SET owner_user_id = newOwnerUserId, transfer_token = NULL WHERE id = projectId.
  3. UPDATE project_assets SET owner_user_id = newOwnerUserId WHERE project_id = projectId.
  4. INSERT audit row.
- Document the 24h residual signed-URL access window in the ADR (any URL minted before transfer remains valid until TTL expires — that's the design).

**Done definition:** integration test covers happy-path transfer + invalid-token reject + the residual-URL window."
```

### ADR #1 — UI patterns lock-in

```
gh issue create \
  --title "ADR-0010: UI patterns lock-in (Form library, ToggleGroup vs Tabs for tool palette, Sonner for toasts)" \
  --label "adr" \
  --body "**Context:** PR #38 installed 16 shadcn components without documenting which patterns are now load-bearing. Future contributors need to know which choices are 'we picked one — keep using it' vs 'pick whatever fits'.

**Scope of the ADR:**
- Form library: which Form abstraction across the app (shadcn Form + react-hook-form + zod resolver — confirm)
- Tool palette: ToggleGroup type='single' OR Tabs — lock in the choice
- Toasts: Sonner (currently) — confirm it stays
- Empty states: shadcn Card with CTA — confirm pattern
- Color tokens: bg-zinc-* hard-coded vs shadcn CSS vars (bg-background/bg-muted/bg-card) — decide and document migration path

**Done definition:** docs/adr/0010-ui-patterns-lock-in.md committed; vault 00-START-HERE.md updated to reference it."
```

### ADR #2 — observability boundaries

```
gh issue create \
  --title "ADR-0011: observability boundaries (instrument-first, no-DSN-no-op, scrubber required, PostHog scope)" \
  --label "adr,observability,security" \
  --body "**Context:** PR #39 (and its fixup) established a pattern for Sentry init + PII scrubbing. Codify so future observability surfaces (Session Replay, OpenTelemetry, log shipping) inherit the rules.

**Scope of the ADR:**
- Sentry init must be instrument-first (import './instrument' as the FIRST import of the entry point)
- No DSN → no init → no events; never log a 'Sentry disabled' warning that itself contains identifiers
- Every Sentry.init MUST pass beforeSend: scrubSentryEvent (ESLint guard enforces)
- sendDefaultPii: false everywhere; opt-in to specific fields per call site if needed
- PostHog scope: services/ai only for now; if it lands in apps/web later, scrubbing rules from this ADR apply
- Session Replay is OFF in this phase (would defeat the scrubber); revisit only with a separate ADR
- Sentry tracesSampleRate / profileSessionSampleRate are 1.0 for launch; calendar a ratchet-down before traffic ramps

**Done definition:** docs/adr/0011-observability-boundaries.md committed; vault 00-START-HERE.md updated to reference it; quick-reference Observability section links to ADR."
```

### Security follow-ups

```
gh issue create \
  --title "Security: replace regex SVG sanitiser with svgo when adding next file type OR before security audit" \
  --label "security,tech-debt" \
  --body "**Context:** PR #38 fixup hardened the regex SVG sanitiser (script/style/@import/data:/namespaced on*) with test coverage. Regex parsing XML is fundamentally bypassable via entity encoding, CDATA tricks, or namespace abuse the current tests don't cover.

**Risk today is bounded** (Konva renders, not innerHTML; only attack vector is opening a 24h signed URL in a raw browser tab), so this is P2.

**Scope:**
- Replace converters.ts regex sanitiser with svgo + a hardening preset that removes script/style elements and all on*/xlink:on* attrs.
- Keep the existing test cases; add tests for: SVG with HTML entity-encoded \`&#x3c;script&gt;\`, SVG with CDATA-wrapped script, SVG with malformed but parseable namespace.
- Verify benign SVG round-trip — svgo's default config reformats; pick a 'minimal' plugin set to keep diffs small.

**Trigger:** open work on this when adding the next file type (HEIC vector if it ships) or before any security audit, whichever comes first."
```

```
gh issue create \
  --title "Security: add 'server-only' import to packages/db/src/storage/supabase.ts (block accidental client import)" \
  --label "security,tech-debt" \
  --body "**Context:** getServiceClient() holds the sb_secret_... service-role key. Today a future client component that accidentally imports from @alphawolf/db/storage/supabase would compile and leak the key into the client bundle.

**Scope:**
- Add \`import 'server-only';\` as the first import of packages/db/src/storage/supabase.ts.
- Add a build-time test (or just a 'pnpm build' check) confirming the file isn't reachable from any client bundle.

**Done definition:** intentional misuse (a client component importing from this module) fails the Next.js build with a clear error."
```

```
gh issue create \
  --title "Tech-debt: shorten signed-URL TTL to 1h for 'still processing' state, 24h only for parsed result" \
  --label "tech-debt,security" \
  --body "**Context:** apps/web/lib/actions/asset.ts mints 24h signed URLs on every poll. During parse polling, that re-issues a fresh long-lived URL on every call.

**Scope:**
- Split the helper: \`mintAssetReadUrl(userId, assetId, { phase: 'processing' | 'ready' })\`. Processing → 1h TTL. Ready → 24h.
- Update poll callers to pass phase='processing'.

**Done definition:** unit test asserts TTL by phase; manual test confirms polling URL expires in ~1h."
```

```
gh issue create \
  --title "Tech-debt: timeout / Promise.race wrap on services/parse/src/rembg.ts replicate.run" \
  --label "tech-debt,observability" \
  --body "**Context:** replicate.run has no timeout. A hung Replicate model holds a BullMQ worker slot indefinitely.

**Scope:**
- Wrap in \`Promise.race([replicate.run(...), new Promise((_, r) => setTimeout(() => r(new Error('rembg timeout')), 60_000))])\`.
- Failure path: mark parse_status = 'failed' with parse_metadata.error = 'rembg_timeout'.
- Alternative: tune BullMQ lockDuration in JOB_OPTS instead.

**Done definition:** unit test asserts timeout fires; manual test by mocking a sleeping promise."
```

```
gh issue create \
  --title "Tech-debt: gate or remove PostHog /health capture (k8s probe will burn quota)" \
  --label "tech-debt,observability" \
  --body "**Context:** services/ai/app/main.py captures a PostHog event on every /health request. Under k8s liveness probes (every 5s), that's ~518k events/month per pod — eats the free-tier quota by itself.

**Scope:**
- Drop the /health capture entirely (it's noise), OR
- Gate behind a sampling rate < 0.01 and a separate 'health-check-traffic' event name for analytics filtering.

**Done definition:** /health no longer produces a PostHog event in standard config; doc the decision in ADR-0011."
```

```
gh issue create \
  --title "Cleanup: drop dead POSTHOG_KEY from .env.example (only POSTHOG_API_KEY is read)" \
  --label "tech-debt" \
  --body "**Context:** PR #39 .env.example lists both POSTHOG_KEY and POSTHOG_API_KEY. services/ai/app/main.py reads only POSTHOG_API_KEY. Dead var is a footgun.

**Scope:**
- Remove POSTHOG_KEY from .env.example.
- Add a note in /docs/vault/70-quick-reference.md observability section that the var name is POSTHOG_API_KEY (not POSTHOG_KEY).

**Done definition:** grep for POSTHOG_KEY in the repo returns zero hits."
```

### One-shot bash to open all of the above

If you trust the bodies as written, here's the loop. Otherwise, open one at a time and tweak interactively.

```bash
# Sanity-check labels exist (create any missing once)
for L in "epic:8b5cf6" "phase-2:3b82f6" "architecture:64748b" "adr:52525b" "security:dc2626" "tech-debt:f59e0b" "observability:0d9488"; do
  NAME="${L%%:*}"; COLOR="${L##*:}"
  gh label create "$NAME" --color "$COLOR" 2>/dev/null || true
done

# Then run each `gh issue create` block above in sequence.
# After all are opened, run `gh issue list --limit 30` and confirm count + titles.
```

Done definition for this step: at least 16 issues opened (2 epics + 6 Phase 2 children + 5 architecture children + 2 ADRs + 5 security/tech-debt singletons); the two epic issues edited to link the child issue numbers; /activities.md appended with a "Opened review follow-up issues" entry listing the issue numbers.

```

```
