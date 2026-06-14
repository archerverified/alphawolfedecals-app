# Alpha Wolf Wrap Studio — Investor Update (June 2026)

_Refreshed Goal 10, 2026-06-14. Plain-English snapshot of where the product is and what's between us and public launch._

## What it is

A web app where a customer designs a custom vehicle wrap **on a picture of their own exact vehicle**, gets AI-generated concept directions, refines the one they like, and downloads a **print-ready pack** to hand to a wrap shop. No design skills needed. The shop side is a lightweight production queue + a "find a shop near you" handoff. Today it's grant-credit only — no payments wired yet (deliberate; Stripe is a later goal).

## The journey (live today)

1. Pick your vehicle from an accurate, wrap-safe template.
2. Answer a short guided brief (style, colors, logo, tint rules).
3. Get **3 AI concept directions rendered on your actual vehicle's views**.
4. Tweak with a chip or a sentence; lock a free export-quality final.
5. Open it in the editor with your real logo composited in.
6. Export the spec pack → take it to a shop (or use the in-app locator).
7. Share a link to let friends vote on your favorite concept.

## What we built (Goals 6 → 10)

- **Goal 6 — Template Studio:** operator tooling to author accurate vehicle templates + panels.
- **Goal 7 — AI generation:** the full brief→concepts→iterate→final→editor→export pipeline, on the customer's real vehicle. Cost-controlled (see below).
- **Goal 9 — Growth loops:** share-for-feedback + concept voting, give-2/get-2 referrals, shop locator.
- **Goal 9.1 — Data hygiene:** stopped a test-data leak into the live database.
- **Goal 10 — Launch hardening (this milestone):** passed an independent security audit, ran the production-readiness gate, wired anti-abuse + spend rails, scaffolded legal, re-baselined performance, and prepared the SEO/indexing flip.

## Proof points / metrics

- **Real end-to-end journey works in production** — a full design→generate→export run completed for **~$0.70** of AI spend.
- **AI cost is capped** — a hard **$5/day global spend cap** with a per-request gate and a daily monitor; refunds are automatic if a run fails.
- **Security: clean.** Independent audit found **no critical or high issues** — strict per-user data isolation (row-level security), encrypted personal data, locked-down headers, no leaked keys.
- **Reliability: rollback + backups proven.** A documented instant-rollback path and a **verified backup-restore drill** (we actually restored a copy and matched it row-for-row).
- **Performance:** layout stability is perfect (CLS 0); load time is solid (cold-start latency on the current hosting tier is the one thing to tune at scale).
- **Clean slate for launch** — the live database holds just the real operator + the test login after a full cleanup.

## What stands between us and public launch (honest list)

1. **Legal copy** — Terms + Privacy are scaffolded and reachable, but the binding text is yours to supply (we never write binding legal language).
2. **Password recovery** — a "forgot password" flow needs to be built (the back end supports it; the screen doesn't exist yet).
3. **Catalogue depth** — the editor is fully functional on our flagship template (Ford Transit); the other catalogue vehicles need their panel data authored before we offer them (or we launch with the paneled set).

Once those clear, launch is a short, scripted sequence (flip search indexing on, run the smoke test, confirm monitoring). Everything else — security, anti-abuse, spend control, rollback, backups, SEO posture — is ready and waiting behind that flip.

## Not in scope yet (by design)

Payments/Stripe, the shop-side print/paneling engine, and a full vehicle catalogue are deliberately later milestones — the current product is the customer design + handoff loop.
