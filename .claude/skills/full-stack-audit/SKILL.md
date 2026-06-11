---
name: full-stack-audit
description: "Orchestrate a 4-axis pre-launch audit (UI/UX, SEO/AEO, Security, Production-Readiness) using parallel subagents via the Workflow tool. Use when the user says 'run a full stack audit of X', '/full-stack-audit X', 'audit everything for X', 'full audit of a site', 'comprehensive site audit', or 'pre-launch sweep across the board'. Spawns 4 worker agents in parallel, synthesizes their structured findings into one caveman-style severity-ranked report routed via log-folder. ~4 deep agents per run — surface the token cost before invoking."
---

# Full-Stack Audit

Pre-launch audit across all four axes — UI/UX, SEO/AEO, Security, Production-Readiness — orchestrated as 4 parallel subagents via the Workflow tool, synthesized into one caveman-style severity-ranked report.

> **Cost note:** each run spawns 4 deep parallel agents + main-session synthesis. Expect ~200K–500K output tokens and 3–5 min wall-clock per full audit. Always surface the cost in your first response so the user can scope down or defer before kicking off.

---

## When to use

- User says: "run a full stack audit of <X>", "/full-stack-audit <X>", "audit everything for <X>", "full audit of <site>", "comprehensive audit", "pre-launch sweep across the board"
- User wants one report covering all four axes, not four separate skill invocations
- User has a live URL and (ideally) the source repo path

## When NOT to use

- User wants just one axis — invoke that single skill directly (`/website-security-audit`, `/production-readiness`, etc.)
- User wants fixes, not findings — this skill is **audit mode only**. Fixes happen later via the individual skills' Phase 4 after the user reads the report.
- Token budget is tight — recommend the single-axis skill that matches the load-bearing concern.

---

## What this skill does, step by step

1. **Collect inputs** — required: target URL. Optional but recommended: source repo path, project context.
2. **Auto-detect project routing** — derive which workspace project (Marketing Hub / Peptide Hub / etc.) owns the URL. Used later for report routing.
3. **Surface the cost preview** — tell the user the agent count, expected runtime, expected output path, and which axes will run. Wait for OK.
4. **Invoke the Workflow tool** with the script below. The script runs the 4 workers in `parallel()` (true barrier — synthesis needs all 4 outputs together), each with a `schema:` so findings come back as validated JSON.
5. **Synthesize in the main session** — the workflow returns 4 finding sets. Apply the synthesis rules below: dedup cross-axis overlaps, rank by severity, write the caveman-style report.
6. **Write the report to the routed path** — `log-folder` convention. Mirror to Obsidian Hub if relevant.
7. **Offer per-axis Phase 4 fixes** — point at the individual skills (e.g. "want me to run the auto-fix tier from `website-security-audit` on rows 3, 5, 9?").

---

## The 4 worker agents

| Agent | Skills it loads (only these) | What it produces |
|---|---|---|
| **UI/UX Auditor** | `ui-ux-pro-max`, `design-review`, `plan-design-review`, `web-design-guidelines`, `frontend-design` | 3-viewport screenshots, contrast/typography/motion findings, accessibility basics, design-system coherence |
| **SEO/AEO Auditor** | `seo-audit`, `ai-seo`, `schema-markup`, `site-architecture` | meta/OG/canonical/robots/sitemap audit, JSON-LD presence + correctness, AEO answerability (FAQ schema, comparison content, PAA coverage), site-architecture sanity |
| **Security Auditor** | `website-security-audit` (v2-patched) | Phases 1–3 of the security skill — site profile + findings table. **No Phase 4** in audit mode. |
| **Production-Readiness Auditor** | `production-readiness`, `audit-site` (perf-floor row only) | Phases 1–3 of the readiness skill — screen states, DB hygiene, repo, rollback, QA reality, legal-beyond-PII |

Each agent gets a **fresh context** with only the skills above. They do NOT inherit memory or other skills — keep the agent focused.

---

## The Workflow script

Pass this script verbatim to the Workflow tool, with `args: {url: "<target>", sourceDir: "<path-or-empty>", context: "<optional-notes>"}`.

```javascript
export const meta = {
  name: 'full-stack-audit',
  description: 'Parallel 4-axis pre-launch audit (UI/UX + SEO/AEO + Security + Production-Readiness)',
  phases: [
    { title: 'Audit', detail: '4 parallel worker agents recon their axis and return structured findings' },
  ],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  required: ['axis', 'siteProfile', 'findings'],
  properties: {
    axis: { type: 'string', enum: ['ux', 'seo', 'security', 'readiness'] },
    siteProfile: { type: 'string', description: 'One-paragraph site profile from this axis perspective' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'category', 'title', 'status', 'severity', 'evidence', 'fixType'],
        properties: {
          id: { type: 'string', description: 'Short unique slug per finding (e.g. ux-contrast-hero, sec-csp-missing)' },
          category: { type: 'string', description: 'Which section of the worker skill produced this (e.g. headers, screen-states, accessibility)' },
          title: { type: 'string' },
          status: { type: 'string', enum: ['PASS', 'FAIL', 'FAIL-LATENT', 'N/A', 'HUMAN-VERIFY', 'ALREADY-DONE'] },
          severity: { type: 'string', enum: ['High', 'Med', 'Low', '-'] },
          evidence: { type: 'string', description: 'Concrete recon evidence: curl output, grep hit, file path + line, contrast ratio, missing schema type, etc. No fabrication.' },
          fixType: { type: 'string', enum: ['auto', 'human', 'do-not-touch', '-'] },
          trigger: { type: 'string', description: 'REQUIRED when status=FAIL-LATENT. The condition that converts this to a live FAIL.' },
        },
      },
    },
  },
}

const url = args.url
const sourceDir = args.sourceDir || ''
const context = args.context || ''

const baseContext = `
TARGET URL: ${url}
${sourceDir ? `SOURCE DIRECTORY: ${sourceDir}` : 'NO SOURCE DIRECTORY PROVIDED — URL-only recon.'}
${context ? `ADDITIONAL CONTEXT: ${context}` : ''}

You are running in AUDIT MODE. Report findings only — do NOT apply any fixes. Return your output as structured JSON matching the schema. Every finding must cite concrete recon evidence; no fabricated PASSes.
`

phase('Audit')

const [ux, seo, security, readiness] = await parallel([
  () => agent(`${baseContext}

You are the UI/UX Auditor.
Load these skills ONLY: ui-ux-pro-max, design-review, plan-design-review, web-design-guidelines, frontend-design.

Run a full UI/UX audit on the target:
- Classify the design language (style, palette, typography, density, motion vocabulary)
- Capture screenshots at 375 / 768 / 1440 viewport widths and observe layout
- Audit: contrast ratios (WCAG AA 4.5:1 minimum), typography hierarchy and consistency, color-system coherence, motion (prefers-reduced-motion respected?), accessibility (alt text, ARIA, keyboard nav, focus states, touch targets >= 44px), layout consistency across pages, design-system coherence (are reused components actually reused?)
- For each finding, capture concrete evidence: computed style values, contrast ratio measurements, screenshot observations, file/line citations where applicable

Return JSON matching FINDINGS_SCHEMA with axis="ux".
`, { label: 'ux-auditor', phase: 'Audit', schema: FINDINGS_SCHEMA }),

  () => agent(`${baseContext}

You are the SEO/AEO Auditor.
Load these skills ONLY: seo-audit, ai-seo, schema-markup, site-architecture.

Run a full SEO + AEO (Answer Engine Optimization) audit on the target:
- Classify: marketing site / e-commerce / content site / app shell — this gates which checks apply
- Recon: HTML meta (title, description, OG, Twitter, canonical, hreflang if multi-lang), robots.txt + sitemap.xml presence and correctness, structured data (JSON-LD types present, validation), heading hierarchy (one h1 per page, logical h2/h3), internal-linking depth + breadcrumbs, AEO answerability (FAQ schema, comparison content, "people-also-ask" coverage), site architecture (URL depth, naming consistency)
- For each finding, capture concrete evidence: the actual meta tag content, the missing schema type, the broken canonical URL, etc.

Return JSON matching FINDINGS_SCHEMA with axis="seo".
`, { label: 'seo-auditor', phase: 'Audit', schema: FINDINGS_SCHEMA }),

  () => agent(`${baseContext}

You are the Security Auditor.
Load this skill ONLY: website-security-audit.

Run Phases 1–3 of the website-security-audit skill against the target. Phase 1 (classify architecture), Phase 2 (active recon — curl, grep, header diff), Phase 3 (findings table). Do NOT run Phase 4 — no auto-fixes in audit mode.

Return the findings table as JSON matching FINDINGS_SCHEMA with axis="security". Inherit the security skill's do-NOT-touch list (browser-Babel CSP enforce-hybrid, no-precompile-JSX) and surface those as fixType="do-not-touch".
`, { label: 'security-auditor', phase: 'Audit', schema: FINDINGS_SCHEMA }),

  () => agent(`${baseContext}

You are the Production-Readiness Auditor.
Load these skills ONLY: production-readiness, audit-site.

Run Phases 1–3 of the production-readiness skill against the target. Use audit-site ONLY for the perf-floor row (slow-3G TTI + Lighthouse mobile) — do not duplicate audit-site's full SEO/CWV recon, that's the SEO/AEO auditor's job above.

Run-mode rule: if a security audit log exists in the project's docs/ folder dated within the last 14 days, cite it (status="ALREADY-DONE") for the light-overlap rows in §8 instead of re-running them.

Return the findings table as JSON matching FINDINGS_SCHEMA with axis="readiness".
`, { label: 'readiness-auditor', phase: 'Audit', schema: FINDINGS_SCHEMA }),
])

return { ux, seo, security, readiness }
```

When the workflow returns, you (the main session) do the synthesis below — NOT another subagent. Synthesis is cheaper and keeps you in the loop for the conversational follow-up.

---

## Synthesis rules (main session, after Workflow returns)

When all 4 worker outputs return:

1. **Combine site profiles** — read the four `siteProfile` paragraphs (one per axis). Write one cross-axis paragraph that includes the architecture profile + the load-bearing observations from each axis. Don't just concatenate.

2. **Dedup cross-axis overlaps** — if two axes flag the same root cause (e.g. security flags "no git" AND readiness flags "no branch strategy" AND readiness flags "no CI/CD" — all rooted in the same `git init` gap), merge into one row with a multi-axis label like `[security + readiness]`. Use the highest severity from the contributors. Preserve evidence from all axes in the merged row.

3. **Sort findings** — first by severity (High → Med → Low), then by launch-blocking weight (FAIL → FAIL-LATENT → HUMAN-VERIFY → N/A → ALREADY-DONE → PASS).

4. **Group into report sections (in this order):**
   - Caveman top-line (3–5 plain sentences: "what broke, what solid, what fix first")
   - ASCII severity bar chart (Findings per axis × severity, see template below)
   - **Real open gaps (do before launch)** — every live FAIL ranked
   - **Gated / latent** — every FAIL-LATENT with its trigger condition
   - **Needs user verification** — every HUMAN-VERIFY with the exact instruction
   - **Shipped & solid** — PASS count per axis (not a full list — counts only)
   - **Architecture gated out** — N/A list with one-line reason per item (transparency, so nothing reads as "missed")
   - **Do-NOT-touch** — inherited from the security worker's output

5. **ASCII severity bar chart template** (placed near top of report so non-technical reader sees shape first):

```
Findings by axis (FAIL = █ FAIL-LATENT = ▒ HUMAN-VERIFY = ░)

UX        ████░░          (4 FAIL, 2 HUMAN-VERIFY, 0 LATENT)
SEO       ██░             (2 FAIL, 1 HUMAN-VERIFY, 0 LATENT)
Security  █▒▒░░░          (1 FAIL, 2 LATENT, 3 HUMAN-VERIFY)
Readiness █████▒▒▒░░░░    (5 FAIL, 3 LATENT, 4 HUMAN-VERIFY)
```

6. **Caveman top-line** — single paragraph in plain language, 3–5 sentences. Pattern:
   - "Site solid on X."
   - "Big hole: Y."
   - "Smaller stuff to fix: Z."
   - "Fix first: <single highest-leverage action>."

---

## Report routing

Use the `log-folder` skill convention:

1. **Project match** — inspect the URL's domain and (if known) source repo path. Cross-reference workspace projects (Marketing Hub / Peptide Hub / Open Design / etc.) for an owner.
2. **Routed paths:**
   - Match found → `<Hub>/<Project>/docs/full-stack-audit-<YYYY-MM-DD>.md`
   - No match → `Claude Hub/audits/external/<domain>-<YYYY-MM-DD>/full-stack-audit.md` (create dir if missing)
3. **Surface the chosen path** in the final response with a clickable markdown link.
4. **Mirror to Obsidian Hub** if the report lives anywhere under the workspace (already handled by the launchd sync — but `diff -q` after writing per the skill-mirror canonical-location rule).

---

## Hard rules

- **Audit mode only.** Workers report findings, do NOT apply fixes. Phase 4 happens via the individual skills after the user reads the synthesis.
- **Inherit do-NOT-touch from the security worker.** Browser-Babel CSP enforce-hybrid, no-precompile-JSX, etc. — these propagate to the synthesis report and must not be "fixed" in any follow-up pass.
- **No fabricated PASS.** Every PASS in the synthesis must trace to concrete worker evidence. If a worker returns no evidence for a row, classify HUMAN-VERIFY, never PASS.
- **Dedup over duplicate.** Two axes flagging the same root cause → one merged row with multi-axis label.
- **Cost-first.** Always surface agent count + token cost estimate + expected output path BEFORE invoking the Workflow tool. User can scope down to fewer axes (call the single-axis skill instead).
- **Schema validation is mandatory.** The Workflow `schema:` option enforces this — workers retry on mismatch. If a worker still returns null after retries (rare), the synthesis must explicitly call that out: "axis X worker failed — N/A for this axis, re-run separately."
- **Cite prior audits.** If a security or readiness audit ran in the project's `docs/` within the last 14 days, the corresponding worker should cite (status=ALREADY-DONE) rather than re-run. Workers receive this rule in their prompt.
- **Confirm before invoking.** Even though the workers themselves are audit-mode and read-only, the cost is real. Show the plan, get OK, then go.

---

## Output

1. **Pre-invocation:** cost preview + plan + routed path. Wait for OK.
2. **Workflow runs** (3–5 min wall-clock, 4 agents in parallel).
3. **Synthesis report** written to the routed path (markdown file, ASCII chart at top, severity-ranked tables, caveman summary, do-NOT-touch section).
4. **In-chat summary** — caveman top-line, severity-ranked top 3–5 gaps, link to the full report file.
5. **Offer follow-ups** — per-axis Phase 4 fixes via individual skills, OR a re-audit after the user clears their HUMAN-VERIFY pile.

---

## Related skills

`website-security-audit`, `production-readiness`, `ui-ux-pro-max`, `design-review`, `plan-design-review`, `web-design-guidelines`, `frontend-design`, `seo-audit`, `ai-seo`, `schema-markup`, `site-architecture`, `audit-site` (perf overlap — used only for the readiness perf-floor row), `log-folder` (routes the report), `caveman` (the synthesis voice).

---

## 2025–2026 Updates (verified June 2026)
Propagate to worker agents' briefs:
- **SEO/AEO axis**: INP ≤ 200ms replaces FID; FAQ/HowTo rich results dead — audit Organization/Product/LocalBusiness schema and AI-crawler robots posture instead; GEO content rubric = answer-first + citations/statistics/quotations.
- **Security axis**: score against OWASP Top 10:2025 (supply chain A03 and exceptional-conditions A10 are new; misconfig now #2; SSRF folded into access control). Next.js version-gate vs 2025 RSC CVEs; Supabase RLS-policy presence per table.
- **UI/UX axis**: WCAG 2.2 AA (24×24 targets), AI-slop blacklist, View-Transitions/scroll-driven CSS as the modern-implementation signal.
- **Production axis**: CWV field-data gate, rollback plan incl. `use cache` tag invalidation (Next 16), dependency supply-chain pass.
