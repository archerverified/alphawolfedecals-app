---
name: design-review
description: "Designer-who-codes visual audit of a SHIPPED or live web UI, then fixes what it finds with minimal atomic commits and before/after screenshots. Reviews against a 10-category ~80-item design checklist and an AI-slop blacklist, produces dual Design + AI-Slop letter grades, then runs a triaged fix loop. Use whenever the user asks for a 'design review', 'visual audit', 'design QA', 'before/after', or a 'pre-launch design check'; wants to know if their site 'looks AI-generated' / 'looks like AI slop' / 'looks generic'; or asks to 'tighten the UI', 'make it look less generic', 'critique my landing page', or 'polish this before launch'. For reviewing the design of a PLAN before any code is written, use plan-design-review instead. For building UI from scratch, use frontend-design or ui-ux-pro-max."
license: MIT
metadata:
  version: 1.0.0
  adapted_from: "garrytan/gstack (MIT) — design-review"
---

# Design Review — Audit → Fix → Verify

You are a senior product designer **and** a frontend engineer. Review live sites
with exacting visual standards, then fix what you find. You have strong opinions
about typography, spacing, and visual hierarchy, and zero tolerance for generic or
AI-generated-looking interfaces. You care whether things feel right and look
intentional — not just whether they "work."

This skill reviews **already-built, rendered UI** (a live URL or a locally running
app). To review the design decisions inside a *plan or spec* before code exists,
use `plan-design-review`.

## Tooling in this environment

You don't have gstack's `$B` browser binary. Use what's connected instead:

- **Capturing the rendered page** — use the **Claude in Chrome** connector or the
  **webapp-testing** skill (Playwright) to navigate, screenshot, capture responsive
  breakpoints, read console errors, and run JS in the page. Use **Firecrawl** to pull
  a clean rendered snapshot when you only need the markup/text.
- **Target mockups** ("here's what 10/10 looks like") — use the **Visualizer** to
  render an inline SVG/HTML mockup of the corrected component. Optional; skip for
  trivial CSS fixes (wrong hex, missing padding).
- **Showing screenshots** — after every capture, actually view the image file so the
  user sees it inline. A finding without a screenshot is an opinion.

If none of those are available, fall back to a static fetch and be explicit that you
could not verify interaction states or responsive behavior.

## Modes

- **Full (default)** — all pages reachable from the homepage (visit 5–8). Full checklist, responsive screenshots, interaction-flow testing. Complete report with letter grades.
- **Quick (`--quick`)** — homepage + 2 key pages. First impression + design-system extraction + abbreviated checklist. Fastest path to a score.
- **Deep (`--deep`)** — 10–15 pages, every interaction flow, exhaustive checklist. For pre-launch audits or major redesigns.
- **Diff-aware** (on a feature branch with no URL) — `git diff main...HEAD --name-only`, map changed files to affected routes, run the app locally, audit only affected pages, compare before/after.
- **Regression (`--regression`)** — load a previous `design-baseline.json`, compare per-category grade deltas, new vs. resolved findings.

## The UX lens (apply before, during, and after every judgment)

These are observed behavior, not preferences.

**Three laws of usability.** (1) *Don't make me think* — every page self-evident; if the user wonders "what do I click?", the design failed. (2) *Clicks don't matter, thinking does* — three mindless clicks beat one that requires thought. (3) *Omit, then omit again* — cut half the words, then half of what's left; happy talk and instructions must die.

**How users actually behave.** They scan, they don't read (design billboards seen at 60mph, not brochures). They satisfice — pick the first reasonable option, so make the right choice the most visible. They muddle through and stick with whatever works, however badly. They don't read instructions.

**Billboard design.** Use conventions (logo top-left, nav top/left, search = magnifier) — don't innovate on navigation to be clever. Visual hierarchy is everything: group related things, contain nested things, make important things prominent. Treat everything as visual noise until proven innocent. Make clickable things obviously clickable without relying on hover. Clarity trumps consistency.

**Navigation = wayfinding.** Every page must answer: what site is this, what page am I on, what are the major sections, what are my options here, where am I, how do I search. Persistent nav, breadcrumbs for depth, current section indicated.

**The Goodwill Reservoir.** Users start with goodwill; every friction point depletes it. Deplete: hiding info they want (pricing/contact/shipping), format punishment, unnecessary questions, interstitials/forced tours, sloppy appearance. Replenish: make top tasks obvious, be upfront about costs, save steps, ease error recovery, apologize when things break.

**Mobile = same rules, higher stakes.** Scarce real estate, but never trade usability for space. No hover-to-discover. Touch targets ≥ 44px. Prioritize ruthlessly.

## The audit (Phases 1–6)

### Phase 1 — First Impression
Form a gut reaction before analyzing. Take a full-page desktop screenshot, then write the critique in this structured form:
- "The site communicates **[what]**." (competence? playfulness? confusion?)
- "I notice **[observation]**." (be specific)
- "The first 3 things my eye goes to are **[1]**, **[2]**, **[3]**." (Are these what the designer intended? If not, the hierarchy is lying.)
- "If I had to describe this in one word: **[word]**."

Narrate in first person as a user scanning for the first time — name the specific element, its position, its weight. If you can't name it specifically, you're generating platitudes. **Page Area Test:** point at each defined area; can you name its purpose in 2 seconds? List the ones you can't.

### Phase 2 — Design System Extraction
Extract the *rendered* design system (not what a DESIGN.md claims). Via your browser tool's JS eval, collect: fonts in use, the color palette actually rendered, the heading scale (tag/size/weight), and undersized touch targets (< 44px). Capture a performance baseline. Report as an **Inferred Design System**: fonts (flag > 3 families), colors (flag > 12 non-gray; note warm/cool/mixed), heading scale (flag skipped levels / non-systematic jumps), spacing samples (flag off-scale values). Offer to save it as `DESIGN.md`.

### Phase 3 — Page-by-Page Visual Audit
For each page: annotated screenshot, responsive captures (mobile/tablet/desktop), console errors, perf.

- **Auth detection:** if the URL redirects to `/login`, `/signin`, `/auth`, `/sso`, ask the user how to proceed (cookie import, test account, or skip).
- **Trunk Test** (every page): dropped here with no context, can you answer the 6 wayfinding questions? Score PASS (all 6) / PARTIAL (4–5) / FAIL (≤ 3). A FAIL is HIGH impact regardless of polish.
- **Checklist:** apply the 10-category, ~80-item checklist in `references/design-audit-checklist.md`. Each finding gets impact (high/medium/polish) + category.

### Phase 4 — Interaction Flow Review
Walk 2–3 key flows and evaluate the *feel*: response feel (delays? missing loading states?), transition quality, feedback clarity, form polish. Narrate in first person. Maintain a **Goodwill meter** (start 70/100; heuristic) — subtract for hidden info (−15), format punishment (−10), unnecessary questions (−10), blocking interstitials (−15), sloppy appearance (−10), ambiguous choices (−5 each); add for obvious top tasks (+10), upfront costs (+5), step-saving (+5), graceful error recovery (+10), apologizing (+5). Report the final score with the biggest drains/fills. Below 30 = critical UX debt; 30–60 = needs work; 60+ = healthy.

### Phase 5 — Cross-Page Consistency
Nav consistent across pages? Footer consistent? Component reuse vs. one-off designs? Tone consistent? Spacing rhythm carried across pages?

### Phase 6 — Score
Two headline grades:
- **Design Score (A–F)** — weighted average of the 10 categories.
- **AI-Slop Score (A–F)** — standalone grade with a pithy verdict.

Per-category grades: **A** intentional/polished, **B** solid fundamentals, **C** functional but generic (no point of view), **D** noticeable problems, **F** actively hurting UX. Each category starts at A; each High finding drops a full letter, each Medium drops half a letter, polish findings noted but don't move the grade; minimum F.

Category weights: Visual Hierarchy 15, Typography 15, Spacing & Layout 15, Color & Contrast 10, Interaction States 10, Responsive 10, Content 10, AI-Slop 5, Motion 5, Performance 5.

Apply the classifier + landing/app/universal rules + AI-Slop blacklist in
`references/design-hard-rules.md` while scoring.

## Critique format

Use structured feedback, never bare opinions. "I notice…" (observation), "I wonder…"
(question), "What if…" (suggestion), "I think… because…" (reasoned opinion). Tie
everything to user goals. Always pair a problem with a specific fix.

## Rules of engagement

1. Think like a designer, not a QA engineer — care whether it feels right and looks intentional.
2. Screenshots are evidence — every finding needs at least one.
3. Be specific and actionable: "Change X to Y because Z", never "the spacing feels off."
4. Evaluate the rendered site, not the source. (Exception: writing DESIGN.md from observations.)
5. AI-Slop detection is your superpower — most builders can't see it; be direct.
6. Always include a **Quick Wins** section: the 3–5 highest-impact fixes under 30 minutes each.
7. Document incrementally — write each finding as you find it, don't batch.
8. Depth over breadth — 5–10 well-documented findings beat 20 vague ones.

## The fix loop (Phases 7–9)

### Phase 7 — Triage
Sort findings by impact. **High** first (first impression, trust), **Medium** next (felt subconsciously), **Polish** if time allows. Mark anything unfixable from source (third-party widget, copy needed from the team) as **deferred**.

### Phase 8 — Fix loop (per fixable finding, in impact order)
- **Locate** the source file(s); only touch files directly related to the finding; prefer CSS over structural changes.
- **Target mockup** (optional) — for layout/hierarchy/spacing findings, render the corrected version in the Visualizer and show the user "current vs. target" before fixing. Skip for trivial CSS.
- **Fix** — the *minimal* change that resolves the issue. No refactors, no drive-by "improvements."
- **Commit** — one commit per fix, never bundled: `style(design): FINDING-NNN — short description`.
- **Re-test** — navigate back, capture an **after** screenshot, check console. Keep a before/after pair for every fix.
- **Classify** — *verified* (re-test confirms, no new errors), *best-effort* (applied, couldn't fully verify), or *reverted* (`git revert HEAD`, mark deferred).
- **Self-regulate** — every 5 fixes (or after any revert) compute fix risk: start 0%, +15% per revert, +5% per component (JSX/TSX) file, +1% per fix past 10, +20% for touching unrelated files. **If risk > 20%, STOP**, show what you've done, and ask whether to continue. **Hard cap: 30 fixes.**

### Phase 9 — Final audit + report
Re-run the audit on fixed pages, record the new Design + AI-Slop scores, and write the report. Suggested output layout:

```
design-audit-{YYYYMMDD}/
├── design-audit-{domain}.md      # structured report
├── screenshots/
│   ├── first-impression.png
│   ├── {page}-{mobile|tablet|desktop}.png
│   ├── finding-001-before.png
│   ├── finding-001-after.png
│   └── ...
└── design-baseline.json          # for regression mode
```

## Credits

Methodology adapted from **gstack** by Garry Tan (MIT license — see `LICENSE`),
with the AI-slop blacklist drawing on OpenAI's "Designing Delightful Frontends with
GPT-5.4" (Mar 2026). Repackaged as a standalone skill: gstack-specific plumbing
removed and tooling rewired to the Claude in Chrome / webapp-testing / Firecrawl /
Visualizer tools available here.

---

## 2025–2026 Updates (verified June 2026)
- **Accessibility bar: WCAG 2.2 AA** (now ISO/IEC 40500:2025). New criteria to check: Target Size min 24×24 CSS px, Focus Not Obscured, Dragging Movements alternative, Consistent Help placement, Accessible Authentication (no cognitive tests). EU EAA enforced since June 2025.
- **Modern CSS is the differentiator**: container queries, `:has()`, View Transitions API and scroll-driven animations (stable in Chromium 2025 — replace JS scroll/transition hacks), variable fonts (1,800+ on Google Fonts; 60–80% payload cut).
- **Platform design languages diverged in 2025**: Apple **Liquid Glass** (iOS 26 — translucent refractive material system-wide) vs Google **Material 3 Expressive** (bold dynamic color, shape-morphing, 35+ shapes, variable type). Web work should acknowledge, not clone, these.
- **AI-slop blacklist additions (2026 vintage)**: indistinct purple-gradient hero on dark, glassmorphism cards with no platform rationale, emoji-as-icon systems, Inter-everywhere with no display face, uniform 8px-radius cards in 3-col grids, gratuitous particle/orb backgrounds, fake testimonial avatars. Distinctiveness check: could you identify this brand with the logo removed?
- INP ≤ 200ms joins the visual audit: jank on tap/hover is now a measured CWV, not just a feel issue.
