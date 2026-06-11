---
name: production-readiness
description: "Pre-launch production-readiness audit for websites we build. Use when the user says 'production readiness', '/production-readiness', 'is this ready to launch', 'pre-launch check', 'launch checklist', 'prelaunch', 'go-live audit', or links a site and asks if it's ready for real users (distinct from 'is it safe' — that's website-security-audit). Architecture-adaptive: classifies stack first, then audits screen states, DB hygiene, repo hygiene, rollback plan, QA coverage, and legal-beyond-PII. Chained from website-security-audit: run security first, then this. Standalone invocation also works."
---

# Production Readiness

The *functional* gate that pairs with `website-security-audit`'s *safety* gate. Same recon-first design.

> Security asks "can this be attacked?" Production-readiness asks "will this actually work, hold up, and not embarrass us on launch day?" Different question. Where the two overlap (auth, secrets, HTTPS) this skill keeps a light pointer; the deep version lives in `website-security-audit`.

---

## When to use

- Before any site we built goes live or into a client pitch — same trigger window as the security skill.
- User says "production ready?", "ready to launch?", "/production-readiness", "prelaunch check", "is this prod-grade?", "launch checklist".
- **Chained from `website-security-audit`** — when that skill's Phase 4 closing recap completes, suggest running this one next for the functional axis.
- Standalone invocation works — Phase 1 classifies on its own.

Needs: a live URL and/or the source directory. Both is best.

---

## The four phases

Same shape as `website-security-audit`. Do not skip Phase 1.

### Phase 1 — Classify the architecture (mandatory, first)

| Question | How to determine | Why it gates |
|---|---|---|
| Static brochure or interactive app? | Click-through; check for forms, accounts, persistent state | Static brochure → DB hygiene + backup checks N/A. Interactive → full DB hygiene applies. |
| Do we own a database? | Repo scan for ORM/Prisma/Supabase/Mongo/sql migration dir | No owned DB → skip schema/index/cascade/restore-drill rows. |
| Build process? | `package.json` scripts, framework build command, output dir (`dist`/`build`/`.next`) | No-build (browser-Babel) → `npm run build` failure mode is N/A; some debug-artifact greps narrow to shipped files only. |
| Custom domain or platform subdomain? | `curl -I` URL; check cert CN; look for `.vercel.app`/`.netlify.app`/`.web.app` | Platform subdomain → DNS/www-vs-apex/custom-cert checks N/A (handled by host). Custom domain → all apply. |
| Real-user features (signup/login/save)? | Click-through for auth, persistent state | None → onboarding/login QA rows N/A. Present → full QA matrix applies. |
| Already collecting production data? | DB query for non-test records; analytics for real traffic | Live-with-real-data → backups/restore/data-deletion are **urgent now**, not "before launch." |
| Under version control + README? | `git -C <dir> rev-parse`; `README.md` present + content | No git → repo-hygiene rows deferred (solo tool). No/weak README → FAIL for anything handed off. |
| Has `website-security-audit` already run today? | Ask user; look for an audit report in `docs/` | If yes-and-passed: skip §8 light overlap rows, cite the run date. If failed or stale: surface the overlap here so the launch can't proceed past unfixed security. |

Output a one-paragraph **Site Profile** before any checking, e.g.:
> Static Firebase hosting, browser-Babel React, no DB or auth, one Supabase Edge Function `submit-lead` → Resend, custom domain via Firebase, 15 pages (Home, 4 model pages, Anatomy, Promotions, Map, FAQ, Reviews, Contact, etc.), no signup/login flow, security skill ran 2026-05-15 and passed.

### Phase 2 — Active recon (only the applicable checks)

For each applicable gated row, determine the real state — don't ask the user what they think.

- **Per-page screen-state audit:** click through every route. For each page, record what the user sees in the four async moments: (a) initial render before data, (b) post-render with no data, (c) network error mid-fetch, (d) user-action success. Throttle the connection to slow-3G and confirm there's a loading state, not a flash-of-empty.
- **DB schema:** open `schema.prisma` / migrations dir / `supabase/migrations/*.sql` / etc. List every table; for each, capture NOT NULL/UNIQUE constraints, foreign keys with their ON DELETE behavior, indexes on every column used in WHERE/ORDER BY/JOIN. Cross-reference against the actual query code — an index on a never-queried column is dead weight; a queried column with no index is a latent perf cliff.
- **Backup posture:** in the DB provider console (or `vercel env`/`supabase` CLI), capture: backup config enabled? schedule? **last successful backup timestamp?** **last verified RESTORE date?** A backup never restored is HUMAN-VERIFY-then-likely-FAIL.
- **README sweep:** open `README.md`. Score against the "could a stranger set this up?" bar — project description, setup steps, env vars listed, deploy steps, common gotchas. One-line README is FAIL.
- **Branch + commit hygiene:** `git -C <dir> branch -a`; flag stale branches > 30 days. `git -C <dir> log --oneline -20`; flag vague commits ("wip", "fix", "update").
- **Debug artifacts in shipped code:** grep the *deployed* dir (not `node_modules`, not `tests/`) for `console.log`, `print(`, `dump(`, `debugger;`, `XXX`, `FIXME`, `TODO`, and runs of `// ` > 3 consecutive lines (commented-out blocks).
- **Lockfile committed:** check `package-lock.json`/`yarn.lock`/`pnpm-lock.yaml`/`poetry.lock`/`Gemfile.lock` is tracked by git.
- **DNS reality:** `dig +short <domain>` and `dig +short www.<domain>`; both should resolve; one should redirect to the other. `curl -sI https://<apex>` and `curl -sI https://www.<apex>` and compare.
- **Build hygiene:** run the build command; capture exit code, warning count, output-dir size. Warnings in dev become failures in prod.
- **Rollback plan:** HUMAN-VERIFY — ask the user to state the rollback command and whether they've tested it once. "I'd push a revert commit" doesn't count if they haven't done it.
- **Cross-device + slow-3G:** capture screenshots at 375 / 768 / 1440 px viewport widths via headless browser. Run Lighthouse with `--throttling-method=devtools --form-factor=mobile`; capture TTI. > 5s TTI on slow-3G is FAIL.
- **Legal recon:** check for `/terms`, `/privacy`, footer links, cookie banner (if any EU reach), age gate (if any under-13 risk). If AI-generated content is shown as fact, flag for human accuracy review.
- **Maintenance cadence:** HUMAN-VERIFY — ask whether there's a recurring weekly/biweekly reminder to review error logs, dep updates, and user feedback. "No, I'll do it when I remember" is FAIL-LATENT (it WILL rot).

Each item resolves to: **PASS** / **FAIL** / **FAIL-LATENT** / **N/A (reason)** / **ALREADY-DONE** / **HUMAN-VERIFY**.

**FAIL-LATENT** here = a real readiness gap that has no consequence *yet* because the precondition isn't live (e.g. backup restore drill is FAIL-LATENT if no production data exists yet — must be done before the first real user signs up; calendar review is FAIL-LATENT before launch, FAIL after).

### Phase 3 — Findings table

Same format as `website-security-audit`. Severity = High (will break or embarrass at launch) / Med / Low.

```
# Production-Readiness Audit — <domain> — <date>

## Site profile
<one paragraph from Phase 1>

## Findings
| # | Item | Status | Severity | Evidence | Fix type |
|---|------|--------|----------|----------|----------|
| 1 | /faq page has no loading state | FAIL | Med | Slow-3G shows 1.8s of blank screen before content paints | auto (add Skeleton) |
| 2 | Backup never restored | FAIL-LATENT | High when wired / Low today | Supabase backup config on; no restore date in any doc | human (one-time restore drill before first real signup) |
| 3 | README is a one-liner | FAIL | Med | 14 chars, no setup steps | human-write |
| 4 | DB cascade on submit_leads → orphans on user delete | N/A | - | No user table — no parent to delete | - |
...

## Summary
- Shipped & solid: <list>
- Real open gaps (do before launch): <ranked>
- Gated / latent: <list with trigger conditions>
- Human-verify pending: <list with exact instruction>
- Do-NOT-touch: <list>
```

### Phase 4 — Confirm, then tiered fix

Ask the user to confirm before fixing anything. Then apply the tiered policy:

- **Auto-fix (after the user's OK)** — owned-code / config:
  - Add missing loading/empty/error/success state components.
  - Add DB indexes, NOT NULL constraints, cascade clauses; add lockfile to git.
  - Add `/terms`, `/privacy` route stubs (copy comes later).
  - Strip debug artifacts (`console.log`, commented blocks) from shipped files.
  - Add HSTS / cache headers / build-warning suppressions only after diagnosis.
- **Human-only (flag with exact instructions, never silently "fix")**:
  - Restore drill (the user has to test the backup, not just configure it).
  - Real-device QA (only the user can hold the phone).
  - Rollback plan documentation (must be the user's own runbook, not assumed).
  - ToS / Privacy / COPPA copy (legal text — draft, but the user owns/approves).
  - Calendar reminder (lives in their calendar, not the codebase).
  - DNS records (irreversible-ish, registrar-side).
- **Do-NOT-touch** — call out so a later pass doesn't undo it:
  - Whatever the security skill marked do-NOT-touch (browser-Babel CSP enforce-hybrid + report-only monitor, etc.). This skill inherits that list.
  - Any feature-flagged-off route that's intentionally dormant.

Re-verify after fixing (re-curl, re-grep, re-screenshot, re-build). Report what changed with evidence.

---

## Full checklist (gated + active)

### 1. Screen states (per page, not per app)
- **Loading state present** — gate: any page with async data. Check: page shows spinner/skeleton during fetch, not blank. Fix: auto.
- **Empty state present** — gate: any list/grid/feed that can be empty. Check: empty state has copy + guidance, not blank space. Fix: auto.
- **Error state present** — gate: any page with API/fetch that can fail. Check: graceful fallback with human-readable message + retry; no raw stack trace, no white-screen-of-death. Fix: auto (error boundary + per-page catch).
- **Success feedback** — gate: any user action (form submit, save, like, navigate). Check: visible confirmation — toast/check/redirect — not silent. Fix: auto.
- **Offline state** — gate: any interactive feature. Check: detection + user-visible message; ideally queue-and-sync. Fix: auto (basic) + human (queue strategy if needed).

### 2. Database hygiene
- **Schema constraints at DB level** — gate: owned DB. Check: NOT NULL, UNIQUE, FK constraints in schema (not only enforced in app code — app code can be bypassed). Fix: auto (migration).
- **Cascade deletes configured intentionally** — gate: owned DB with parent-child. Check: every FK has an explicit ON DELETE behavior (cascade, set null, restrict) chosen on purpose — not the default. Fix: auto.
- **Indexes on queried columns** — gate: owned DB. Check: every column used in WHERE / ORDER BY / JOIN / GROUP BY has an index. Conversely, no indexes on never-queried columns (write-cost without benefit). Fix: auto.
- **Backup config + last-success + verified restore** — gate: any production data. Check: backups enabled at provider level, last backup within window (24h for most apps), **at least one successful restore has been performed and dated**. Fix: human (run the restore drill — the test is the whole point).
- **Row-level security (RLS) or equivalent** — gate: multi-tenant or PII-bearing data. Check: RLS policies enforce per-user data isolation. Fix: auto (Supabase) / mixed (other providers).
- **No test/dummy/seed data in prod** — gate: live DB. Check: no rows matching `test@`, `asdf`, `lorem`, `Test User`, etc. Fix: auto + human-confirm before delete.

### 3. Repo & code hygiene
- **README passes the stranger test** — gate: any repo. Check: project description, setup steps, env vars listed, deploy command, common gotchas. One-liner is FAIL. Fix: human-write.
- **Branch strategy clean** — gate: any git repo. Check: `main` is deployable; no stale branches > 30 days. Fix: human (delete or merge stale).
- **No debug artifacts in shipped code** — gate: any source dir that ships. Check: grep `console.log`, `print(`, `dump(`, `debugger;`, `XXX`, `TODO`, `FIXME` in deployed files (not tests). Fix: auto.
- **No commented-out code blocks** — gate: any source dir. Check: 3+ consecutive `// ` lines in shipped files (Git remembers — no need to leave it). Fix: auto.
- **Lockfile committed** — gate: any package manifest. Check: `*.lock` / `package-lock.json` tracked. Fix: auto.
- **Large binaries out of git** — gate: any git repo. Check: video/audio/image > 1MB in tree. Fix: human (history rewrite is irreversible, decide before).
- **`.gitignore` hygiene** — gate: any git repo. Check: covers `.env`, `node_modules`, build output, OS files (`.DS_Store`). Cross-references `website-security-audit` §3 on `.env`. Fix: auto.

### 4. Deployment & rollback
- **CI/CD wired to main** — gate: deployed site. Check: push to main auto-deploys; no manual `vercel deploy` step required. Fix: human (initial setup) + auto (config file).
- **Build completes without warnings** — gate: any build process. Check: run the build command; exit 0 + zero warnings. A warning in dev becomes a failure in prod. Fix: auto.
- **Rollback plan documented + tested** — gate: any prod deploy. Check: user can state the rollback command and has done it at least once (or has a documented runbook). Fix: HUMAN-VERIFY.
- **Custom domain + HTTPS certificate** — gate: not on platform subdomain. Check: padlock; cert CN matches; cert expiry > 30 days. Fix: human (DNS) + auto (HSTS — also tracked in security skill).
- **DNS www + apex both resolve** — gate: custom domain. Check: `dig +short <apex>` and `dig +short www.<apex>` both return; one redirects to the other (decide which). Fix: human (DNS records).
- **Static assets via CDN with cache headers** — gate: image/font-heavy site. Check: assets served with `Cache-Control: max-age=...` and `immutable` for fingerprinted files. Fix: auto.
- **Health check / status URL exists** — gate: any owned runtime. Check: a `/healthz` or equivalent returns 200 quickly; can be wired to uptime monitor. Fix: auto.

### 5. QA reality check
- **Real-device mobile test** — gate: any public site. Check: actually opened on a phone (or BrowserStack); not just DevTools responsive mode. DevTools lies about pinch-zoom, sticky-header collapse, viewport-height bugs, touch targets, momentum scroll. Fix: HUMAN-VERIFY (only the user can hold the phone).
- **Cross-browser** — gate: any public site. Check: tested on Chrome + Safari (or Chrome + Firefox at minimum). Fix: HUMAN-VERIFY.
- **Slow-3G performance** — gate: any public site. Check: Lighthouse mobile slow-3G TTI < 5s; LCP < 2.5s. Fix: auto (perf opts) + human (re-test).
- **Fresh signup flow end-to-end** — gate: signup exists. Check: tested with a brand-new email; account creates; confirmation email arrives. Fix: HUMAN-VERIFY.
- **Forgot-password flow end-to-end** — gate: login exists. Check: reset email arrives; link works once; password changes; old password no longer works. Fix: HUMAN-VERIFY.
- **Form abandonment recovery** — gate: any multi-field form. Check: refresh or navigation doesn't lose input (sessionStorage or autosave). Fix: auto.
- **Empty-DB experience** — gate: app shows lists of user data. Check: brand-new user sees the empty-state, not a broken layout from an undefined map. Fix: auto.
- **One stranger has used it** — gate: any public site. Check: at least one person who is NOT the builder has clicked through without guidance; their confusion points are noted. Fix: HUMAN-VERIFY.

### 6. Legal beyond PII
- **Terms of Service present** — gate: any public site. Check: `/terms` route + footer link. Fix: human-write.
- **Privacy Policy present** — pointer to `website-security-audit` §1. Don't duplicate.
- **Cookie consent** — gate: cookies + any EU reach. Check: consent banner before non-essential cookies; documented categories. Fix: mixed (banner code auto, legal categories human).
- **COPPA** — gate: any chance of users < 13. Check: age gate or explicit "not for users under 13" notice. Fix: human (legal text).
- **AI-generated content accuracy review** — gate: any AI content presented as fact (medical/legal/financial especially). Check: human has reviewed for accuracy and added disclaimers. Fix: HUMAN-VERIFY.
- **Trademark + domain conflict** — gate: pre-launch only. Check: USPTO TESS (US) / WIPO Madrid / local registrar search for the app name. Fix: HUMAN-VERIFY.
- **Third-party service ToS coverage** — gate: any third-party API in the user-facing flow. Check: their ToS allows your use case (e.g. some APIs forbid resale, some require attribution). Fix: HUMAN-VERIFY.

### 7. Maintenance cadence
- **Recurring review reminder** — gate: live site. Check: weekly/biweekly recurring calendar event to review error logs, dep updates, user feedback. Fix: HUMAN-VERIFY (lives in their calendar).
- **Dependency update process** — gate: any package manifest. Check: Dependabot/Renovate enabled. **Also covered by `website-security-audit` §3** — cite it; don't double-flag.
- **User-feedback channel** — gate: any public site. Check: support email / contact form / feedback widget; reach a human in a reasonable window. Fix: human-write (route + copy).
- **Post-launch monitoring runbook** — gate: live site. Check: documented what to do when error rate spikes / uptime drops / a user reports a bug. Fix: human-write.

### 8. Light security overlap (pointer, not deep)
For: auth, secrets, HTTPS, dep CVEs, file uploads, log redaction — **see `website-security-audit`** for the deep recon.

This skill's behavior when running standalone:
- If `website-security-audit` ran today against this site and PASSED on these rows → cite the run date, skip.
- If it ran and FAILED on any row → surface as **High** here too; the launch can't proceed past unfixed security regardless of which axis you're auditing on.
- If it has NOT run → suggest running it first; do a 30-second sanity grep (`grep -rniE 'service_role|sk-[A-Za-z0-9]{16,}'` in shipped code) and flag anything obvious, but mark all rows in this section HUMAN-VERIFY pending the real security pass.

---

## Added rows (what the generic prototype-vs-production checklist misses)

1. **5-state coverage is per-page, not per-app.** A site with 12 pages and 1 page missing an error state is FAIL on that page. Don't roll up to one site-wide PASS.
2. **Restore-drill is the real check, not "backup config exists."** A backup never restored isn't a backup; the PASS requires a documented restore date.
3. **Real-device test trumps DevTools responsive mode.** Browser responsive mode lies about pinch-zoom, sticky-header collapse, dvh/svh/lvh viewport-height bugs, touch targets, momentum scroll. PASS requires real-device or BrowserStack evidence.
4. **README PASS is "could a stranger set this up?"** Not "exists with one line." Setup steps + env vars + deploy command + gotchas.
5. **One stranger has clicked through.** AI tools and self-testing both miss the same things the builder's own assumptions hide. PASS requires one non-builder user with no guidance.
6. **Inherit the security skill's do-NOT-touch list.** If the security skill marked browser-Babel CSP enforce-hybrid as correct-and-final, this skill must not "fix" it by re-strict-ing.

---

## Stack profiles (fast classification reference)

| Profile | DB hygiene | Repo hygiene | Screen states | Rollback / DNS | Legal | Light-security overlap |
|---|---|---|---|---|---|---|
| Static brochure, no backend | N/A | Light (README + branch + gitignore) | Loading/empty only — most pages are static so few async states | DNS + cert only | Privacy + ToS only if PII collected | Minimal — point to security skill |
| Static + serverless lead fn (iMotor-class) | Light — only the lead-fn write path | Full | Full per page | Custom domain + CI/CD + rollback plan | ToS + Privacy required (PII via lead form) | Cite security audit; flag if not run |
| Next.js / Remix / SvelteKit + owned DB + auth | Full | Full | Full per page (every route) | Full incl. health-check endpoint | Full incl. COPPA / cookie consent if EU | Cite security audit; mandatory chain |

---

## Hard rules

- **Classify before you check.** No template rows; every finding cites recon evidence.
- **Screen states are per-page.** Never roll up to "the app has loading states" — name the failing page.
- **Backup config without verified restore = FAIL** (or FAIL-LATENT if no production data exists yet, with trigger "before first real user signup").
- **README absence is FAIL** for any project that could be handed off — including projects the user calls "just for me" if they have data other systems depend on.
- **Real-device > DevTools.** Mobile QA PASS requires real phone or BrowserStack — DevTools responsive mode is not evidence.
- **Don't duplicate the security skill's findings.** Cite the security skill's last run; if it passed those rows, skip them. If it failed any, surface here too.
- **Inherit the security skill's do-NOT-touch list.** Browser-Babel CSP enforce-hybrid, no-precompile JSX, etc. — this skill must not "fix" them.
- **No fabricated PASS.** If a state can't be determined, mark HUMAN-VERIFY with the exact thing to check where.
- **Confirm with the user before any fix.** Same tiered policy as security skill.
- **FAIL-LATENT must state its trigger.** "Before first real signup" / "before EU traffic enabled" / etc. — never a vague "later."

---

## Output

1. Site Profile paragraph.
2. Findings table (gated, evidence-backed, severity-ranked).
3. Summary: shipped-solid / real gaps ranked / gated-latent (with triggers) / human-verify-pending (with exact instructions) / do-NOT-touch.
4. After user confirm: apply tiered fixes, re-verify, report the diff.
5. Offer to log the audit via the `log-folder` skill (production-readiness reports route to the project's `docs/`).

Related skills: `website-security-audit` (the safety axis — run first), `audit-site` (SEO/perf/CRO — different axis, run separately), `log-folder` (route the report), `caveman` (the user often runs this with caveman mode on).

---

## 2025–2026 Updates (verified June 2026)
- **Performance gate = CWV field thresholds**: LCP ≤ 2.5s, INP ≤ 200ms (FID retired), CLS ≤ 0.1 at p75 — lab-only green is not a pass; check CrUX/RUM if traffic exists.
- **Dependency/readiness gate**: OWASP 2025 A03 supply-chain pass (lockfile committed, audit clean or triaged, no postinstall surprises) is now part of launch criteria, alongside the security-audit handoff.
- **Accessibility gate**: WCAG 2.2 AA (24×24px targets, focus-not-obscured, accessible auth) — EU EAA enforcement live since June 2025; US ADA Title II references 2.1 AA.
- **Stack-version gate**: Node 20.9+, Next.js patched past the 2025 RSC CVEs, Supabase RLS policies present on every exposed table (auto-RLS makes missing policies fail-closed — test reads as an anon user).
- Rollback plan must cover: DB migration down-path or expand-contract pattern, image/asset cache purge, and explicit `use cache` invalidation tags if on Next 16 Cache Components.
