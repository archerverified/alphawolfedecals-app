# Goal 20 (continued) - Signed-in customer journey capture (Claude Code + Playwright MCP)

Drafted 2026-06-18 by Cowork orchestration via /prompt-engineer + /superpowers, in the standardized goal-prompt format (Role / Hard-stop / Audit-first / Activate / Decision policy / Budget / Environment / Inputs / Task / Constraints / Definition of Done). Executor: Claude in Claude Code with the Playwright MCP active (user scope). Single autonomous run; ship the screenshots, do not block on questions.

To run: fresh `claude` session in `/Users/ashton/Documents/AlphaWolfDecals-App` with the Playwright MCP connected, then:

```
/goal prompts/22a-goal-20-claude-code-signed-in-capture.md
```

If `/goal` expects inline text, paste everything below the `---`.

---

## 0. SKILL CHECK FIRST
Invoke `/superpowers` before acting. Process skills before implementation: read this prompt, the master spec, and the existing captures, then drive. Read the current SKILL.md for any skill you use, never from memory (CLAUDE.md §0).

## ROLE
You are Claude in Claude Code executing the signed-in half of Goal 20: drive the LIVE production app as the signed-in test customer through the full guided-design journey, and capture each meaningful screen as a real full-page PNG file. You observe and document only. ZERO app or code changes; net-zero on prod data except one disposable test account that you purge at the end. You verify against the live app, you never assume.

## HARD STOP - secret handling (read first)
- The repo is PUBLIC. Do NOT hardcode any secret in a committed file. The test-account password is supplied at runtime (see Inputs); never write it into this prompt, a commit, CI, or PR text. The Goal 19 gitleaks scanner will, and should, flag a plaintext secret.
- Reference env-var NAMES only, never values. Never echo, print, or `cat` `.env.local`, keys, tokens, or the test password.

## WHY THIS RUNS HERE (not Cowork)
Cowork captured the full PUBLIC surface as real PNGs (`docs/deployment/screenshots/2026-06-18-goal-20/`, files 01-17). The signed-in journey could not be filed from Cowork: Claude-in-Chrome is authenticated but neither persists screenshots nor (correctly) exposes the session for transport; the desktop capture tool also does not persist files there; a sandbox headless browser persists files but cannot authenticate. The Playwright MCP here drives an authenticated browser AND saves files, so the signed-in capture belongs in Claude Code. This is the normal split: Claude Code drives the browser, Cowork verifies, orchestrates, and assembles the deliverable.

## AUDIT-FIRST (before driving anything - CLAUDE.md §1)
1. Read `prompts/22-goal-20-full-app-test-and-document.md` (master spec) + `CLAUDE.md` §0-§8 + `activities.md` top entries.
2. List `docs/deployment/screenshots/2026-06-18-goal-20/` (01-17 are the public surface). CONTINUE numbering from 18-; do NOT recapture the public pages.
3. Skim `prd-b2c-guided-design-flow.md` so you capture the intended steps in the right order.
4. Confirm the live prod deploy is the target and that you are signed in as the test user before spending any fal.

## ACTIVATE (skills + agents + connectors + MCPs)
- **Playwright MCP** (core): drive the authenticated browser, take full-page screenshots to files, and read console + network at each major step. The Goal 19 sharp 500 reached prod because a green build is not a green runtime; reading console/network here is the antidote.
- **`webapp-testing`**: Playwright capture, console, and network patterns for reliable, repeatable steps.
- **`pdf-expert`**: verify the export-pack PDF against the brief (right vehicle, logo present, AI hero, provenance metadata).
- **`systematic-debugging`**: if a step fails or the journey stalls, form a theory and gather evidence before retrying; do not brute-force and burn fal.
- **Connectors**: Resend (retrieve the OTP from the sent email if sign-in requires a code); Supabase (verify + purge the test account's data at closeout, confirm net-zero); Sentry (0-new on `alphawolfdecals / node` after the run); Vercel (confirm prod is the deploy under test).

## DECISION POLICY
Never ask; choose the sensible option, log it (DECISIONS in `activities.md`), surface notable calls in the report. A failing step is retried or adjusted via `systematic-debugging`, never silently skipped. Hard stops: secret handling; no app or code changes; no force-push; no PII key rotation; purge only the run's own test data.

## BUDGET
$10 fal, minimal Anthropic. ONE clean full-pipeline generation (3 concepts, 1 iteration, 1 free final), no repeats, no wasted credits. If a generation fails, debug the cause before re-spending.

## ENVIRONMENT (net-zero)
Live prod. The only data you create is the one disposable test account plus its project, purged at closeout. No other prod writes. Confirm Sentry 0-new after the run.

## INPUTS
- Prod: https://alphawolfedecals-app-web.vercel.app
- Test account: bigtester420@gmail.com . Password supplied at runtime: paste it into this `claude` session, or set `TEST_ACCOUNT_PASSWORD` in `.env.local` (gitignored). It is deliberately NOT in this committed file because the repo is public. If sign-in returns an emailed code, retrieve it via the Resend connector.
- Brand: cyan #00AEEF + black, Geist Sans + Geist Mono, transparent Alpha Wolf logo (`Alpha Wolf Decals Design System.zip` at repo root).
- Existing captures: `docs/deployment/screenshots/2026-06-18-goal-20/` (01-17 public). Continue from 18-.
- Gotcha: auth routes rate-limit (429) under bursts; pace navigations a few seconds apart; do not hammer.

## TASK - deliverables (capture each as a full-page PNG `NN-slug.png`, continuing from 18)
- **D1** Sign in as the test user. Vehicle selector with a clean, well-rendering vehicle chosen, plus its views.
- **D2** Brief builder: wrap type, upload the transparent Alpha Wolf logo, assign zones, preset + a prompt featuring the Alpha Wolf cyan/black look. Capture each meaningful state.
- **D3** Review step + the Generate seam (credit cost visible).
- **D4** Generation studio: the 3 AI concepts on the vehicle, the view switcher, watermarked previews. Read console + network here and capture any 5xx as a finding.
- **D5** One iteration/refine on a concept (chips + the refined render).
- **D6** Pick a concept, the free final, the un-watermarked renders.
- **D7** Editor: the canvas with the locked AI layers + the real logo composited.
- **D8** Export pack: trigger export, save the PDF, capture the flow. Verify the PDF with `pdf-expert` against the brief.
- **D9** Account surfaces: credit balance/header, projects list with the new project.
- **D10** Empty + error states reachable signed-in (zero-credit waitlist sheet if you drain credits, etc.).
- **D11** Shop side signed-in (any shop dashboard beyond `/signup-shop`), minus admin.

## CONSTRAINTS
- No app or code changes. NO EM-DASHES anywhere (copy, docs, commits, PR, UI): commas, colons, parentheses, hyphens.
- The test account is disposable: purge it (and its project, storage, credits) at closeout. Net-zero except that account.
- Stay within the fal + Anthropic caps. No secret values emitted or committed.

## OUTPUT / DEFINITION OF DONE
1. Signed-in journey captured to files (18- onward), full pipeline, export PDF saved and `pdf-expert`-verified against the brief.
2. Console + network checked at the generation step; any runtime error captured as a finding.
3. Separate findings list (no fixes this pass) appended. Fold in the Cowork-logged public-surface findings: Support is a `mailto:support@alphawolfdecals.com` (different domain than the Resend sending domain 1stimpression.co; confirm the inbox is monitored); the signup password-strength meter renders red on a cyan/black brand; auth routes rate-limit hard under bursts.
4. Test account + data purged; zero artifacts remain; Sentry 0-new confirmed.
5. `activities.md` top entry written. New PNGs left in `docs/deployment/screenshots/2026-06-18-goal-20/` for Cowork to assemble the HTML.

## HAND-BACK
Leave the new PNGs in the screenshots folder. Cowork assembles the single self-contained HTML presentation (public + signed-in) on the Alpha Wolf design system.
