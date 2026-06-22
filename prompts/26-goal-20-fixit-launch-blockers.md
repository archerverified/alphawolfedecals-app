# Goal 20 fix-it - Launch blockers (B2B re-triage)

Drafted 2026-06-22 by Cowork orchestration via /prompt-engineer + /superpowers, standardized goal-prompt format. This is a FIX-IT goal: repair the launch-blocking defects found in the Goal 20 signed-in audit, re-triaged under the B2B pivot. Real code touching auth/session, CSP/middleware (deploy surface), email deliverability, and CI, so it runs in Claude Code with the section 3 review plus an advisor second opinion.

## 0. SKILL CHECK FIRST
Invoke /superpowers. Process skills before implementation. Read the current SKILL.md for any skill used. Audit-first per CLAUDE.md section 1; query the graphify graph for the auth/session and middleware/CSP subsystems before touching them (section 8). Build model per CLAUDE.md section 4: scoped subagents plus the section 3 gate, no autonomous merge.

## ROLE
You are Claude in Claude Code fixing the launch blockers that stop a wrap shop (the paying B2B customer) from signing in and receiving orders. You repair root causes, not symptoms. You verify against the live app, never assume.

## CONTEXT (audit-first)
- Source of truth for the defects: docs/deployment/screenshots/2026-06-18-goal-20/findings-signed-in.md (F1 to F9). Audit each one live before fixing; some may have shifted since 2026-06-18.
- B2B pivot (2026-06-18, docs/product/2026-06-18-pivot-decision-b2b.md): the customer is the shop or freelance designer. Re-triage lens: a defect that stops a shop signing in or receiving an order is a HARD blocker; a B2C-only cosmetic is deprioritized.
- New since the audit (Cowork verification 2026-06-22): a fresh Sentry issue NODE-G "An unexpected response was received from the server" on /signin (alphawolfdecals/node), 1 event, 0 users. Treat it as evidence for the auth/session work and root-cause it.
- The e2e smoke gate is reported red and must be restored to green; it protects all later feature work, including the print engine.
- Locked invariants: ADR-0013/0014/0015 deploy config. CSP lives in middleware, so treat CSP edits as deploy surface; any invariant change needs an amendment ADR. DB split (section 2) intact. No PII key rotation. No force-push.

## ACTIVATE (skills + agents + connectors)
- senior-backend + senior-frontend (session establishment, middleware/CSP), email-systems (Resend suppression + deliverability), code-reviewer + an independent advisor (auth/session, CSP/deploy, and email surface), Playwright MCP + webapp-testing (reproduce and verify the signed-in journey).
- Connectors: Vercel (prod env + deploy), Sentry (NODE-G + 0-new after deploy), Resend (clear the suppression on wraps@1stimpression.co and confirm delivery), Supabase (session + last_login_at, RLS), PostHog (confirm config and flags load after the CSP fix).

## DECISION POLICY
Never ask; choose the recommended option, log it as a DECISION in activities.md, surface notable calls. Failing test, review, or deploy = fix or hold-with-plan. Hard stops: auth/session correctness, secret handling, no PII key rotation, no force-push, RLS intact.

## TASK - deliverables (B2B re-triage)
HIGH (transaction blockers, do first):
- D1 Session on verify. Establish an authenticated session as part of a successful OTP verification so a new shop or customer is signed in and does not bounce to /signin on the first auth-gated action (F3). Verify both the customer and shop paths; the shop last_login_at must populate. Root-cause and clear the NODE-G /signin error.
- D2 Shop order delivery. Clear the Resend suppression on wraps@1stimpression.co, confirm a real order email delivers end to end (not suppressed or delayed), and add a minimal in-app shop order view so orders are not email-only (F5). Confirm the customer order email also delivers (it was delivery_delayed).
- D3 Restore the e2e smoke gate to green.

MEDIUM:
- D4 PostHog + CSP. Add the missing PostHog hosts to the CSP allowlist (us-assets.i.posthog.com to script-src and connect-src; us.posthog.com to connect-src), or route the SDK through a same-origin proxy, so remote config and flags load (F1). Advisor review on the middleware change.
- D5 Support inbox. Confirm support@alphawolfdecals.com exists and is monitored, or repoint Support to a monitored address consistent with the 1stimpression.co sending domain (F7).

LOW (cosmetic, include only if cheap, otherwise log and defer): Vercel Web Analytics 404 (F2), brand logo DPI/vector (F4), driver-side export ghosting (F6), password-meter brand color (F8). F9 (auth 429) is expected protective behavior: pace automated runs, no fix.

- D6 Verify. Reproduce the full signed-in journey on a preview with Playwright (sign up, verify, create project, order, with no /signin bounce); confirm the order email delivers in Resend; confirm PostHog config and flags load with no CSP console errors; e2e smoke green; section 3 review + advisor; Sentry 0-new after deploy; net-zero except purged test data.

## CONSTRAINTS
- No em-dashes anywhere. Root-cause fixes, not symptom patches. CSP/middleware changes get the advisor and stay within ADR-0013/0014/0015 (amendment ADR if an invariant changes). Any new table or bucket for the order view gets RLS. Net-zero except purged test data. No PII key rotation, no force-push.

## OUTPUT / DEFINITION OF DONE
1. A new shop or customer is signed in immediately after verifying, with no /signin bounce; shop last_login_at populates; NODE-G root-caused and gone.
2. A real shop order email delivers (not suppressed or delayed) and a minimal in-app shop order view exists.
3. The e2e smoke gate is green.
4. PostHog remote config and flags load with no CSP console errors; the support contact is a monitored address.
5. Reviewed (section 3 + advisor), deployed, prod-smoke + Sentry 0-new, activities entry + mermaid diagram, graphify refreshed.

## OPEN QUESTIONS (choose and log)
- Session-on-verify mechanism (issue the session at verify vs auto-redirect to a pre-filled sign-in). Recommend issuing the session directly.
- In-app shop order view scope now vs deferring the fuller dashboard to the print engine (Goal 22). Recommend a minimal read-only list now.
- Whether to fix the low-tier cosmetics this pass or defer them.

## SEQUENCING NOTE FOR ARCHER
Per the 2026-06-21 plan: this fix-it runs in parallel with the research-only curvature spike (prompts/25) and lands BEFORE the print engine (Goal 22, prompts/24) reaches real shops, so the engine ships on a base where shops can actually sign in and receive orders.
