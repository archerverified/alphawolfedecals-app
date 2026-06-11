---
name: website-security-audit
description: "Pre-launch security, privacy & abuse audit for websites we build. Use when the user says 'security audit', '/website-security-audit', 'audit this site for security', 'is this site safe to launch', 'check security before pitch/launch', 'OWASP check', 'security headers', 'are my API keys exposed', 'rate limiting', 'privacy/GDPR check', or links a site/repo and asks if it's safe to ship. Architecture-adaptive: classifies the stack first, then runs only the checks that apply (no false flags on static no-DB sites), produces a what's-wrong checklist from real recon, and fixes after the user confirms."
---

# Website Security Audit

Pre-launch security, privacy and abuse audit for the websites we build. Built for AI-built sites (Cursor / Claude / Bolt / Replit / no-build static React / Next.js on Vercel / Firebase hosting).

The core principle that makes this skill correct and not just a generic checklist:

> **Classify the architecture BEFORE you check anything. A full-stack checklist run blind on a static no-DB site false-flags CSP and burns cycles on SQL-injection and auth that do not exist. Every finding must come from real recon, not from a template row.**

This is the lesson the iMotor showcase audit taught: ~40% of a generic vibe-coder checklist was N/A by architecture, one item (CSP) would have been "fixed" into breaking the site, and the one real gap (an unhardened serverless lead endpoint) was nowhere near the top of the generic list.

---

## Recon tooling (this environment)

For Phase 2 (active recon), use the connected **Firecrawl MCP** to fetch pages and response headers and to map the site's URLs — it handles JS-rendered pages and gives clean output for the security-header, exposed-file, and endpoint checks. Fall back to raw fetch if it is unavailable.

## When to use

- Before any site we built goes live or into a client pitch.
- User says "security audit", "is this safe to launch", "check security", "are my keys exposed", "OWASP", "rate limiting", "GDPR check", "/website-security-audit".
- User links a deployed URL and/or points at the source repo and asks if it is safe.

Needs: a live URL and/or the source directory. Ask for whichever is missing — both is best (recon needs live headers AND code).

---

## The four phases

Run these in order. Do not skip Phase 1 — it determines which of everything below even applies.

### Phase 1 — Classify the architecture (mandatory, first)

Recon the site and answer these. The answers gate every later check.

| Question | How to determine | Why it gates |
|---|---|---|
| Static host or full-stack? | `curl -sI <url>`; look for `Server:`, `x-vercel-*`, Firebase, Netlify; check repo for a server dir / API routes | Static host with no backend we own → SQLi, broken auth, session handling are **N/A** |
| Do we own a database? | Repo scan for ORM/SQL/Prisma/Supabase/Mongo; any data-write path | No owned DB → skip the entire SQL-injection / DB-leak class |
| Is there auth / login / sessions? | Repo scan for auth libs, cookies, JWT, session middleware | No auth → skip broken-auth, session, brute-force rows (keep them only if a login exists) |
| Browser-Babel / no-build? | `@babel/standalone` in HTML, `type="text/babel"` scripts, no bundler/`npm run build` | **Critical:** strict `script-src` CSP is architecturally impossible here — the correct target is enforce-hybrid + permanent report-only monitor. Do **NOT** "fix" this. |
| Any dynamic endpoint? | Serverless fn (Supabase Edge / Vercel fn / Cloud Function), form action, anything that takes user input and does something server-side | This is usually the **only** real attack surface on a static site: abuse, spend, spam, validation. Prioritise it. |
| **If a form exists, is it actually wired?** | Open the submit handler in the shipped code. `fetch`/`XHR`/`navigator.sendBeacon`/a real `action=` → wired. `alert()`/`console.log`/`mailto:`/a no-op `preventDefault()` with no request → **NOT wired** | **Critical for ranking:** an unwired form means the endpoint attack surface is **currently ZERO**. Any hardening gap (rate-limit, validation, CORS, spend cap) is **latent/gated** — it must be fixed *before* the form is ever wired, but it is **never a live FAIL** and must not outrank a real one. A spec that exists but is undeployed *and* unreachable is design intent, not an open hole. |
| Third-party embeds / CDN scripts? | Repo + page scan: unpkg/jsDelivr scripts, map tiles, video iframes, fonts, analytics | Drives the supply-chain (SRI/pin) and embed-trust (CSP frame/connect-src) checks |
| Collects PII? | Any form capturing name / email / phone / message; any analytics with PII | Drives privacy policy / ToS / minimisation / data-location checks |
| Under version control? | `git -C <dir> rev-parse` | If not, `.gitignore`/git-history secret checks are N/A — but flag that no version history exists |
| Owned file-upload endpoint? | Repo scan for `multer`/`formidable`/`multipart`/Supabase Storage write/S3 PUT; any wired `<input type="file">` | No upload path → the file-upload class is N/A. If present, it's a top-tier surface (web-shell vector). |
| Package manifest + owned runtime? | `package.json`/`requirements.txt`/`pyproject.toml`/`Gemfile`/`go.mod` present; any serverless fn / API route / server we own | No manifest → dependency-CVE class is N/A. No owned runtime → log-redaction & error-tracking rows are N/A (uptime monitor still applies — the static site itself can still go down). |

Output a one-paragraph **Site Profile** before any checking, e.g.:
> Static Firebase hosting, browser-Babel React (no build), no DB or auth we own, one Supabase Edge Function `submit-lead` → Resend, third-party: unpkg CDN + Leaflet OSM tiles + YouTube iframe, collects name+contact via the lead form, source dir not under git.

### Phase 2 — Active recon (only the applicable checks)

For every item in the **Full Checklist** below whose applicability gate passes, actively determine the real state from the site/code — do not ask the user what they think. Concretely:

- `curl -sI <url>` — capture all security headers, redirects.
- Fetch the live CSP; if browser-Babel, verify it is the enforce-hybrid shape and that a `Content-Security-Policy-Report-Only` monitor exists. Check disposition, not just presence.
- **Config-vs-live CSP/header parity:** diff the CSP (and every security header) in the host config (`firebase.json`/`vercel.json`/`_headers`) against the live response headers. They drift — a hardened repo with an un-deployed config, or a live header with no source-of-truth in the repo, are *both* real failures. Report a mismatch explicitly; only "config and live agree" is a true PASS.
- `grep -rniE 'service_role|sk-[A-Za-z0-9]{16,}|eyJ[A-Za-z0-9_-]{20,}|secret|api[_-]?key|password|BEGIN .*PRIVATE KEY'` across client-shipped code (the dir that actually ships — `public/`, `src/`, build output). Length-bound `sk-…` (raw `sk-[A-Za-z0-9]` false-matches minified vendor blobs). An `eyJ…` hit is a JWT-shaped token — **triage it: a Supabase `anon`/publishable key is design-OK, a `service_role`/secret key is a leak** — never auto-flag without naming the type.
- Inspect host config: `firebase.json` / `vercel.json` / `netlify.toml` / `_headers` — headers block AND rewrites/redirects (open-redirect, wildcard rewrite).
- `.gitignore` + `git log` for `.env`/credentials if under git.
- Scan for XSS sinks: `dangerouslySetInnerHTML`, `innerHTML`, `setHtml`, `v-html`, any raw-HTML render of user/remote input.
- The dynamic endpoint: inspect its code for input validation, rate limiting, bot protection, response shape (does it leak internals?), and paid-API spend caps (Resend / OpenAI / etc.).
- **Dependency CVEs:** run `npm audit --json` / `pip-audit` / `bundle-audit` / `govulncheck` against the committed lockfile. Capture critical+high with fix-version; flag missing lockfile and any `^`/`~` version ranges. Skip if no manifest.
- **File upload handler:** open every upload endpoint's code. Verify magic-byte MIME check (not extension-only), server-side size cap, randomized filename, double-extension reject, storage outside the executable web root (or private cloud storage with signed-URL reads), server-side image re-encode (sharp/Pillow). Skip if no upload path.
- **Logging & observability:** grep the owned-runtime logging code for un-redacted `password`/`token`/`authorization`/full-request-body shapes. Verify an error tracker is configured and receiving events; verify an external uptime monitor watches the prod URL.

Each applicable item resolves to one of: **PASS** / **FAIL** / **FAIL-LATENT** / **N/A (reason)** / **ALREADY-DONE** / **HUMAN-VERIFY** (needs the user to confirm a thing only they know — data region, billing caps set in a provider console).

**FAIL-LATENT** = a real, named gap that has **zero current attack surface** because the thing it protects is not reachable yet (the classic case: an endpoint whose form is `alert()`-only / unwired; also a feature-flagged-off route). It is *not* a pass — it *must* be fixed before a specific future event (e.g. "before any form is wired to POST") — but its severity is capped at its *when-live* value and it must **never be ranked above a live FAIL**. Always state the trigger condition that converts it to a live FAIL.

### Phase 3 — Findings checklist (the output)

Produce the what's-wrong table. Quality over quantity. Format:

```
# Security Audit — <domain> — <date>

## Site profile
<one paragraph from Phase 1>

## Findings
| # | Item | Status | Severity | Evidence | Fix type |
|---|------|--------|----------|----------|----------|
| 1 | submit-lead has no rate limiting (form is alert()-only — unwired) | FAIL-LATENT | High when wired / none today | submit handler issues no request; hardening spec exists, undeployed | human-deploy (gate: before forms POST) |
| 2 | No privacy policy / ToS | FAIL | Med | no /privacy route, lead form collects PII | human-copy |
| 3 | Security headers | PASS | - | 5 headers + CSP enforce-hybrid present | - |
| 4 | Strict script-src CSP | N/A | - | browser-Babel: impossible by design, monitor in place | do-not-touch |
...

## Summary
- Shipped & solid: <list>
- Real open gaps (do before launch): <ranked list>
- Soft gaps: <list>
- Do-NOT-touch (would break the site): <list>
```

Severity = High (exploitable / cost / data-loss before launch) / Med / Low. Rank the summary by real risk, not checklist order. A **FAIL-LATENT** row carries its *when-wired* severity for planning but is grouped under "gated — fix before &lt;trigger&gt;", never under "do before launch" alongside live FAILs; a reviewer scanning the table must never mistake a dormant gap for an open hole.

### Phase 4 — Confirm, then tiered fix

Present the findings. **Ask the user to confirm before fixing anything.** Then apply the **tiered** fix policy:

- **Auto-fix (after the user's OK)** — code/config we own and that is safe to change:
  - Add/correct security headers in host config.
  - Add/correct CSP **to the architecturally correct target** (never strict script-src on browser-Babel — enforce-hybrid + report-only monitor).
  - Add SRI + version-pin to CDN `<script>`/`<link>`.
  - `.gitignore` `.env`/credentials; flag (do not auto-purge) git history if a secret was committed — that needs `git filter-repo` + key rotation, a human decision.
  - Add input validation + output escaping; fix XSS sinks.
  - Tighten host rewrites/redirects (kill open redirects / wildcards).
- **Human-only (flag with exact instructions, never silently "fix")**:
  - Privacy policy / ToS copy (legal text — draft it, but the user owns/approves it).
  - Paid-API spend caps + billing alerts set in the provider console (Resend / OpenAI / etc.).
  - Infra rate-limiting deploy (serverless fn change → redeploy, often touches secrets/infra).
  - Key rotation / git-history purge after a leak (revoke → regenerate → rotate; irreversible-ish, confirm each step).
  - Anything the user must verify in an external dashboard (data region, GDPR processor terms).
- **Do-NOT-touch** — call out explicitly so a later pass or another agent does not "fix" it:
  - Strict `script-src` on a browser-Babel site (impossible; precompiling JSX is a forbidden build step on these sites).
  - A working enforce-hybrid CSP + its report-only monitor.

Re-verify after fixing (re-curl headers, re-grep, re-fetch CSP). Report what changed with evidence.

---

## Full checklist (the vibe-coder list, made active + gated)

Each item: **gate** (when it applies) → **how to actively check** → **fix tier**.

### 1. Legal & Privacy
- **Privacy policy present** — gate: collects any PII. Check: look for a privacy route/page; compare its claims to what the site actually collects. Fix: human-copy (draft + user approves).
- **Data storage location known** — gate: any data leaves the browser. Check: trace where form/analytics data lands (which provider, which region). Fix: human-verify.
- **GDPR / data-law obligations** — gate: PII + any EU reach. Check: cookie consent present? data-deletion path? processing terms? Fix: human (consent banner is auto-able; legal terms are human-copy).
- **No over-collection** — gate: any form. Check: list every field; flag any not strictly needed. Fix: auto (remove fields) after OK.
- **Terms of service present** — gate: always for a public site. Check: ToS route exists. Fix: human-copy.

### 2. Security Basics
- **OWASP Top 10** — gate: scope to what exists. Run only the applicable members below; explicitly mark the rest N/A with reason.
- **Security headers** — gate: always. Check: `curl -sI` for `Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`. Fix: auto.
- **SQL injection** — gate: only if we own a DB with raw queries. Else N/A. Check: parameterised queries / ORM on every input path. Fix: auto.
- **XSS** — gate: always (any rendered content). Check: every `dangerouslySetInnerHTML`/`innerHTML`/`setHtml`/`v-html`/raw-render of user or remote data; framework auto-escaping intact. Fix: auto.
- **Auth & session handling** — gate: only if a login exists. Else N/A. Check: session expiry, token storage, login bypass, password handling. Fix: mixed (flag infra).
- **Object-level authorization (IDOR / OWASP A01)** — gate: only if we own an endpoint/data store that returns user- or entity-scoped records selected by a client-supplied id/key/slug. Static site with no owned data store ⇒ N/A. Check: from the endpoint/code, attempt to read or mutate a record under a different identity or an incremented/guessed id and confirm it is denied server-side (ownership/tenant check enforced in code, not merely hidden in the UI). This is *authorization* — explicitly distinct from "Auth & session handling" above, which is authentication/session only; an endpoint can have no login yet still leak by id. Fix: auto (add the server-side ownership/tenant check); flag human if it needs an auth-provider/infra change.
- **File Upload Security (web-shell prevention)** — gate: any owned endpoint accepts files, OR a client writes directly to Supabase/S3. Check: server-side MIME validation via **magic-bytes** (not extension), server-side size cap (frontend cap is UX, not security), randomized filename (never reuse the client's filename — kills path-traversal), reject double extensions (`file.php.jpg`), files stored outside the web-executable root **or** in cloud storage with private ACL + signed-URL reads, download served through a proxy endpoint that re-checks auth, images re-encoded server-side (sharp/Pillow) to strip embedded scripts and EXIF. **Critical:** extension-only validation is FAIL — it is the classic web-shell vector. Fix: auto for validation/re-encode/random-name code; **human** if files currently live in the web root (storage migration is irreversible-ish).

### 3. Secrets & API Keys
- **.env gitignored** — gate: under git. Check: `.gitignore` + `git log --all -- '*.env'`. Fix: auto for gitignore; **human** for history purge + rotation.
- **No keys in frontend** — gate: always. Check: grep client-shipped code for `service_role`/`sk-`/secret/private key. Public/anon/publishable keys are design-OK — say so, do not false-flag. Fix: auto move/rotate (rotation is human).
- **API responses don't leak** — gate: any endpoint we own. Check: response shape — no passwords/tokens/internal IDs/stack traces. **Also (distinct surface): framework debug mode OFF in production** — no interactive traceback / dev error overlay served on the HTML error path (Next.js dev overlay, Flask `debug=True`, Django `DEBUG=True`, Rails dev errors); this is the HTML error page + live console, not the JSON response shape above. Gate: any server/framework runtime in prod; static no-build with no server framework ⇒ N/A. Fix: auto (flip the prod flag/env).
- **Secrets out of logs/errors** — gate: any endpoint/logging we own. Check: error handler + logs sanitised. Fix: auto.
- **Keys server-side / proxied** — gate: any third-party API call. Check: third-party secret keys only in serverless/edge, never client. Fix: auto (move) + human (rotate if exposed).
- **Dependency hygiene (supply chain)** — gate: any package manifest in the source dir. Check: run the language audit (`npm audit`, `pip-audit`, `bundle-audit`, `govulncheck`); severity-rank CVEs (critical/high first); verify a lockfile exists and is committed; flag any dep installed from a git URL/tarball/non-registry source; flag any direct **or transitive** dep with a critical/high CVE that has a fix available; flag any dep last-updated > 12 months ago. Fix: auto for safe (patch/minor) bumps + lockfile commit; **human-confirm** for major bumps (may change behavior). **Standing recommendation:** enable Dependabot/Renovate so the check re-runs continuously, not just at audit-time.

### 4. Abuse Prevention
- **Rate limiting on endpoints** — gate: any dynamic endpoint we own. Check: limiter present (IP + identity), exponential backoff on any auth. Fix: human-deploy (infra) — provide exact spec.
- **Spend alerts + hard caps on paid APIs** — gate: any paid API (email, LLM, SMS). Check: provider cap + alert configured; in-code daily cap. Fix: human (console) + auto (in-code cap).
- **Input validation everywhere** — gate: any user-facing field. Check: type/length/format/range validated server-side, not just client. Fix: auto.
- **Bot protection** — gate: any submit/signup. Check: honeypot / timing / Turnstile-or-equivalent / rate limit on submit. Fix: mixed (honeypot+timing auto; CAPTCHA infra is human).
- **Abuse plan** — gate: any user-generated input or paid API. Check: documented plan for spam/illegal-content/account-flood. Fix: human (document).

### 5. Observability & Logging
- **Error monitoring** — gate: any owned runtime (serverless fn, API route, server). Check: error tracker (Sentry / Logflare / hosting-platform log drain / equivalent) wired and receiving events — not just `console.log` that vanishes when the process restarts. Fix: human (create account, get DSN) + auto (init code).
- **Uptime monitoring** — gate: always (any public URL can go down). Check: an external monitor (UptimeRobot / Better Stack / Pingdom) hitting the production URL on a schedule with alert routing. Fix: human (account + URL + notification channel).
- **Security event logging** — gate: any owned auth OR sensitive endpoint. Check: login attempts (success + fail) with timestamp/IP/UA, authorization denials (403/401), admin actions, password/email/role changes, bulk data access — all logged to a store an attacker can't edit by compromising the app (append-only / separate service). Fix: auto (logging code) + human (tamper-resistant storage choice).
- **Log redaction** — gate: any owned logging path. Check: logs do **not** contain plaintext passwords, password hashes, full API keys, full session tokens, credit-card numbers, SSNs, or full request bodies with PII. Sensitive values are masked (`sk_live_****1234` shape). Verify log storage is not publicly readable. Fix: auto.
- **Suspicious-activity alerts** — gate: any owned auth. Check: alert rules for >10 failed logins on one account in 5 min, single IP hitting >50 accounts, bulk export, login from a new country, baseline-exceeding 401/403 rate. Fix: auto (rule definitions) + human (alert delivery channel — Slack/email/PagerDuty).

### 6. Copy-paste prompts
Keep the five audit prompts from the source checklist (full security audit / secrets / headers / rate limiting / privacy) available to hand the user for a second-opinion run in another tool. They are a fallback, not the method — this skill's active recon is the method.

For per-feature use *during build* (the prompt-pack workflow — paste into the AI tool building a feature, run twice until clean), the two highest-leverage prompts:

**Master Security Review** — run after every meaningful feature:
> I just finished building [feature]. Review only the new code for security issues. Check each of these specifically: (1) Are there permission checks on every endpoint — both authentication (logged in?) and authorization (allowed to access this specific resource?)? (2) Are there any hardcoded secrets, API keys, or tokens? (3) Is user input validated on the backend, not just the frontend? (4) Are error messages safe — no stack traces, file paths, or database details exposed? (5) Is all user-generated content sanitized before being stored or displayed? (6) Are database queries using parameterized queries, not string concatenation? (7) If there are file uploads, are they validated and stored securely? (8) Is there rate limiting on any endpoint that could be abused? (9) Are there any CSRF vulnerabilities in state-changing operations? (10) Is sensitive data encrypted and not over-exposed in API responses? Flag everything you find, fix it, then tell me what you changed and why.

Run it twice — the second pass catches what the first pass introduced or exposed.

**Pre-launch Prompt** — run once before going live:
> I'm about to deploy this app to production. Do a comprehensive security review of the entire codebase. Check: (1) All secrets are in environment variables, not in code. (2) All user input is validated on the backend. (3) All database queries use parameterized queries. (4) All API endpoints have authentication and authorization checks. (5) Error messages don't expose internal details. (6) CORS is locked to my domain only. (7) Debug mode is off. (8) All cookies have secure, httpOnly, and sameSite flags. (9) HTTPS is enforced everywhere. (10) Rate limiting is in place on login and sensitive endpoints. (11) File uploads are validated and stored securely. (12) Dependencies have no known critical vulnerabilities. (13) No test credentials, dummy data, or development artifacts remain. Give me a pass/fail for each item and fix anything that fails.

These are the fast user-facing path. The recon-based audit (Phases 1–4 above) is the rigorous path and **supersedes the prompts on any conflict** — the prompts will false-flag CSP on browser-Babel sites, won't grade severity, and won't distinguish public from secret keys.

---

## Added checks (what the generic list misses for the sites we build)

These are mandatory rows for our stack (static React no-build on Firebase/Vercel). The generic list has no row for them and would either miss them or "fix" them wrong.

1. **Browser-Babel CSP reality** — if `@babel/standalone` compiles JSX in-browser, a strict `script-src` is architecturally impossible (Babel DOM-injects un-hashable scripts; nonces need a server; precompiling = a forbidden build step). The correct, passing state is **enforce-hybrid** (`script-src 'self' 'unsafe-eval' 'unsafe-inline' https://<pinned-cdn>`, host-locked, no wildcard) **plus a permanent `Content-Security-Policy-Report-Only`** strict-hash monitor. A generic "add strict CSP" check is a FALSE FAIL here. **Do-NOT-touch** if already in this shape.
2. **CDN supply-chain (SRI + version-pin)** — every `<script>`/`<link>` from unpkg/jsDelivr must have a `sha384` `integrity` + `crossorigin` and an exact pinned version (never `@latest`). Gate: any CDN asset. Fix: auto. Keep as a standing row so a future CDN bump can't silently drop integrity.
3. **Static-host config surface** — `firebase.json`/`vercel.json`/`_headers` rewrites & redirects are an attack surface the generic list ignores: open redirects, wildcard rewrites, missing redirect for renamed routes. Gate: always. Fix: auto.
4. **Third-party embed trust** — map tiles (Leaflet/OSM), video iframes (YouTube), fonts, analytics each add an origin. CSP `frame-src`/`connect-src`/`img-src` must be locked to exactly those origins, no wildcards. Gate: any embed. Fix: auto.
5. **CSP report-only monitor is a live control** — if a report-only monitor exists, it is not "done and forget": add a standing recommendation to review its reports periodically. One-shot security thinking is the failure mode.
6. **Stale preview/deploy channels** — Firebase preview channels / Vercel preview URLs that expose pre-fix or pre-launch state. Gate: any preview channel exists. Check: list channels + expiry, **then `curl` the channel and compare its security headers/CSP to production.** Severity is conditional: a channel serving a *pre-hardening / weaker* policy (or pre-launch content) is **Med** (it's a live bypass of the fix); a channel serving a byte-identical hardened policy is **Low** (just an extra indexable URL). Never rate it without fetching it. Fix: human (delete/expire).
7. **No-build constraint is a security fact** — "precompile JSX to remove `unsafe-eval`" looks like a valid fix and is a hard NO on these sites. Document it in the report so no later pass or agent breaks the site trying to "harden" it.

---

## Stack profiles (fast classification reference)

| Profile | SQLi | Auth/session | Strict CSP | Main real surface |
|---|---|---|---|---|
| Static host, browser-Babel React, no DB/auth, 1 serverless lead fn (iMotor-class) | N/A | N/A | Impossible — enforce-hybrid + monitor | The serverless endpoint **iff a form actually POSTs to it** — check the submit handler first; an `alert()`/no-op handler ⇒ surface is ZERO ⇒ the hardening gap is **FAIL-LATENT/gated**, not live. Plus privacy/ToS if it takes PII. |
| Static host, no backend at all (pure brochure) | N/A | N/A | Possible — do it strict | XSS in any raw-HTML render; CDN supply-chain; embeds. Privacy only if analytics/PII. |
| Next.js on Vercel, API routes, owned DB + auth | Applies | Applies | Possible | Full list applies. Prioritise auth, SQLi, secrets in serverless, rate limit on API routes, spend caps. |

If the site does not match a profile, classify from Phase 1 answers directly — the profiles are shortcuts, not the gate.

---

## Hard rules

- **Classify before you check.** No finding may be a template row — it must cite real recon evidence.
- **Never false-flag a public/anon key** as a leaked secret. Name the key type; only `service_role`/secret/private keys are leaks.
- **Never "fix" a correct enforce-hybrid CSP** or propose precompiling JSX on a no-build site. Mark do-NOT-touch.
- **Confirm with the user before any fix.** Then auto-fix only the owned-code/config tier; flag human-only items with exact, specific instructions (not vague advice).
- **A leaked secret is not fixed by editing the file** — revoke → regenerate → rotate, and history-purge if committed. Treat as human, confirm each step, never silent.
- **Re-verify after fixing** with the same recon commands and report the diff with evidence.
- **Check the wire before you rank the endpoint.** A serverless/form endpoint is only a live finding if a form actually issues a request to it. Inspect the submit handler — `alert()`/`mailto:`/no-op ⇒ surface is ZERO ⇒ classify **FAIL-LATENT/gated** with the trigger condition, never a live FAIL. The lesson: don't rank a dormant gap as an open hole.
- **Config and live must agree.** Always diff host-config headers/CSP against the live response. "Live is hardened but the repo isn't" (un-committed manual edit) and "repo is hardened but live isn't" (un-deployed) are both real failures — a true PASS requires parity.
- **No fabricated facts.** If a state can't be determined from recon, mark HUMAN-VERIFY and say exactly what to check where — don't guess PASS.
- **Extension-only file validation is not validation.** Any upload path that trusts `.jpg` instead of reading magic bytes is FAIL — that's the web-shell vector. The frontend size cap is UX; the server-side cap is the security control.
- **Logs without redaction are a leak, not an audit trail.** A log-row PASS requires grepping the logging code for `password`/`token`/`authorization`/PII shapes — silence is not proof.
- **Dependency hygiene is a standing finding.** A clean `npm audit` today doesn't fully pass the row — Dependabot/Renovate (or equivalent continuous check) must be enabled, otherwise the next CVE silently rots in.

---

## Output

1. Site Profile paragraph.
2. Findings table (gated, evidence-backed, severity-ranked).
3. Summary: shipped-solid / real gaps ranked / soft gaps / do-NOT-touch.
4. After user confirm: apply tiered fixes, re-verify, report the diff.
5. Offer to log the audit via the `log-folder` skill (security audits route to the project's `docs/`).

Related skills: `audit-site` (perf/SEO/CRO — different axis, run separately), `password-security`, `log-folder` (route the report), `caveman` (the user often runs this with caveman mode on).

---

## 2025–2026 Updates (verified June 2026)

### OWASP Top 10:2025 (replaces 2021 list — finalized Jan 2026, 175k+ CVEs analyzed)
1. **A01 Broken Access Control** (now includes SSRF)
2. **A02 Security Misconfiguration** (jumped from #5 — hardening drift, default creds, verbose errors, cloud misconfig)
3. **A03 Software Supply Chain Failures** (NEW — highest avg exploit/impact scores; lockfiles, dependency provenance, build-pipeline integrity; 2025 npm worm attacks e.g. Shai-Hulud)
4. **A04 Cryptographic Failures** (down from #2)
5. **A05 Injection** (down from #3 — SQLi, XSS, command injection)
6. A06 Insecure Design · 7. A07 Authentication Failures · 8. A08 Software & Data Integrity Failures · 9. A09 Logging & Alerting Failures
10. **A10 Mishandling of Exceptional Conditions** (NEW — fail-open errors, unhandled exceptions leaking state, logic errors)

### Audit checklist deltas
- Version-gate check: Next.js past CVE-2025-55184/55183 + RSC RCE; framework/CMS CVEs cross-checked against deployed versions before any other finding.
- Supabase recon: anon-key surface enumeration, RLS policy presence per exposed table (auto-RLS means missing-policy = silent lockout, mis-written policy = breach), storage bucket ACLs, edge-function env leakage.
- CSP grading: nonce/strict-dynamic = pass; unsafe-inline = fail regardless of other headers.
- Rate limiting: verify on auth, password reset, and any AI/LLM endpoints (cost-abuse is the 2025+ attack pattern).
