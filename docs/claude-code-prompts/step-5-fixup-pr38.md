# PR #38 fixup — Step 5 P0s + P1s (Toaster, a11y, autosave race, MIME, SVG, autosave error UI)

Paste-ready prompt for a fresh Claude Code session. Single fixup commit on the existing branch (no new PR). Branch protection requires CI green so push then wait for checks.

---

## Pre-flight (run on your Mac, in the repo root)

```bash
cd /Users/ashton/Documents/AlphaWolfDecals-App
git checkout feat/gh-005-008-asset-upload-canvas-editor
git pull --ff-only
git status --short  # should be clean
```

---

## Prompt to paste into a fresh Claude Code session

````
Apply the PR #38 review fixup. Single commit on top of `feat/gh-005-008-asset-upload-canvas-editor`. No new PR — push to the same branch and the CI run will gate the merge.

## Goals (in priority order)
P0: Mount Sonner Toaster; out-of-bounds cue accessibility (aria-live + non-color signal); keyboard accessibility for the canvas (selection, nudge, delete).
P1: Autosave race fix (pendingFlush re-arm); autosave error retry UI; MIME magic-byte sniff; SVG sanitizer hardening; wire the vehicle-detail "Start designing" CTA to the real StartProjectButton; tool-palette "click to place" intent; Slider a11y labels.

## Read first
- /docs/claude-code-prompts/step-5-fixup-pr38.md (this prompt persisted to disk)
- /apps/web/app/layout.tsx (Toaster mount point)
- /apps/web/components/editor/* (CanvasEditor, CanvasStage, OverlayLayer, UploadPanel, useAutosave, elements/*)
- /apps/web/lib/actions/asset.ts (the action wired to UploadPanel)
- /services/parse/src/mime.ts (the MIME allowlist)
- /services/parse/src/converters.ts (the SVG sanitiser)
- /services/parse/src/process.ts (where magic-byte sniff slots in if added here instead of mime.ts)
- /apps/web/app/vehicles/[id]/page.tsx (the disabled CTA)
- /packages/ui/src/components/ui/sonner.tsx (exports Toaster)

## Scope — exact changes

### 1. Mount Sonner Toaster (P0)
File: `apps/web/app/layout.tsx`
- Import `Toaster` from `@alphawolf/ui` (or wherever the sonner barrel lands; if it's not in the package barrel, add it to `packages/ui/src/index.ts` first).
- Render `<Toaster richColors closeButton position="top-right" />` inside `<body>`, after `{children}`. Match the existing `apps/web/components/auth/*` visual palette (zinc).
- Verify: grep `<Toaster` returns exactly one hit after the change. Every existing `toast.success`/`toast.error` in `UploadPanel.tsx`, `useAutosave.ts`, `StartProjectButton.tsx`, `RenameDialog.tsx`, `DeleteProjectButton.tsx` is now visible.

### 2. Out-of-bounds cue — accessibility (P0)
Files: `apps/web/components/editor/OverlayLayer.tsx`, `apps/web/components/editor/CanvasEditor.tsx`
- OverlayLayer currently renders a red dashed Konva Rect (#ef4444) only. Keep the red Rect (it's a useful primary cue) but ADD:
  - A secondary visual cue that doesn't rely on color: an icon badge (use `lucide-react`'s `AlertTriangle`) anchored to the top-left of the cue rect, OR a hatched fill pattern overlay. Use whichever doesn't measurably hurt the 60fps benchmark.
  - An `aria-live="polite"` region on the editor host (NOT inside Konva — Konva is a `<canvas>` and is opaque to assistive tech). Mount in `CanvasEditor.tsx` as a visually-hidden div: `<div role="status" aria-live="polite" className="sr-only">{cueVisible ? 'Element is outside the printable area' : ''}</div>`. Wire from the same selector that drives OverlayLayer's cue visibility.
- Verify: pull up macOS VoiceOver, drag an element outside the wrap-safe path; VoiceOver should announce "Element is outside the printable area" within ~1s of the cue appearing. Drag back inside and the announcement should stop (the div empties).

### 3. Canvas keyboard accessibility (P0)
Files: `apps/web/components/editor/CanvasEditor.tsx`, `apps/web/components/editor/CanvasStage.tsx`
- Wrap the Konva Stage in a focusable host: `<div tabIndex={0} onKeyDown={handleKey} className="outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 rounded-md">…stage…</div>`.
- Implement `handleKey`:
  - Tab / Shift+Tab: cycle selection through elements in z-order within the active panel. Wrap around.
  - Arrow keys: nudge selected element by 1px in canvas units. Shift+Arrow nudges by 10px. Use `useEditorStore.translateSelected(dx, dy)` (add this action if it doesn't exist).
  - Delete / Backspace: already wired at `CanvasEditor.tsx:277-288`. Keep, but confirm it fires when the canvas host has focus and no input element is focused.
  - Cmd/Ctrl+A: select all elements in the active panel (add `selectAllInPanel(panelId)` if missing).
  - Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z: confirm undo/redo still fire from this host (they should — those are already on the document).
- Add a "Press Tab to navigate the canvas, arrow keys to move, Delete to remove" hint in a `Tooltip` on the focusable host (shadcn Tooltip) so the affordance is discoverable.
- Verify: in a browser, unplug your mouse mentally. Tab into the canvas, Tab through elements (focus ring on selected), arrow-nudge, Delete. All paths work.

### 4. Autosave race fix (P1)
File: `apps/web/components/editor/useAutosave.ts`
- Current: `doSave` returns early when `inFlight` is true, never re-arming.
- Add a `pendingFlush` ref (boolean). When `flushNow()` / `visibilitychange` / `beforeunload` fire during an in-flight save, set `pendingFlush = true` and return.
- In the `finally` block of `doSave`, after the in-flight unlock, check `pendingFlush`; if true, clear it and immediately call `doSave()` again (not `schedule()`).
- Verify: add a Vitest unit test in `apps/web/components/editor/useAutosave.test.tsx`. Mock the action with a 50ms delay. Fire `flushNow()` at t=0 and again at t=10ms while the first is in flight. Assert the action is called exactly twice and the second call sees the latest doc.

### 5. Autosave error retry UI (P1)
File: `apps/web/components/editor/CanvasEditor.tsx:386`
- Current: the autosave status switch has no branch for `'error'` and falls through to `null`.
- Add a third branch:
  ```tsx
  autosave.status === 'error' ? (
    <button
      type="button"
      onClick={() => autosave.flushNow()}
      className="text-xs font-medium text-red-600 hover:text-red-700"
      aria-label="Retry save"
    >
      Save failed — retry
    </button>
  ) : null
````

- Verify: temporarily throw from `saveCanvasAction` server-side, drive the editor, see the retry button render; click it, see it re-fire.

### 6. MIME magic-byte sniff (P1)

File: `services/parse/src/mime.ts` and `services/parse/src/process.ts`

- Remove `'application/octet-stream'` from the `VECTOR_AI` set in `mime.ts` (it's a footgun — browsers send it for any unknown vector).
- In `services/parse/src/process.ts`, before handing the asset to a converter, read the first 1024 bytes (or use `file-type` npm package — it's already MIT-licensed and small) and assert the sniffed type matches the claimed MIME. Reject mismatches with `parse_status = 'rejected_mime_mismatch'`.
- For AI/EPS: real AI files start with `%!PS-Adobe-` (PostScript header) or `%PDF-` (modern AI is PDF-compatible). Real EPS starts with `%!PS-Adobe- … EPSF-`. Sniff these explicitly.
- For PDF: starts with `%PDF-`.
- For SVG: starts with `<?xml` or `<svg` (after BOM/whitespace).
- For PNG: `\x89PNG\r\n\x1a\n`. For JPG: `\xFF\xD8\xFF`. (`file-type` handles all of these — prefer it over hand-rolled sniffs.)
- Update `parse_status` enum in the schema if a new state is added; otherwise add a `parse_error` JSONB column entry so the editor can surface "this file isn't what you said it was."

### 7. SVG sanitiser hardening (P1)

File: `services/parse/src/converters.ts`

- Current sanitiser (regex around lines 48-56) handles `javascript:` in `href`/`xlink:href` but misses:
  - `<style>…@import url(…)</style>` and `<style>…</style>` containing arbitrary CSS expressions
  - `data:` URIs in `<image href="data:…">`, `<use href="data:…">`, `<a href="data:…">`
  - Namespaced event handlers: any `xlink:on*`, `on*` attribute regardless of namespace
  - `<foreignObject>` (verify it's already stripped — recap says it is, double-check)
- Best fix: drop the regex sanitiser and use `svgo` with a hardening config (already a dep — same one used in apps/web's externals). Preset:
  ```js
  import { optimize } from 'svgo';
  const result = optimize(svgString, {
    plugins: [
      { name: 'removeScriptElement' },
      { name: 'removeStyleElement' },
      { name: 'removeAttrs', params: { attrs: '(on.*|xlink:on.*|xlink:href|href)' } },
      // re-add safe href values after, via a second pass that only allows http(s)/#fragment
    ],
  });
  ```
  Apply this to BOTH the inkscape SVG output (AI/EPS → SVG) and the pdf2svg output.
- Verify: add a Vitest test in `services/parse/tests/sanitiser.test.ts` covering:
  - SVG with `<script>alert(1)</script>` → script tag removed
  - SVG with `<style>@import url(http://evil.com/x.css)</style>` → style tag removed
  - SVG with `<image href="data:text/html,<script>...</script>"/>` → href stripped or whole element removed
  - SVG with `<a xlink:onclick="...">` → xlink:onclick stripped
  - Benign SVG with `<path d="M0 0..."/>` → unchanged

### 8. Wire the vehicle-detail "Start designing" CTA (P1)

File: `apps/web/app/vehicles/[id]/page.tsx:69-76`

- Replace the disabled placeholder ("Start designing (editor — GH-008)") with the real `<StartProjectButton vehicleId={vehicle.id} defaultName={`${vehicle.year} ${vehicle.make} ${vehicle.model}`} csrfToken={csrfToken} />`.
- Confirm the `csrfToken` is sourced the same way as `apps/web/app/projects/page.tsx` does.
- Verify in browser: navigate to a vehicle detail page, click Start Designing, land on `/projects/[id]/editor` with the vehicle pre-loaded.

### 9. Tool palette "click to place" intent (P1)

File: `apps/web/components/editor/CanvasEditor.tsx:411-444` (text + shape tool buttons)

- Current: clicking Text or Shape spawns immediately at (400, 400). Four clicks stacks four elements.
- Pick one of two fixes:
  - (a) Switch to "armed" mode: clicking the tool button arms a placement cursor; the next click on the canvas places the element at that location. Toggle the tool button's `data-state="on"` while armed. Esc cancels.
  - (b) Rename the button copy to "Add text" / "Add shape" so the label matches behavior, and spawn at the center of the visible panel (not the global stage center) so repeated clicks cascade by ~40px to avoid stacking.
- Pick (a) if it's <2h of work; otherwise (b). Document choice in the commit message.

### 10. Slider accessibility labels (P1)

Files: `apps/web/components/editor/UploadPanel.tsx:291`, `apps/web/components/editor/CanvasEditor.tsx:371`

- Each `<Slider>` currently has a nearby `<Label>` but no `htmlFor`/`id` link and no `aria-label` on the Slider itself.
- Add `id="slider-<purpose>"` on the Slider and `htmlFor="slider-<purpose>"` on the Label, OR pass `aria-label="<purpose>"` directly to the Slider. shadcn's Slider primitive supports both.
- Verify with browser dev tools accessibility panel.

## Tests

- `apps/web/components/editor/useAutosave.test.tsx` — the race-reentry test from step 4.
- `services/parse/tests/sanitiser.test.ts` — the five sanitiser cases from step 7.
- `services/parse/tests/mime-sniff.test.ts` — verify rejection of mismatched magic bytes.
- Existing Playwright `editor.spec.ts` — extend with a "drag outside, see OOB cue, hear aria-live announcement" assertion (use `getByRole('status')` and assert `textContent`).

## Done definition

- `pnpm turbo run lint typecheck test` green locally
- `pnpm --filter @alphawolf/db test:integration` still green
- CI green on the branch (the three required contexts: Node, Python ai, Python paneling)
- VoiceOver announces the OOB state when triggered (manual test)
- Tab-into-canvas → arrow-nudge → Delete works with no mouse
- Toaster fires for at least one upload success and one save failure in manual testing
- `vehicles/[id]` Start Designing button lands on the editor
- /activities.md updated with a "PR #38 review fixup" entry referencing each P0/P1 by short name
- /docs/vault/70-quick-reference.md updated if any new test commands were added

## Commit message

```
fix(pr-38): address review P0s and P1s

P0:
- mount Sonner Toaster in root layout (fixes silent toast failures)
- add aria-live announcement + non-color secondary cue to OOB state
- add keyboard accessibility (Tab/Arrow/Delete) to Konva canvas

P1:
- close useAutosave race with pendingFlush re-arm
- add autosave error retry button
- tighten parse worker MIME (remove octet-stream, magic-byte sniff)
- harden SVG sanitiser via svgo (removeScript/Style/on-attrs)
- wire StartProjectButton on /vehicles/[id]
- tool palette click-to-place intent
- Slider a11y labels
```

## Hard constraints

- No scope expansion. The follow-up issues (layer panel, properties inspector, project thumbnails, drag-drop upload, responsive editor, ADR-0010/0011) DO NOT belong in this commit — open as GH issues if not already.
- No new shadcn components unless absolutely required by the listed fixes (Tooltip and Toggle are already installed).
- Keep the 60fps benchmark passing. The OOB icon + hatched fill should not regress it; run the benchmark before pushing.
- Branch protection enforced. Push then wait for CI green.

```

```
