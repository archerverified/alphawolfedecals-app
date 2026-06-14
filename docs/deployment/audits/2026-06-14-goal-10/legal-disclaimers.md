# Legal + Disclaimers — Goal 10 D4 — 2026-06-14

**Binding legal copy was NOT provided** (repo or prompt). Per the hard stop, no binding legal language was fabricated. The structure is scaffolded with clearly-marked placeholders and flagged launch-BLOCKING; the real copy is Archer's to supply.

## What shipped this gate

- **Reachability fixed** (closes D2 production-readiness #5): added a shared `SiteFooter` (Terms / Privacy / Support) mounted on the landing page, the `(public)` route group (terms/privacy/share), and the authenticated shop dashboard. `/terms` + `/privacy` were previously unreachable (no footer/link anywhere).
- **`/terms` + `/privacy`**: scaffolded pages carry an amber "Draft — not yet in force" banner now prefixed with the explicit **`[[PLACEHOLDER — pending Archer legal copy]]`** marker, and are `robots: { index: false }` so they can't be indexed until real copy lands. Section structure is present (Acceptance / Use / Accounts / Contact; Collect / Store / Choices / Contact) with `[Placeholder.]` bodies — scaffolding only, no binding language. Contact addresses aligned to `@alphawolfdecals.com`.
- **Tint disclaimer** (brief wizard `TintStep.tsx`): the consumer disclaimer is present ("Laws change — your installer confirms what's legal before any film goes on") and carries a `LEGAL-PASS FLAG` comment for Archer's wording review (PRD §8). Not rewritten — final wording is Archer's call.

## Cookie / analytics consent — DECISION

**No consent banner required for the current cookie set.** The app sets only **functional** cookies: the auth session (`__Host-alphawolf.session`), the CSRF token (`__Host-alphawolf.csrf`), and the share-page `voter_token` (anonymous dedup). First-party analytics (PostHog, Vercel Analytics/Speed-Insights) are the only analytics; no third-party marketing/ad-tracking cookies exist. Under GDPR/ePrivacy, strictly-necessary cookies don't require consent.

- **HUMAN-VERIFY (Archer):** if EU traffic is actively targeted AND PostHog/Vercel Analytics are configured to drop non-essential cookies, add a consent banner (PostHog supports cookieless/memory persistence as the simpler alternative). Re-evaluate at the point real EU marketing begins.

## LAUNCH-BLOCKING INPUTS (Archer — never fabricated by the agent)

1. **Final Terms of Service copy** → replace the `/terms` placeholder.
2. **Final Privacy Policy copy** → replace the `/privacy` placeholder; must describe collection, storage (Supabase us-west-1), encryption-at-rest, retention, AND a working data access/deletion request path (`/privacy` "Your choices" notes the path must be wired before launch).
3. **Tint disclaimer wording sign-off** → confirm/adjust the `TintStep.tsx` `LEGAL-PASS FLAG` text.

These three are carried into the D7 launch checklist as explicit gates and into the final GO/NO-GO.
