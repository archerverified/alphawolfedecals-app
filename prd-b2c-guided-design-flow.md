# PRD: B2C Guided Design Flow (Brief → AI → Export Pack)

## 1. Product overview

### 1.1 Document title and version
- PRD: B2C Guided Design Flow — feature-scoped, extends PRD: Alpha Wolf Wrap Studio v1.1
- Version: 1.2 (adds §10 AI model strategy — Archer decision 2026-06-11; v1.0 open questions resolved 2026-06-10 — see §9)
- Last updated: 2026-06-11
- Author: Cowork orchestration session (Fable 5) from Archer's flow brief, 2026-06-10
- Target: v1.1 development cycle (post-Goal-4 / post-investor-handoff)

### 1.2 Feature summary

A guided, credit-metered customer journey that turns "I want my van wrapped" into a professional, shop-ready spec document in one sitting: sign up → pick vehicle → fill a structured design brief (logo, zones, colors, materials, tint, prompts) → AI generates wrap concepts → iterate within a credit budget → export a branded PDF spec pack the customer can hand to any wrap shop.

This is the conversion engine for the B2C side. The existing MVP proves the canvas + order pipeline; this flow replaces "blank canvas intimidation" with a **structured intake wizard** and replaces "submit to a shop on our platform" with a second, lower-friction exit: **a portable export pack** that works even when the customer's shop isn't on the platform yet — every exported PDF is a branded artifact that markets Alpha Wolf to the receiving shop.

### 1.3 Competitive context (researched 2026-06-10)

| Competitor | What they do well | What they lack |
|---|---|---|
| AutoStyle.AI | Photo-upload visualizer; REAL film-brand color libraries (3M, Avery Dennison, KPMF, TeckWrap); tint % preview; chrome delete; save & share; B2B kiosk rental | No structured brief, no production data in output, no shop handoff doc |
| WrapStudio.AI | Select public vehicle model; 5 free generations then gate (credit conversion works on them) | Generic renders, no zone control, no spec output |
| Avery Dennison visualizer | Authoritative film colors/finishes | Single-brand, no AI, no logos |
| Leonardo.ai (pattern reference) | Gold-standard credit UX: daily free grant, visible credit meter, per-action costs shown before commit, hybrid subscription+top-up | Not automotive |

**Takeaways baked into this spec:** (1) real film-brand color libraries are table stakes AND our bridge to production — a HEX code is a mockup, a 3M 2080 SKU is an order; (2) show credit cost *before* every AI action (Leonardo pattern); (3) tint visualization is a proven add-on hook; (4) none of them produce a document a shop can quote from — that's our wedge.

## 2. Goals

### 2.1 Business goals
- Maximize brief-to-export completion — the export pack IS the product in this phase (target: 50% of generated-concept projects produce an export).
- Make the export pack a viral artifact: every PDF carries Alpha Wolf branding into wrap shops we haven't signed (target: measurable shop signups citing "customer brought us your PDF" within 90 days). Future: formal shop affiliate program built on this loop (out of scope here, noted in §4).
- Validate the credits *mechanic* (grants, costs, exhaustion behavior) with real usage data BEFORE wiring purchases — payments are deferred and, when they arrive, digital-goods-only (credits, vehicle slots, exports). Never materials, never price ranges, never quotes on behalf of shops.
- Increase design-completion rate vs blank-canvas editor (target: 60% of started briefs reach a generated concept; baseline: current editor abandonment).
- Validate credits as the monetization primitive before v2 tiered SaaS.

### 2.2 User goals
- Casey (fleet manager): go from zero to a believable, specific, costed-out wrap concept in under 15 minutes without design skills.
- Customer with an existing shop relationship: walk into their shop with a document the shop takes seriously.
- Customer without a shop: get routed to one (platform order flow) or find one (export + go).

### 2.3 Non-goals
- Not building photo-upload visualization in this phase (template-based per PRD v1.1 §4.2; photo mode is a v2 spike — flagged in open questions).
- Not building shop-side quoting/estimating off the export pack (v2).
- Not building real-time AI preview-as-you-type — generation is an explicit, credit-metered action.
- Not replacing the canvas editor — the wizard feeds it; power users can still drop to manual editing.

## 3. The flow (maps to Archer's 5 steps)

### Step 1 — Sign up / register [SHIPPED]
Existing auth (email + password, OTP verification) as-is. New: plan attribution at signup (`free` default) and credit-ledger row creation (see §5).

### Step 2 — Vehicle selection [PARTIALLY SHIPPED]
Existing cascade selector + template catalog. New behavior:
- Free plan: up to **2 saved vehicles** and **3 brief-to-generation runs per month** (numbers are placeholders — Archer to confirm; PRD v1.1 said 3 saved vehicles).
- Vehicle-not-found → existing "Request this vehicle" flow (PRD v1.1 §4.2) — unchanged.

### Step 3 — The design brief wizard [NEW — the core build]
A stepped intake form. Every input optional except vehicle (already chosen). Progress persists per-project; resumable. Steps:

1. **Zones** — clickable vehicle diagram (renders the template's panel SVG: hood, roof, doors, quarter panels, trunk, windshield band, windows). Tap to include/exclude per zone. Defaults to "full wrap." This reuses the template DB's per-panel breakdown — the data already exists.
2. **Your actual vehicle (photos)** — optional upload of photos of the customer's real vehicle (front/back/sides prompts). Purpose: capture mods, aftermarket parts (bull bars, roof racks, body kits, lift kits), and damage the stock template can't know about. Photos feed the AI orchestrator as reference context ("this van has a high roof rack — keep the roof zone clear") and print as thumbnails on the export pack so the shop sees the real vehicle. Per-photo optional note field ("dent on rear left quarter panel"). This is reference input, NOT photo-based visualization — the template remains the design surface (photo-mode visualization stays a v2 spike).
3. **Logo upload** — accepts PNG/SVG/AI/EPS/PDF/JPG/HEIC (existing parse pipeline). **Quality gate on upload** (the "dog crap" filter):
   - No transparency detected on raster logo → inline warning + one-click background removal (rembg pipeline already specced in PRD v1.1 §4.3).
   - Resolution below 150 DPI at the largest selected zone's print size → "this will look blurry on a hood" warning with the math shown.
   - Recommend on the upload control itself: *"PNG with transparent background or vector (SVG/AI) works best."*
   - Per-logo zone assignment: drag the logo chip onto diagram zones (or multi-select list): doors, hood, trunk, roof, windshield banner, rear window.
4. **Colors** — three input modes, all optional: (a) palette picker; (b) **auto-extract from uploaded logo** (one tap → brand-consistent scheme); (c) **real film-brand library** — searchable swatches mapped to actual 3M 2080 / Avery SW900 / KPMF / TeckWrap SKUs with finish (gloss/satin/matte/chrome/carbon). Film SKUs carry through to the export pack.
5. **Style + ideas prompt** — free text ("clean contractor look, navy + white, subtle pinstripe") plus the existing style presets (Clean / Aggressive / Luxury / Construction / Racing / Minimalist).
6. **Per-zone instructions** — optional text per included zone ("keep the hood mostly black", "phone number large on rear doors").
7. **Materials** — vinyl tier selection: standard cast / premium cast / color-shift / chrome / carbon-look, with plain-language durability + relative-cost indicators ($ to $$$$). Selection prints on the export pack as the recommended material line.
8. **Tint** — per-window tint % selector with live darkness preview swatch, plus **state-legality check**: user picks their U.S. state, each selected % shows ✅ legal / ⚠️ restricted (front-side limits etc.) / ❌ illegal from a maintained state-law table. Massive trust signal; no competitor does it inline.
9. **Extras** (all free brief inputs, never charged — Archer decision 2026-06-10) — chrome delete package, roof-only color change, pinstripe/accent package, PPF (paint protection film) zones, wheel color preview (v2 flag), commercial DOT/MC number block (fleet requirement — checkbox + number field).
10. **Notes for the AI** — catch-all free text the orchestrator ingests.
11. **Review your brief** — single summary screen of every choice with edit-links, the credit cost of generation displayed (*"Generate 3 concepts — uses 1 credit"*), and the Generate button. Doubles as the brief's saved snapshot (regeneratable later).

### Step 4 — AI generation + iteration [NEW — per PRD v1.1 §4.4 architecture]
- Hybrid pipeline as specced: Claude orchestrates the brief into structured generation prompts; Flux/Higgsfield render per-view images for the selected zones; output respects the template's 4-view structure.
- Output: **3 concept directions** per run (not 4 near-identical variants — distinct interpretations: literal / bolder / minimal).
- Iteration: chip-based quick tweaks ("more aggressive", "less busy", "swap accent color") + free-text request. Each iteration shows its credit cost before commit.
- Every render is watermarked at preview resolution until export.
- All generations persist to the project gallery with the brief-version that produced them (regenerate/compare anytime).

### Step 5 — Selection + export pack [NEW — the money artifact]
Customer picks the winning concept → **Export Wrap Spec Pack** (PDF, generated server-side via the existing pdf tooling). Contents:

**Page 1 — Cover:** hero mockup of chosen concept (largest view), project name, customer name, date created, Alpha Wolf watermark/brand block, project QR code + short URL (links back to the live project — the viral loop).
**Page 2 — Vehicle spec:** year/make/model/trim, overall dimensions (in + mm, from template DB), 4-view mockup thumbnails.
**Page 3 — Design spec table:** per included zone — zone name, dimensions, printable area (sq ft, from template panel data), color(s) as HEX + RGB **+ film-brand SKU and finish where selected**, logo placement + source-file name.
**Page 4 — Add-ons & install notes:** material tier, per-window tint % with state-legality note ("20% rear — legal in GA; 32% front minimum"), chrome delete / extras list, customer's vehicle photos + condition notes (mods/damage the shop should see), customer's notes, total material area (sum of zone sq ft + 15% waste allowance), and a deliberately blank **"Shop quote" box** (line items / total / valid-until) for the receiving shop to fill in. **NO pricing anywhere on the pack** — Alpha Wolf supplies the spec; the shop supplies the quote.
**Footer every page:** customer contact (name, phone, email), date, version, Alpha Wolf logo + "Designed with Alpha Wolf Wrap Studio — alpha-wolf-decals.vercel.app", AI provenance signature in PDF metadata (PRD v1.1 §4.4 requirement).

Delivery: download + email-to-self + "send to my shop" (email with PDF attached) + **"Submit to a shop on Alpha Wolf"** — which routes into the EXISTING orders pipeline (Goal 3a submit flow). The export pack and the platform order are the same project; no translation loss.

## 4. New feature ideas beyond the brief (ranked, researched)

1. **Film-SKU color library** (in spec above) — bridges mockup→production; differentiates from every HEX-only tool.
2. **Tint state-law checker** (in spec above) — trust + compliance; cheap to build (static table + state picker).
3. **Share-for-feedback link** — public read-only page of the 3 concepts with 👍 voting; "my crew picked #2" is a conversion accelerant and a viral loop. (P2)
4. **Before/after slider** on concept views — stock vehicle vs wrapped. Cheap, high demo value. (P1)
5. **Shop locator handoff** — "no shop? find one near you" → maps to platform shops first, then a static directory; feeds the B2B funnel. (P2)
6. **Referral credits** — give 2 / get 2 on signup via shared link or QR scan from an export pack. (P2)
7. **Fleet mode** — apply one approved design across multiple saved vehicles with auto-rescale; Casey's 12 vans. (v2)
8. **AR / photo-overlay preview** — AutoStyle's territory; revisit as v2 spike alongside photo-upload mode.

## 5. Credits system (Archer decisions, 2026-06-10)

**The model:** the initial design experience is free — signup grant covers the first concept generation(s). **Purchased credits are for what comes after: edits, additions, and AI prompt requests once the initial design(s) exist.** That's the revenue line, and it's strictly **digital goods only**: credit packs, extra vehicle slots. Never materials, never USA price ranges, never quotes on behalf of shops — quoting belongs to the receiving shop, and the export pack itself is never paywalled.

Ledger ships purchase-ready (`source: grant|purchase|referral|admin`). **Checkout ships in Phase 2 alongside the AI build** (Archer, 2026-06-10): a narrow Stripe integration — credit packs only, no subscriptions, webhook-verified, no card data in our DB. Revenue turns on the same day AI iteration does.

| Item | Launch value (tunable via config, not code) |
|---|---|
| Free signup grant | 5 credits |
| Concept generation (3 directions) | 1 credit |
| Iteration / tweak request | 1 credit |
| Re-render at export resolution | included with selection |
| Export pack | free (the export IS the funnel — never gate the artifact that markets us to shops) |
| Monthly free drip | 2 credits/month (re-engagement hook) |
| Credit packs (Phase 2) | 10 / 25 / 60 credits, tiered pricing TBD by Archer (anchor the middle pack) |
| Vehicle slots | 2 free; additional slots purchasable (character-slot pattern) — same Stripe rail as credit packs, Phase 2 or later |

**Hard UX rules (from research):** credit balance always visible in the flow header; every AI action shows its cost on the button itself; exhausting credits shows the credit-pack purchase sheet inline with the in-progress design visible behind it — never dead-end to a separate pricing page.

## 6. User stories (compact; IDs namespaced B2C- to avoid collision with PRD v1.1 GH- series)

| ID | Story | Acceptance criteria (abridged) |
|---|---|---|
| B2C-001 | Credit ledger + plan attribution | Ledger table (append-only) with source enum; balance derivable; free grant on signup; RLS owner-only |
| B2C-002 | Brief wizard shell + persistence | Stepped form, resumable, autosaves per step, brief snapshot versioned per generation run |
| B2C-003 | Zone selector on template SVG | Panels from template DB render clickable; include/exclude state persists; full-wrap default |
| B2C-004 | Logo quality gate | Transparency + DPI checks fire with specific warnings; rembg one-click path; PNG/SVG recommendation visible pre-upload |
| B2C-005 | Color modes incl. film-SKU library | Picker + logo-extract + brand library searchable; SKU + finish persist to brief and export |
| B2C-006 | Tint selector + state-law table | Per-window %; state picker; legality verdict per selection; table maintainable as data not code |
| B2C-007 | Brief → generation pipeline | Brief compiles to orchestrator prompt; 3 distinct concepts; per-view renders; watermarked previews; credit decremented atomically with run creation |
| B2C-008 | Iteration with cost-visible UX | Chips + free text; cost on button; balance header; exhaustion → inline credit-pack purchase sheet |
| B2C-013 | Stripe credit-pack checkout (Phase 2) | Buy pack → ledger credit with `purchase` source; webhook-verified; no card data in our DB; purchase events in PostHog |
| B2C-009 | Export pack PDF | All pages/fields per §3 step 5; HEX+RGB+SKU table; QR resolves to project; provenance metadata; renders under 30s |
| B2C-010 | Export delivery + shop handoff | Download, email-to-self, send-to-shop email, route-to-platform-order (reuses Goal 3a submit) |
| B2C-011 | Free-plan gates | Vehicle cap + monthly run cap enforced server-side; clear upgrade messaging, never silent failure |
| B2C-012 | Vehicle photo reference upload | Multi-photo upload with per-photo notes; photos surface to AI orchestrator context and as thumbnails on export pack page 2; existing upload pipeline + PII face-warning check (PRD v1.1 §4.3) applies |

Every story inherits the standing constraints: `withUser` RLS for all customer queries, PostHog events per step (brief_step_completed, generation_run, credits_exhausted, export_created — funnel gold), Sentry on all new server actions.

## 7. Phasing

- **Phase 1 — Brief + export without AI** (ships value immediately): wizard (B2C-002..006), export pack driven by the EXISTING canvas/editor design (B2C-009, 010), free-plan gates (B2C-011), ledger (B2C-001 grant-only). A customer can brief, design manually (or with a shop), and export a professional pack. No AI dependency, no payment dependency.
- **Phase 2 — AI generation + credits economy:** pipeline (B2C-007), iteration UX (B2C-008), vehicle photo reference (B2C-012), Stripe credit-pack checkout (B2C-013), before/after slider. Free initial design on grant; purchased credits power post-initial edits/additions/prompts from day one of the AI feature.
- **Phase 3 — Loops:** share-for-feedback, referral credits, shop locator, and the shop affiliate program exploration (export-pack QR attribution makes "which shop did this PDF convert at" trackable — the affiliate mechanic falls out of data we're already capturing).

Sequencing rationale: Phase 1 has zero new external dependencies and makes the investor-demo story stronger on its own; the AI pipeline (Phase 2) is the highest-risk build and benefits from real Phase-1 brief data to tune prompts against.

## 8. Technical considerations (grounded in current stack)

- All new tables (credit_ledger, briefs, brief_zones, generation_runs) follow the established pattern: Prisma migration + RLS owner policies + `withUser` access only. SECURITY DEFINER helpers follow the `app_is_shop_member` pattern (search_path-pinned, EXECUTE locked to app_user) — per the Goal 4 RLS fix.
- Zone data: template DB already stores per-panel breakdown + printable areas (PRD v1.1 §4.2); the wizard consumes it — no template schema change expected.
- Generation pipeline: Render `alphawolf-ai` service (FastAPI, currently health-only) is the natural home for the orchestrator↔Flux glue; BullMQ (existing parse worker pattern) for run queueing.
- Export PDF: server-side via the sandbox-proven ghostscript/pdftocairo tooling already used in the AI→SVG pipeline; QR via a zero-dep generator.
- Tint law table: static JSON data file, versioned in repo, with a "laws change — verify with your installer" disclaimer (legal review of the disclaimer copy = human item).
- Rate limits: PRD v1.1 §4.4's 30/day customer cap still applies beneath the credit system (credits are the price, rate limit is the abuse ceiling).

## 9. Resolved decisions (Archer, 2026-06-10)

1. **No checkout/pricing on exports.** Funnel is: make design → export PDF → bring to shop for a quote. The pack carries a blank shop-quote box, zero Alpha Wolf pricing.
2. **Credit model: free initial design, purchased credits for post-initial edits/additions/AI prompts.** Checkout (narrow Stripe, credit packs only) ships in Phase 2 with the AI build. Payments = digital goods only (credits, vehicle slots) — never materials, USA price ranges, or quotes on behalf of shops. Phase 1 remains payment-free (no AI yet, nothing to meter).
3. **Vehicle photos: yes, as brief reference input** (mods, aftermarket parts, damage) feeding the AI and printing on the pack — NOT photo-based visualization (that stays a v2 spike). Wizard step 2.
4. **Free plan: 2 vehicle slots**, additional slots purchasable later (character-slot pattern). Monthly run caps per §3 step 2.
5. **Tint/PPF/chrome-delete are free brief inputs**, never charged — they enrich the spec the shop quotes from.
6. **Affiliate program with shops**: endorsed direction, future phase — see §7 Phase 3; QR attribution groundwork ships in B2C-009.
7. **AI model stack: Option A — Flux family via fal.ai** (Archer, 2026-06-11). Full strategy in §10. Supersedes PRD v1.1 §4.4's "Flux-pro or Higgsfield via OpenRouter/Replicate" line.

## 10. AI model strategy (Phase 2) — decided 2026-06-11

Pricing verified June 2026 (pricepertoken.com normalization, 1024×1024).

**Architecture rules (these matter more than the model choice):**
1. **The image model NEVER renders the customer's logo.** AI generates the wrap design; the app composites the actual uploaded logo file as a layer (canvas + export). Perfect brand fidelity, zero cost, stays editable.
2. **Structure-conditioned generation:** every view is generated img2img against the template's view render (depth/edge control), so output respects real vehicle geometry and maps back onto panels.
3. **Two-tier rendering:** cheap drafts for the 3 concept directions; full-quality render ONLY for the chosen concept. Iterations use an EDIT model (composition-preserving), re-rendering only affected views.

**The stack (one provider adapter, fal.ai default — models swappable by config):**

| Job | Model | Price | Role |
|---|---|---|---|
| Orchestrator (brief → prompts, iteration parsing, photo/mod understanding) | Claude Haiku 4.5 (vision) | ~$0.01–0.02/run | Escalate to Sonnet only if brief complexity demands it |
| Concept drafts (3 concepts × 4 views) | Flux Depth Dev | $0.025/img → ~$0.30/run | Depth-conditioned on template view renders |
| Iterations ("hood matte black") | FLUX.1 Kontext Dev (Pro for stubborn edits) | $0.025–0.04/img, usually 1–2 views | Edit model preserves composition — the margin engine |
| Final render of chosen concept | FLUX.2 Pro | $0.031/img × 4 views | Export-quality pass |
| Background removal (logo prep) | rembg, self-hosted on alphawolf-ai (Render) | $0 | Already specced in v1.1 §4.3 |
| Optional export upscale | Recraft crisp-upscale | $0.02/img | Only if export resolution demands it |

**Economics:** full happy-path journey (3 drafts + ~3 edit rounds + final) ≈ **$0.50–0.65 hard cost**. Credit pricing at ~$1–2/credit-equivalent yields 60–90% gross margin. The 30/day customer rate limit (v1.1 §4.4) remains the abuse ceiling beneath credits.

**Why Flux/fal over alternatives:** only family with both depth conditioning AND a purpose-built edit model (Kontext); open weights = self-host exit at volume (~70% cost cut); per-image pricing matches fixed-credit economics. Google nano-banana(-pro) ($0.02/$0.04) is the strongest alternative (superb edit consistency, weaker geometry control); GPT-Image-1.5 has the best instruction-following but token-based pricing fights credit economics. **Phase 2 week one: 20-brief bake-off** of Flux vs nano-banana vs GPT-Image through the adapter before final lock.

**Higgsfield disposition:** removed from the pipeline (studio platform, reseller-only API, aggregates the same underlying models at a markup). Two retained uses: human studio tool for marketing/template hero shots; v2 candidate for shareable wrap-turntable videos.
