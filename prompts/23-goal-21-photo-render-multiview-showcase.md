# Goal 21 (proposed) - Photo-render concepts + multi-view marketing showcase

Drafted 2026-06-18 by Cowork orchestration via /prompt-engineer + /superpowers, standardized goal-prompt format. This is a FEATURE build goal (real code touching the generation pipeline, storage, RLS, and spend), so it runs in Claude Code and takes the §3 review plus an advisor second opinion. Sequence versus the Goal 20 fix-it goal is Archer's call (see note at end).

## 0. SKILL CHECK FIRST
Invoke `/superpowers`. Process skills before implementation. Read the current SKILL.md for any skill you use. Audit-first per CLAUDE.md §1, and query the graphify graph for the generation subsystem before touching it (§8).

## ROLE
You are Claude in Claude Code implementing photo-based wrap generation and a multi-view concept showcase, so a customer can upload a photo of their actual vehicle, prompt in plain language, and see real concept renders on their own truck, then click a concept to see it across 3 to 4 sides in a polished, on-brand showcase. You do not break the print-ready pipeline. You verify against the live app, never assume.

## CONTEXT (audit-first)
- **Owner feedback (2026-06-18), the trigger for this goal.** The Alpha Wolf owner described the ideal flow: (1) upload photos of the vehicle + year/make/model, (2) upload logo, (3) prompt the AI for the wrap, (4) see output. He proved the concept in ChatGPT with two short prompts on his real truck photo + logo:
  1. "Can you make me a cool wrap on this truck with my logo?" produced a teal-splatter wrap rendered ON the actual truck photo.
  2. "Can you get rid of all the blue splatter and maybe add some elegant swishes" produced a silver-and-black aggressive design shown across multiple angles in a branded marketing composite (the visual target for D3 below).
- **What already ships (Goal 20 capture).** The app already does ~80% of this: year/make/model selects a real vehicle outline; the brief has an OPTIONAL "add vehicle photos" step; logo upload is a brief step; a plain-language prompt plus style presets; generation returns 3 concept directions with a 4-view switcher; the final flows to the editor with the real logo composited; export produces a 4-page spec pack. Audit this live before building so you extend it, not rebuild it.
- **The delta to build:** (a) render concepts on the customer's UPLOADED photo (image-to-image), not only on the template outline; (b) on concept selection, render that design across 3 to 4 sides and present a polished marketing-style showcase (owner's ChatGPT image 2 is the reference).
- **Hard product nuance, do NOT lose it.** The print-ready spec pack the shops receive needs accurate panel geometry, bleed, and dimensions. A freeform photo render is a gorgeous marketing concept, NOT a production file. ChatGPT makes the picture; it does not make the deliverable. So KEEP the template-geometry render feeding the export pack. The photo render is an ADDITIONAL hero/showcase output, clearly labeled as a concept preview, never sold as the print file.

## ACTIVATE (skills + agents + connectors)
- `senior-frontend` (concept gallery + click-to-expand multi-view showcase UI), `senior-backend` (generation pipeline + photo-input handling + storage), `supabase-postgres-best-practices` (owner-scoped RLS for uploaded photos and generated views), `pdf-expert` (confirm the export pack still derives from the template path), `code-reviewer` + an independent advisor (generation, spend, and RLS surface), Playwright MCP + `webapp-testing` (verify the end-to-end flow).
- Connectors: Supabase (photo + view storage, RLS), fal (image-to-image generation; multi-view consistency), Sentry (0-new after deploy), Vercel (preview + prod smoke).

## DECISION POLICY
Never ask; choose the recommended option, log it as a DECISION in `activities.md`, surface notable calls. Failing test/review/deploy = fix or hold-with-plan. Hard stops: the photo render must never replace the print-geometry path; secret handling; RLS on all new tables/buckets; no PII key rotation; no force-push.

## BUDGET
Phased; cap fal spend for the build/verify runs (suggest a hard ceiling Archer sets at kickoff). Multi-view generation multiplies cost (3 concepts x up to 4 sides), so estimate and confirm the per-design render budget before the full run.

## TASK - phased deliverables
- **D1 Photo as a first-class input.** Promote the optional vehicle-photo step to a real generation canvas: accept one or more customer photos, store owner-scoped (RLS), and pass as the image-to-image base.
- **D2 Photo-render concepts.** Generate the 3 concept directions rendered on the customer's photo (image-to-image), alongside the existing template render. Logo policy decision required: the current app composites the real logo asset (never AI-redrawn); ChatGPT baked the logo into the image. Recommended: AI-styled logo allowed in the concept PREVIEW for realism, real-asset composite enforced on the FINAL and the export. Log the decision.
- **D3 Click-to-expand multi-view showcase.** When a concept is selected, render that design across 3 to 4 sides (front, driver, rear, passenger) and present a polished marketing-composite showcase, on brand (cyan #00AEEF + black, optional Alpha Wolf banner). Owner's ChatGPT image 2 is the visual target.
- **D4 Protect the print path.** The export spec pack continues to derive from the template-geometry render. Label the photo concept clearly as a marketing/preview render, not the production file.
- **D5 Verify.** One real end-to-end run within the fal cap; multi-view consistency (same design across angles); the export pack unaffected and still panel-accurate (pdf-expert); §3 review + advisor; Sentry 0-new; net-zero except purged test data.

## CONSTRAINTS
- No em-dashes anywhere. The photo render is never sold as the print deliverable. New tables/buckets get RLS. §3 + advisor on the generation/RLS/spend surface. Stay within caps. Net-zero except purged test data.

## OUTPUT / DEFINITION OF DONE
1. Customer can upload a vehicle photo and get 3 concepts rendered on their actual vehicle.
2. Clicking a concept expands to a 3-to-4-side marketing-style showcase of that design.
3. The export spec pack still derives from template geometry and stays panel-accurate.
4. Logo policy decided and enforced (real-asset composite on the final/export).
5. Reviewed (§3 + advisor), deployed, prod-smoke + Sentry 0-new, activities entry + mermaid diagram, graphify refreshed.

## OPEN QUESTIONS (note, do not block; choose and log)
- Multi-view consistency method (shared seed/style reference across angles).
- Logo: AI-styled in preview vs real-asset composite throughout.
- Number of sides per showcase (3 vs 4) and whether the marketing banner is generated or an app overlay.
- Per-design render cost ceiling.

## SEQUENCING NOTE FOR ARCHER
Two goals are now queued: the Goal 20 fix-it goal (repair the e2e smoke, sign-in-after-verify, analytics CSP, shop email, etc.) and this Goal 21 (photo-render + showcase). Recommended order: the fix-it goal first (it clears launch-blockers and restores the e2e gate that protects this larger feature work), then Goal 21. Your call.
