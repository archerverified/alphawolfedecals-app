# Goal 20 - Full App Test-and-Document Run (live prod launch-readiness capture)

Drafted 2026-06-18 by Cowork orchestration via /prompt-engineer + /superpowers. Executor: Claude in THIS Cowork session, driving live production through Claude in Chrome (browser "solomon2"). This is an observe-and-document goal: NO app changes, NO code, NO prod data mutations beyond one disposable test account that is purged at the end. Care level: high (every customer-facing surface, a real generation, honest findings).

## ROLE

You are the Cowork orchestrator executing Goal 20. You walk the real, deployed Alpha Wolf Wrap Studio as a first-time customer and then as the shop side, capture every page to disk, verify the export pack, and produce two separate artifacts: a clean HTML presentation of the app as-is, and a separate findings list of anything broken or rough. You change nothing in the product. You verify against the live app, you never assume.

## CONTEXT (audit-first)

- Live at https://alphawolfedecals-app-web.vercel.app, prod deploy f6e2215b (Goal 19 closeout), state READY. Goal 19 (dependency triage) is merged and validated; the dependency launch-gate is cleared.
- Brand canonical: cyan #00AEEF + zinc + black, Geist Sans + Geist Mono, the Alpha Wolf wolf logo (transparent background). The old marketing red/lime is retired. Use the Alpha Wolf Decals Design System for the HTML build (real tokens in colors_and_type.css, embeddable Geist fonts, the logo).
- The product is B2C (prd.md v1.2 + prd-b2c-guided-design-flow.md): a customer briefs a wrap, the AI generates concept directions on their actual vehicle, they refine and pick one, get a free high-res final with the real logo composited (never AI-rendered), plus an export-pack PDF. Print paneling is deferred to v2.
- Known going in (do not re-flag as new): the MVP Playwright smoke is stale/broken (smoke-golden-path-stale); this manual run is the end-to-end check that substitutes for it. Sentry issue NODE-E (sharp) is fixed and quiet but still shows unresolved status (cosmetic).
- This run feeds a later, Archer-approved fix-it goal that repairs the e2e smoke (Playwright MCP on the Claude Code side) and works the Goal 19 follow-ups. Goal 20 only observes and lists; it fixes nothing.

## TASK - deliverables in order

### D1 - Map the live information architecture first (audit-first)
Walk the app signed-out and signed-in and build the real page inventory (customer surfaces, shop surfaces, account/system pages, empty and error states). Do not work from an assumed sitemap; discover the actual routes, then capture against that plan.

### D2 - Customer journey capture (the spine), first-time POV
Signed-out start. Capture each step as a full-page screenshot to disk, in order:
1. First-visit homepage / landing (marketing).
2. Signup form (empty), then the verify/OTP screen. SIGNUP SPLIT (safety, mandatory): Claude drives and captures; Archer performs the actual create-account submit + password (test email bigtester420@gmail.com, any password) and enters the OTP. Claude says "need the OTP now" at the code screen and waits. Claude never enters the password, creates the account, or types the code.
3. Post-signup landing / empty projects state (new account).
4. Vehicle selection (browse + the chosen vehicle's views). Pick a clean, well-rendering vehicle that shows the app best.
5. Brief builder: wrap type, logo upload (the transparent Alpha Wolf logo), zone assignment, preset + prompt. Feature the Alpha Wolf cyan/black branding in the brief.
6. Review step + the Generate seam (credit cost visible).
7. Generation studio: the 3 AI concept directions on the vehicle, the view switcher, watermarked previews.
8. One refine/iteration on a concept (full pipeline): the iteration chips + the refined render, before/after if shown.
9. Final selection: pick a concept, the free final, the un-watermarked renders.
10. Editor: the canvas with locked AI layers + the real logo composited.
11. Export pack: trigger the export, capture the flow, save the PDF. Verify the PDF with /pdf-expert against the brief (right vehicle, logo present, AI hero, provenance metadata).
12. Account surfaces touched along the way: credit header/balance, projects list with the new project.

### D3 - Shop-side capture (its own section)
Discover and capture the shop-facing surfaces (for example find-a-shop / shop locator and any shop directory or profile), minus admin. Confirm what "shop side" actually is in the live app during D1, then capture each surface.

### D4 - Empty + error states
Capture the meaningful non-happy states the app surfaces naturally: zero-credit waitlist sheet (if reachable without a code change), empty lists, signed-out gates on protected routes, a 404, and any generation error/refusal copy that appears. Do not force errors with code; capture what the app shows.

### D5 - Findings list (separate, no fixes)
A separate observations document: anything broken, confusing, off-brand, slow, or rough, with the page, what was seen, a severity, and a one-line suggested fix. ZERO code changes this pass. This list seeds the follow-up fix-it goal.

### D6 - HTML presentation (separate from the marketing showcase)
A single self-contained HTML file on the Alpha Wolf design system: the real app as-is, customer journey as the spine plus a distinct shop-side section. Embed Geist + the logo; embed every screenshot as a base64 data URI; NO external runtime dependencies. shadcn-style aesthetic, dark brand palette. A comprehensive flow of the product, not marketing.

### D7 - Cleanup + closeout
Purge the disposable test account and its projects/storage/credits after capture (the standing e2e cleanup rule, via the appropriate path, net-zero on real data). Confirm zero test artifacts remain. Write the activities.md entry (Cowork verification + Goal 20 outcome) and note the findings list as the follow-up-goal seed.

## INPUTS

- Prod URL: https://alphawolfedecals-app-web.vercel.app
- Test account: bigtester420@gmail.com, any password; OTP supplied live by Archer.
- Design system: Alpha Wolf Decals Design System.zip (tokens, Geist, logo).
- Connectors live: Claude in Chrome (browser solomon2), Resend (OTP cross-check), Supabase (verify + purge test data), Sentry (0-new watch), GitHub (PAT, transient), Vercel.
- Caps: $5 Anthropic, $10 fal. Spend fal only as needed; the full real generation is wanted. Cost is not the constraint; quality is.

## OUTPUT / DEFINITION OF DONE

1. Live IA inventory recorded (D1).
2. Full customer journey captured first-time POV, signup split honored, every step to disk (D2).
3. Shop-side surfaces captured as their own section (D3).
4. Meaningful empty/error states captured (D4).
5. Export-pack PDF saved and verified with /pdf-expert against the brief (D2.11).
6. Separate findings list produced, zero code changes (D5).
7. Single self-contained HTML presentation on the design system, screenshots embedded, no external runtime deps (D6).
8. Test account + data purged, zero artifacts remain; activities.md entry written (D7).
9. NO app changes, NO em-dashes, no secret values emitted, caps respected.

## CONSTRAINTS

- NO app changes, NO code, NO prod data mutations except the one disposable test account (purged at end). Net-zero on real data.
- NO EM-DASHES anywhere (copy, the HTML, the findings, the commit). Commas, colons, parentheses, hyphens.
- The signup safety split is mandatory: Claude never creates the account, enters the password, or enters the OTP. Archer does those three; Claude drives and captures everything else.
- Never write the GitHub PAT to a file. Never rotate PII_ENCRYPTION_KEY. Never force-push main. Never delete files (purging the test account's own data + storage is fine).
- Findings go in the separate list only; fixes are a later Archer-approved goal.
- Stay within the fal + Anthropic caps; the run should look its best within them.
