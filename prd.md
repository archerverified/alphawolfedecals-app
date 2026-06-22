> SUPERSEDED 2026-06-22: the product pivoted fully to B2B. The active product definition is prd-b2b-print-engine.md. This document is retained for history (the prior B2C-plus-shop framing).

# PRD: Alpha Wolf Wrap Studio

> **Truth-up note (2026-06-17, v1.2).** This revision aligns the PRD with what is actually shipped and the decisions logged in `activities.md`. Key reconciliations: the live product is B2C-first (the guided design flow in `prd-b2c-guided-design-flow.md`); the customer deliverable is a portable export pack, and in-platform print paneling / RIP is deferred to post-launch v2 (Goal 8 deferred); image generation runs on fal.ai (nano-banana-edit draft, flux2_pro_edit export final) with a Claude Sonnet 4.6 orchestrator configurable via `ANTHROPIC_ORCHESTRATOR_MODEL`; the brand is cyan #00AEEF on zinc-neutral and black (the red/lime direction in the old section 5.4 is retired). See `activities.md` for the full per-goal decision history.

## 1. Product overview

### 1.1 Document title and version
- PRD: Alpha Wolf Wrap Studio
- Version: 1.2
- Last updated: 2026-06-17

### 1.2 Product summary

Alpha Wolf Wrap Studio is an AI-assisted vehicle wrap design platform. End customers describe what they want, pick their vehicle, upload a logo, and get a believable full-vehicle mockup on their own vehicle in minutes, then a portable export pack (every view, zones, sizes, materials) they hand to an installing shop. The receiving shop panels that pack in its own RIP. In-platform print paneling is a post-launch v2 capability, deferred per section 2.3.

The platform is two-sided. Customers come in through alpha-wolf-decals.vercel.app to design something for their own vehicle or fleet. Shops come in to service their existing book of business faster and to receive customer-initiated projects as warm inbound. Both sides operate against the same proprietary vehicle template database, the same AI design pipeline, and the same export format - so a design started by a customer drops into a shop's queue with zero translation loss.

Today's competitive baseline (ProVehicleOutlines, EasySIGN, Onyx SmartApps Vehicle Wraps, WrapStyle 3D Changer, Spyne, WrapWizzard) splits into two camps: photo-only visualizers with no production data, and production tools that demand expert Illustrator skill. The Wrap Studio collapses the two - the customer-facing mockup and the shop-facing print package come out of the same project, every time.

## 2. Goals

### 2.1 Business goals
- Convert alpha-wolf-decals.vercel.app traffic into Wrap Studio sign-ups (target: 8% visitor-to-signup in first 90 days post-launch).
- Cut Alpha Wolf's internal design-to-print cycle time by 60% on standard vehicle wraps (baseline: measure first two weeks of v1 usage).
- Establish a defensible moat through proprietary vehicle template database (start with top 50 most-wrapped vehicles in North America).
- Validate Core MVP feature set on Alpha Wolf's own production floor before opening to external shops.
- Position for tiered SaaS monetization in v2 (Customer free / Shop Pro / Shop Studio) - billing infrastructure deferred but data model accommodates it from day one.

### 2.2 User goals
- **Customers**: get a believable, on-brand mockup of their vehicle wrapped without learning Illustrator or paying upfront for design work.
- **Shops**: receive print-ready files with correct bleed, overlap, panel labels, and material estimates - eliminating the "blunder one could make on a full wrap" risk documented across signs101.com threads.
- **Both**: own a single source of truth for the project (versions, approvals, comments, exports) instead of scattered email attachments.

### 2.3 Non-goals
- Not building a printer driver or RIP software: we generate a print-ready export pack and hand off to existing RIPs (Onyx, Caldera, VersaWorks).
- **In-platform print paneling is deferred to post-launch v2** (Goal 8 deferred, 2026-06-13). The live B2C product delivers the portable export pack; the receiving shop panels it in its own RIP. Shop-side paneling/production only matters once Alpha Wolf prints in-house or onboards partner shops.
- Not building a generic Illustrator competitor - the editor is wrap-specific and intentionally constrained.
- Not building installation training content, paint matching, or material e-commerce in v1.
- Not building a customer marketplace (shop discovery, booking, payments to shops) in v1 - projects transfer via token, not transactional matching.
- Not building mobile in v1. Desktop web first; React Native client follows once v1 is validated.

## 3. User personas

### 3.1 Key user types
- End customer (vehicle owner, small-business owner, fleet manager)
- Shop owner / lead designer
- Shop staff designer
- Shop installer (read-only on print packages, in v1 only via shared export - installer mode is v2)
- Internal Alpha Wolf admin (template curator, support)

### 3.2 Basic persona details
- **Casey, fleet manager at a 12-van HVAC company**: never used design software, just wants to see what a wrap would look like before committing $30k. High motivation, low patience, evaluates on visual believability and time-to-first-mockup.
- **Rico, owner of a 4-person wrap shop**: spends 6+ hours per project bouncing PDFs with customers and another 2 hours paneling files in Illustrator. Knows Onyx, knows his HP Latex 700, knows exactly what he wants out of an export. Will adopt anything that compresses that cycle and won't tolerate anything that adds steps.
- **Mara, Alpha Wolf staff designer**: power user, will be on the platform 6+ hours per day. Needs keyboard shortcuts, version history, layer-level control, and the ability to override AI output without fighting the UI.
- **Devon, Alpha Wolf admin**: curates the vehicle template library, approves community-submitted templates, monitors AI generation quality and cost.

### 3.3 Role-based access
- **Customer**: create projects on own account; upload assets; trigger AI generations; comment; approve versions; export visual mockup PDF; transfer project to a shop via project token. Cannot export print panels.
- **Shop Designer**: full editor access on projects in own shop; trigger AI generations; export both visual and print-ready PDFs; manage shop's vehicle preset library.
- **Shop Admin**: everything Designer can do plus invite team members, configure shop's printer/media setup, set default export settings, view shop activity log.
- **Internal Admin (Alpha Wolf)**: vehicle template CRUD; AI cost/quota dashboard; impersonation for support; feature flag control.

## 4. Functional requirements

### 4.1 Authentication & account setup (P0)
- Email + password auth with OTP email verification on signup.
- Required fields: first name, last name, email, password, account type (Customer or Shop). If Shop: company name, phone.
- Optional fields: business address, website, social links (URLs, no OAuth in v1).
- Password reset via emailed magic link.
- Session tokens in httpOnly SameSite=strict cookies; 30-day refresh.
- Account type is permanent - switching requires support intervention.

### 4.2 Vehicle selection (P0)
- Cascade selector: Year → Make → Model → Trim/Submodel.
- Truck-specific facets after Model: cab size (Regular/Extended/Crew), bed size (Short/Standard/Long).
- Van-specific facets after Model: wheelbase, roof height (Low/Mid/High), overall length.
- Search bar accepts free-text and matches across all fields ("2024 transit 250 high roof").
- Each match resolves to a template with: SVG outline (4-view: front/back/driver/passenger plus top if available), dimensions (length/height/width in inches and mm), body panel breakdown with wrap-safe zones, printable surface area per panel.
- If the user's vehicle isn't in the database: "Request this vehicle" form (year/make/model/trim/photos). Submission routes to internal admin queue; user receives email when template ships.
- Customers can save up to 3 vehicles in v1; Shop accounts unlimited.

### 4.3 Asset upload (P0)
- Accepts: AI, EPS, PDF, SVG, PNG, JPG, HEIC. Max 50MB per file.
- AI/EPS/PDF parsed server-side to extract vector paths; preview rendered as PNG.
- Logo bounding-box detection runs on upload; user can adjust crop and remove background (rembg model server-side).
- Inspiration photos kept separate from brand assets - surface to AI prompt as "style reference" not "asset to apply."
- Asset library per project; reusable across project versions.
- PII check: warn if uploaded photo contains a recognizable face (basic detection only - informational, not blocking).

### 4.4 AI-powered design generation (P0)
- **Hybrid model architecture**: a Claude orchestrator handles prompt orchestration, design reasoning, and natural-language tweaks (model configurable via `ANTHROPIC_ORCHESTRATOR_MODEL`, default Claude Sonnet 4.6). Image generation runs on fal.ai: nano-banana-edit for the draft (it edits the template's own view render, so the customer sees their actual vehicle), flux2_pro_edit for the export-quality final, with the model catalog swappable by config (`packages/db/src/ai-config.ts`).
- Initial generation requires: selected vehicle, at least one brand asset, a style preset (Clean / Aggressive / Luxury / Construction / Racing / Minimalist), and optional free-text prompt.
- Output: 3 concept directions for the brief, each rendered across the vehicle's standard views.
- Each direction is generated at view-fidelity across the vehicle's standard views (front, driver side, rear, passenger side), NOT a single render. Views are kept coherent via canonical-anchor conditioning, and the export final is conditioned on the customer-approved draft (Goal 17).
- Iterative tweaks via natural language ("make the wrap more aggressive", "add satin black accents to the driver-side doors", "use a cleaner contractor look"). Each tweak preserves layer structure where possible; full regenerations are flagged.
- Color palette extraction: user can pin a color from any variant and propagate it.
- Generation cost is tracked per project, per shop, per month - exposed in shop admin dashboard.
- Hard rate limit: 30 generations per customer account per day; 500 per shop seat per day. Configurable per plan in v2.
- All AI outputs include a non-removable provenance signature in the PDF metadata (per Anthropic AUP).
- **Shipped learnings (Goals 15 to 18).** The real logo is composited deterministically, never AI-rendered. Pixel-level properties cannot be steered by prompt text: gradient DIRECTION is pinned with a per-view directional guide image conditioned on the export model (Goal 18). Open carryover: the draft model renders gradient briefs as accent linework rather than a smooth ombre, so a true smooth-gradient export is still in progress (tracked as Goal 19 rider R2 / Goal 20).

### 4.5 Wrap editor (P0)
- Canvas-based editor (Konva.js or Fabric.js - engineering choice during spike).
- Vehicle SVG renders as multi-layer base; each body panel is a discrete editable region.
- Tools: text, shape, image, color fill, gradient, opacity, finish swatch (gloss/satin/matte/chrome/carbon).
- Snap-to: body line, panel edge, vehicle centerline, other element.
- Per-panel "wrap mask" enforced - user cannot place artwork outside the printable area.
- Undo/redo with 50-step history.
- Layer panel with show/hide/lock.
- Real-time co-editing in v1 is NOT in scope (Phase 2). Single-editor lock with last-write-wins on conflicts.
- Keyboard shortcuts match Figma defaults where possible (V/T/R/etc.) for designer muscle memory.

### 4.6 Automatic print paneling (DEFERRED to post-launch v2, shop-side)
> Deferred 2026-06-13 (Goal 8). The B2C product hands the receiving shop a portable export pack; the shop panels it in its own RIP. The spec below is retained for the future shop-side production surface.
- Shop configures once: printer model, media width (inches), laminate width, preferred overlap (default 0.5"), panel direction (horizontal/vertical), gutter, and finish.
- On export, the panel engine:
  - Slices the wrap into print panels based on media width minus overlap.
  - Adds bleed (configurable, default 0.25" all sides).
  - Aligns seams to body panel breaks where geometrically possible.
  - Labels each panel: vehicle area (e.g., "Driver Quarter Panel"), panel number (e.g., "3 of 7"), arrow indicating install direction.
  - Calculates total linear feet of media required, total square feet of laminate, estimated waste %.
  - Outputs a multi-page PDF (one panel per page at 1:1 scale, plus a cover sheet showing the paneling map).
- Validates pre-export: warns on bleed underflow, panel exceeding media width, missing wrap-safe data, low-res raster assets (<150 DPI at final size).
- v2 will add per-printer ICC profile embedding; v1 ships printer profiles as out-of-band PDF only.

### 4.7 Vehicle template system (P0 - backend)
- Each template record: vehicle metadata (year/make/model/trim/variant), dimensions, body panel definitions (SVG path + wrap-safe zone + finish suggestion), 4-view outline SVG, source of authority (proprietary measurement / manufacturer spec / licensed), version, last verified date.
- Internal admin UI to upload, edit, and version templates.
- Public read API exposes the template at design time; the canvas editor consumes panels as discrete layers.
- v1 ship target: top 50 wrapped vehicles in North America (full-size trucks, full-size vans, mid-size SUVs, sprinter/transit class). Coverage gaps fill via the "Request this vehicle" loop.

### 4.8 Export & detailed PDF (P0)
- Two export modes:
  - **Customer Visual Mockup PDF**: photorealistic 4-view of the wrapped vehicle plus all-new cover page with the metadata block below. Replaces today's ProVehicleOutlines export.
  - **Shop Production Package PDF**: visual mockup pages plus paneled print pages plus shop-facing spec sheet plus material/labor estimates.
- **Metadata block included on every export's cover sheet:**
  - Vehicle metadata: year, make, model, trim, dimensions (L×W×H in/mm), VIN if provided, color of bare vehicle.
  - Design metadata: color palette (with HEX, RGB, and closest Pantone match), wrap coverage % of total surface, finishes per panel (gloss/satin/matte), panels wrapped (named list), text content extracted from the design, fonts used.
  - Print production info: panel count, total media linear feet, total laminate sqft, estimated install hours, material cost estimate (configurable per-shop pricing).
  - Project tracking: project ID, version number, created date, last modified date, exported date, designer name, customer name, shop name, status (Draft / In Review / Approved / In Production / Installed), revision history summary.
- All metadata also embedded as PDF/X structured data so downstream tools (RIPs, MIS systems) can read it programmatically.

### 4.9 Project handoff (P0)
- Any customer-owned project can be transferred to a shop via a one-time project token (short URL or 12-char code).
- Receiving shop sees: full project history, all versions, all assets, vehicle template snapshot. Shop becomes editor; customer becomes commenter.
- Customer retains read access and can request changes via comment thread.
- Transfer is logged; reversal requires customer approval.

### 4.10 Activities log (P0)
- Every project has an `activities.md`-style log surfaced in the UI:
  - Every AI generation (prompt, model used, cost, output IDs).
  - Every manual edit (user, layer, action).
  - Every comment.
  - Every approval / rejection.
  - Every export (mode, recipient if shared).
- Stored as append-only event log in Postgres; rendered as human-readable timeline in UI.
- Exportable as standalone .md file for shops that want to retain a record outside the platform.

### 4.11 Approval flow (P1)
- Shop or customer can mark a version "Pending Approval"; counterparty gets an email + in-app notification.
- Approver can leave comment, approve, or request changes.
- Approval state locks the version from edits - new edits create a new version.

### 4.12 Installer mode (P2)
- Read-only mobile-friendly view of the panel map with install order, squeegee direction arrows, and panel overlap callouts.

### 4.13 Customer approval portal (P2)
- White-labeled (per-shop branding) public-link approval surface for shop customers who don't want to create accounts.

### 4.14 AI branding assistant (P2)
- Pre-design step: AI suggests fonts, layouts, color palettes, and slogans based on industry + brand asset analysis.

### 4.15 Material estimator (P1)
- Embedded in shop production export. Configurable per-shop pricing for vinyl, laminate, and labor rate. Outputs line-item estimate suitable for quoting.

## 5. User experience

### 5.1 Entry points & first-time user flow
- alpha-wolf-decals.vercel.app marketing site → "Design Your Wrap" CTA → sign-up modal → email OTP → vehicle selector.
- Direct shop signup at app.alphawolfwrap.com/signup-shop → company profile → printer/media setup wizard → invite team.
- Project transfer link → recipient sign-up (if not already authed) → project lands in their workspace.

### 5.2 Core experience
- **Pick your vehicle**: cascade selector that surfaces the right facets per body type. Confidence-building because the system knows the difference between a Transit 250 148"WB High Roof and a Transit 350 EL High Roof.
- **Upload your assets**: drag-and-drop, smart logo cropping, preview of detected vector paths. Customer sees value before they've done any "design" work.
- **Describe the vibe**: style preset chips ("Clean / Aggressive / Luxury / Construction / Racing / Minimalist") plus optional prompt. Lowest-friction generation trigger in the category.
- **Get four mockups**: 4-up grid of believable photoreal vehicle renders in 60-90 seconds. This is the magic moment - measure it as the activation event.
- **Iterate via chat**: natural-language tweak field below each variant. "More aggressive." "Add satin black accents to the doors." User feels in control without learning a tool.
- **Send to a shop OR keep iterating**: customer hits "Send to Shop" → either picks Alpha Wolf or pastes a shop's project-receive code. Hand-off is the conversion event.
- **Shop refines + exports**: shop opens the project, makes pro-level adjustments, hits Export → choose Visual or Production Package → PDF lands with full metadata.

### 5.3 Advanced features & edge cases
- Empty state: customer with no projects sees a "Start your first wrap in 3 steps" interstitial with example designs of common vehicles.
- Vehicle not found: route to template request form; show estimated turnaround (target: 5 business days for top 200 vehicles).
- AI generation failure (model timeout, NSFW filter, quota): clear error, refund the generation against the daily limit, suggest retry with adjusted prompt.
- Offline: editor degrades to view-only with a "reconnecting" banner; pending edits queued client-side and synced on reconnect.
- Slow network: AI generations move to background job and notify on completion via in-app + email.
- Permission denied (customer tries to export production PDF): explain why; offer to transfer project to a shop.
- Rate-limited: hard-block with countdown timer and explanation; for shops, link to upgrade path (v2).
- Partial data on vehicle (e.g., template missing trim variant): use closest match, flag in the UI with "approximate match - verify before printing."
- Large asset upload failure: client-side retry with chunked upload; resumable to 95%.

### 5.4 UI/UX highlights
- Editor styled as a focused workspace - dark surface, neutral chrome - so brand colors in the design remain visually accurate. (Anti-pattern to learn from: bright-white tools shift color perception.)
- Vehicle SVGs are the hero element on every screen they appear. Outline weight, stroke style, and proportions match the photographic reference at first glance.
- Buttons follow a three-tier hierarchy: primary (filled black, zinc-900), secondary (outlined), tertiary (text only). Never more than one primary per screen. Cyan is an accent, never a button fill.
- Typography: Geist Sans for UI; Geist Mono for code/IDs/SKUs; vehicle-section labels in uppercase with wide tracking (the brand eyebrow device).
- All interactive elements meet WCAG 2.2 AA (4.5:1 contrast min, 44px touch targets where mobile-relevant).
- Keyboard shortcuts displayed in tooltips; full shortcut sheet available via `?`.
- Real-time generation progress shown with sub-step labels ("Resolving prompt → routing to image model → rendering 4 views → composing 4-up") rather than a generic spinner.
- Empty AI prompt field shows a rotating set of high-quality examples drawn from real designs.
- Brand (canonical, 2026-06-17): cyan #00AEEF accent on zinc-neutral chrome and black surfaces, sampled from the Alpha Wolf Decals logo. Primary action is black (zinc-900); cyan is used sparingly (the wolf mark, accent borders on hover/focus, the AI-thinking progress bar, links on dark). The earlier red #E41E26 / lime-green direction is retired.

## 6. Narrative

Casey runs HVAC at her family's company and just bought their twelfth van. She lands on alpha-wolf-decals.vercel.app, sees "Design your wrap in 3 minutes," and clicks. She signs up, picks "2024 Ford Transit 250, 148" wheelbase, High Roof," and drags in the company logo. She picks "Construction" as the style, types "use red and black, make the side prominent," and ninety seconds later she's looking at four photoreal mockups of her van wrapped in her colors. She tweaks one - "make the lime-green accent black instead" - and on the third iteration she has the design. She clicks "Send to Alpha Wolf Decals," approves the design in the chat thread the next morning, and gets a calendar invite to drop the van off. The shop opens her project, makes the AI-generated wrap production-clean, configures their HP Latex 700 with 54" media, hits Export → Production Package, and walks to the printer with a 7-page PDF containing every panel, labelled and laid out, plus a spec sheet showing 142 linear feet of vinyl, 4.5 hours of estimated install, and the full project history. The job that used to take three days of back-and-forth and four hours of Illustrator paneling shipped in a day.

## 7. Success metrics

### 7.1 User-centric metrics
- Time-to-first-mockup (customer first generation): target p50 < 4 minutes from landing page.
- Customer-to-handoff conversion rate: target 25% of customers who generate at least one design send to a shop within 7 days.
- Generations per project: track distribution; healthy median is 4-8 (signals exploration without churn).
- Shop project cycle time (creation → exported production package): target -60% vs Alpha Wolf's measured baseline.
- Customer NPS at handoff: target ≥ 50.

### 7.2 Business metrics
- Sign-ups per week from Alpha Wolf marketing traffic: target 8% of unique visitors.
- Active shops at 90 days post-launch: target 10 paying shops + Alpha Wolf internal.
- Internal Alpha Wolf revenue impact: track jobs/month and revenue/month through the platform vs prior baseline.
- Cost per AI generation: hold p50 under $0.40 across hybrid model routing (Claude orchestration + image model). Track monthly trend.

### 7.3 Technical metrics
- Editor p95 frame time < 16ms during interaction; canvas remains 60fps with up to 200 layers.
- AI generation p95 end-to-end < 90 seconds (4-up output).
- Print panel export p95 < 30 seconds for a full vehicle wrap.
- API p95 latency < 200ms for cached reads, < 500ms for writes.
- Uptime: 99.5% in v1 (single region), targeting 99.9% in v2 (multi-region).
- Error budget for AI generations: < 2% hard-failure rate (model error / timeout / safety filter), with automatic retry on transient failures.

## 8. Technical considerations

### 8.1 Integration points
- Auth: Auth.js (NextAuth) with credentials provider + email OTP via Resend.
- Email: Resend for transactional; SES as fallback.
- File storage: AWS S3 (or Cloudflare R2 for egress savings) - separate buckets for raw uploads, processed assets, generated outputs, exports.
- Vector parsing: server-side via Inkscape (CLI) + svgo + pdf2svg.
- Logo background removal: rembg or Replicate-hosted equivalent.
- Image generation: OpenRouter as primary gateway (model-agnostic), Replicate as fallback. Models considered: Flux.1-pro, Higgsfield, SDXL fine-tunes. Routing logic in the Python AI service.
- LLM orchestration: Claude Sonnet 4.6 (claude-sonnet-4-6) via Anthropic API for prompt construction, design reasoning, natural-language tweak parsing.
- PDF generation: ReportLab (Python) for the production package, react-pdf (Node) for the visual mockup pages.
- Search/typeahead on vehicles: Postgres trigram + Typesense if scale demands.
- Analytics: PostHog for product analytics; Sentry for error tracking; OpenTelemetry for distributed tracing.
- Future billing (v2): Stripe - data model includes `subscription_status` and `plan_tier` from day one.

### 8.2 Data storage & privacy
- Postgres (Supabase or Neon) as primary store. Schema highlights:
  - `accounts`, `users`, `shops`, `memberships` (multi-tenant, role-scoped)
  - `vehicles` (template library), `vehicle_panels` (per-panel SVG + wrap-safe metadata)
  - `projects`, `project_versions`, `project_assets`, `project_activities` (append-only event log)
  - `generations` (AI run record: prompt, model, cost, output asset IDs, version)
  - `exports` (PDF metadata, recipient, expiry)
  - `printer_profiles` (per-shop setup)
- All user-uploaded assets encrypted at rest (S3 SSE-KMS). PII (names, emails, phone) encrypted at column level via pgcrypto.
- Soft delete with 30-day recovery on user-deleted projects; hard delete on account deletion within 7 days per GDPR Article 17.
- Customer data scoped to customer account; shop data scoped to shop. Cross-shop visibility is impossible at the query layer (row-level security policies).
- AI generation outputs are NOT used to train any models. Stated explicitly in ToS and validated via vendor contracts.
- VIN, when provided, treated as PII; never logged outside the project record.

### 8.3 Scalability & performance
- Stateless Next.js app servers behind Vercel/Cloudflare; horizontal scaling via platform.
- Python AI microservice on fly.io or Cloud Run with autoscaling on queue depth.
- Generation requests funneled through a Redis-backed job queue (BullMQ or Cloud Tasks). Each request returns immediately with a job ID; client polls or subscribes via SSE.
- Vehicle template SVGs cached aggressively (immutable, content-hashed URLs).
- Hot path = editor render. Pre-warm vehicle templates on project open; lazy-load preview images.
- Rate limiting at API gateway (per-account and per-IP); generation quotas enforced server-side.
- Largest expected payload: a fully-paneled production PDF can hit 200MB. Stream to S3 during generation, return signed URL on completion.

### 8.4 Potential challenges
- **Image-gen consistency**: getting believable wrap mockups requires the model to respect the vehicle outline and the brand asset placement. Mitigation: control-image conditioning (use the vehicle SVG as a structural mask), brand-asset compositing as a post-step, not a generation input.
- **Print panel correctness**: getting bleeds and seams right is the difference between a $5k reprint and a happy customer. Mitigation: extensive pre-export validation, ship with an "expert review" optional step in v1, instrument heavily.
- **Vehicle template accuracy**: real-world vehicle dimensions vary by trim and year. Mitigation: source from multiple authorities (manufacturer specs, real-world tape measurements), version templates, surface "verified" badge.
- **AI cost run-up**: hybrid model routing decisions need a clear cost-vs-quality framework. Mitigation: cost-tracking dashboard from day one; monthly p50/p95 reports; daily quota guards.
- **Color fidelity from screen to print**: monitor ≠ printer. Mitigation: surface "approximate match - final color depends on print/laminate combo" disclaimer; v2 ships ICC profile embedding and soft-proofing.
- **Two-sided cold start**: shops need customer-initiated projects; customers need shop options. Mitigation: Alpha Wolf operates as the default shop at launch - every customer project routes to them by default unless the customer enters another shop's code.

### 8.5 Stack recommendation
- **Frontend**: Next.js 15 (App Router) with React 19. SSR for marketing surfaces, client components for the editor. TypeScript across the board. Tailwind v4 + shadcn/ui for chrome; Konva.js for the canvas editor.
- **Backend**: Node.js (Express or Hono) for the main API - auth, projects, assets, exports, billing. Python (FastAPI) for the AI orchestration service and the print paneling engine (heavy geometry + PDF generation).
- **Database**: Postgres on Supabase (auth, file storage, row-level security baked in) or Neon (pure DB with branch-per-PR ergonomics). Supabase recommended unless team prefers stricter DB-only separation.
- **Hosting**: Vercel for the Next.js app, Fly.io or Google Cloud Run for the Python services, S3/R2 for assets. Cloudflare in front of everything for CDN + WAF + rate limiting.
- **Auth**: Auth.js with credentials + email OTP. Stytch as an upgrade path if SSO becomes a shop ask.
- **Mobile (Phase 4)**: React Native via Expo - shares ~70% of TypeScript with the web client.

## 9. Milestones & sequencing

### 9.1 Project estimate
- Core MVP: 14-18 weeks (3.5-4.5 months) for v1 desktop launch.

### 9.2 Team size & composition
- 1 product lead (Archer)
- 2 full-stack engineers (Next.js + Node)
- 1 AI/ML engineer (Python, image-gen orchestration, print paneling geometry)
- 1 product designer (UI/UX, editor flows, brand)
- 0.5 vehicle template specialist (contracted; builds the initial 50-vehicle library)
- 0.5 DevOps (shared / fractional)

### 9.3 Suggested phases
- **Phase 1 - Foundation** (weeks 1-4): Auth, account model, vehicle template schema + admin UI, top 10 vehicle templates shipped, base canvas editor (no AI yet), asset upload pipeline, project model. Internal demo at week 4.
- **Phase 2 - AI design generation** (weeks 5-9): Claude orchestrator, image-gen routing, 4-variant generation, iterative natural-language tweaks, generation cost tracking, top 30 vehicle templates shipped.
- **Phase 3 - Print paneling + export** (weeks 10-13): Printer/media setup, automatic paneling engine, validation, visual mockup PDF, production package PDF, full metadata block, project activities log. Top 50 vehicle templates shipped.
- **Phase 4 - Two-sided + launch hardening** (weeks 14-18): Project transfer flow, comment threads, approval state, shop dashboard, customer dashboard, public marketing site integration, observability, security review, beta with 3 external shops, public launch.
- **Phase 5 - Post-launch (v1.1)** (weeks 19-24): Customer approval portal, material estimator, installer mode (mobile-web), template request loop automation, ICC profile embedding, real-time co-editing spike.
- **Phase 6 - Mobile** (weeks 25-32): React Native client (read + light-edit + approve flows).

## 10. User stories

### 10.1. Customer signup with email verification
- **ID**: GH-001
- **Description**: As a prospective customer, I want to sign up with my email and verify via OTP so that I can save designs to my account.
- **Acceptance criteria**:
  - Signup form collects first name, last name, email, password, account type.
  - Password rules: ≥12 chars, ≥1 number, ≥1 symbol, ≥1 letter. Strength meter shown.
  - On submit, account is created in `pending_verification` state and an OTP email is sent within 5 seconds.
  - OTP is a 6-digit code with 10-minute expiry; entering correctly transitions account to `active`.
  - Wrong code shows error, allows retry up to 5 attempts in 15 minutes before lockout.
  - Resend code button enabled after 30 seconds; rate-limited to 5 sends per email per hour.
  - On success, user lands on vehicle selector with their account scoped to `customer` type.
- **Dependencies**: None
- **Phase**: 1

### 10.2. Shop signup with org creation
- **ID**: GH-002
- **Description**: As a wrap shop owner, I want to create a shop account so that my team can collaborate and our printer setup is saved once.
- **Acceptance criteria**:
  - Signup collects: first/last name, email, password, company name, phone (required), business address, website (optional).
  - Creates `user` record + `shop` record + `membership` with role `shop_admin` in a single transaction.
  - Forces email OTP verification before shop becomes active.
  - On success, lands user on printer/media setup wizard (skippable but flagged).
- **Dependencies**: GH-001 (shares OTP infrastructure)
- **Phase**: 1

### 10.3. Vehicle template browse and select
- **ID**: GH-003
- **Description**: As any user, I want to pick my exact vehicle from a year/make/model selector with body-type-specific facets so that the design starts on an accurate outline.
- **Acceptance criteria**:
  - Cascade selector: Year (1990-current year) → Make → Model → Trim. Each level loads in under 200ms on cached data.
  - Free-text search box matches across all fields with typo tolerance ("transt 250" → Transit 250).
  - Selecting a truck reveals cab size + bed size facets; selecting a van reveals wheelbase + roof height + length.
  - Each match displays the 4-view outline preview, dimensions, and "use this template" CTA.
  - "Request this vehicle" form appears if no match after 2 search refinements or if user explicitly clicks "Don't see your vehicle?"
  - Customer accounts limited to 3 saved vehicles; Shop accounts unlimited.
- **Dependencies**: None (uses template library which has its own backend story)
- **Phase**: 1

### 10.4. Internal admin vehicle template CRUD
- **ID**: GH-004
- **Description**: As an internal Alpha Wolf admin, I want to create, edit, version, and approve vehicle templates so that the library can grow accurately.
- **Acceptance criteria**:
  - Admin-only route at /admin/vehicles (role-gated; non-admins get 404).
  - Create form accepts year/make/model/trim/variant, dimensions, body type facets, and SVG upload.
  - SVG upload validated for: 4 views present (front/back/driver/passenger), wrap-safe zones defined as named paths, no embedded raster images >500KB.
  - Versioning: edits create a new version; live version is explicitly published. Older versions remain available for projects already using them.
  - User-submitted "Request this vehicle" entries surface as a queue with status (Pending / In Progress / Shipped / Rejected).
- **Dependencies**: GH-003
- **Phase**: 1

### 10.5. Asset upload with vector parsing
- **ID**: GH-005
- **Description**: As a user, I want to upload my logo in AI/EPS/PDF/SVG/PNG/JPG and have it parsed into a usable asset so that I don't have to convert formats manually.
- **Acceptance criteria**:
  - Accepts AI, EPS, PDF, SVG, PNG, JPG, HEIC. Rejects others with clear message.
  - Max file size 50MB; client-side validation + server-side enforcement.
  - Vector formats parsed server-side via Inkscape; preview PNG returned within 10 seconds for files <10MB.
  - Detected bounding box shown; user can adjust crop with handles.
  - "Remove background" toggle calls rembg; result preview shown before commit.
  - Failed uploads queue locally and retry on next foreground with network available.
  - Asset persists in the project's asset library; reusable across versions.
- **Dependencies**: None
- **Phase**: 1

### 10.6. Initial AI design generation
- **ID**: GH-006
- **Description**: As a customer, I want to generate four photoreal wrap mockups for my vehicle by picking a style and writing a short prompt so that I can see options without learning Illustrator.
- **Acceptance criteria**:
  - Requires: a selected vehicle template, at least one brand asset, a style preset chip selected.
  - Optional free-text prompt up to 500 chars.
  - Submit triggers a background job; UI shows step-labelled progress ("Resolving prompt → routing to image model → rendering 4 views → composing 4-up").
  - p95 end-to-end < 90 seconds; hard timeout at 180 seconds with retry prompt.
  - Output: 4 mockup variants displayed in a 4-up grid, each downloadable and selectable as the base for further iteration.
  - Cost of generation logged to the `generations` table with model used, prompt, output asset IDs, and dollar cost.
  - Customer daily limit: 30 generations; counter visible in UI; blocks at limit with reset-time copy.
  - All output PDFs carry a provenance signature ("Generated with Alpha Wolf Wrap Studio · Model: <name> · <timestamp>").
- **Dependencies**: GH-003, GH-005
- **Phase**: 2

### 10.7. Natural-language design tweaks
- **ID**: GH-007
- **Description**: As a user, I want to refine a generated design by typing natural-language instructions ("make it more aggressive", "add satin black accents to the doors") so that I can iterate without using design tools.
- **Acceptance criteria**:
  - Tweak field is enabled on any generated variant; max 500 chars per tweak.
  - Submitting routes the variant + tweak through Claude for prompt enrichment, then to the image model.
  - Tweak preserves layer structure where possible; full regenerations are flagged in the result with "this was a full regeneration - your prior edits may not have carried through."
  - Each tweak counts against the user's daily generation quota.
  - Tweak history is shown as a vertical thread under the variant.
- **Dependencies**: GH-006
- **Phase**: 2

### 10.8. Canvas editor with per-panel masking
- **ID**: GH-008
- **Description**: As a designer, I want to edit a wrap on a canvas where each vehicle body panel is its own editable region and artwork cannot accidentally extend outside the printable area.
- **Acceptance criteria**:
  - Vehicle SVG renders with each body panel as a discrete layer.
  - Tools: text, shape, image (raster + vector), color fill, gradient, opacity, finish swatch.
  - Snap to body line, panel edge, vehicle centerline, and other elements; toggleable.
  - Per-panel wrap mask is enforced - artwork dragged outside the printable area shows a hard visual cue and clips on render.
  - Undo/redo with 50-step history; persisted across page reloads.
  - Canvas maintains 60fps with up to 200 layers on a 2021 M1 MacBook baseline.
- **Dependencies**: GH-003
- **Phase**: 1 (base editor ships in Phase 1 with manual tools only; AI variant ingestion lands in Phase 2 via GH-006/GH-007)

### 10.9. Shop printer and media setup
- **ID**: GH-009
- **Description**: As a shop admin, I want to configure my printer model, media width, laminate width, overlap, and panel direction once so that exports are automatically correct.
- **Acceptance criteria**:
  - Setup wizard surfaces on first shop login (skippable but persistently flagged).
  - Form fields: printer model (pre-populated list of HP Latex / Roland / Mimaki / Epson plus "Other"), media width (inches, 0.25" steps), laminate width, default overlap (default 0.5"), default panel direction (horizontal/vertical), default bleed (default 0.25").
  - Multiple printer profiles per shop; one marked default.
  - Settings are version-stamped on each export so historical exports can be reproduced exactly.
- **Dependencies**: GH-002
- **Phase**: 3

### 10.10. Automatic print paneling
- **ID**: GH-010
- **Description**: As a shop designer, I want to export a wrap and have the system automatically panel it for my printer with correct bleeds, overlaps, seam alignment, and labels.
- **Acceptance criteria**:
  - Triggered from project → Export → Production Package.
  - Uses the shop's default printer profile unless user overrides.
  - Slices the wrap into panels at (media_width − overlap) intervals.
  - Adds bleed to all 4 sides per panel.
  - Aligns panel seams to body panel breaks where the geometry is within 2" of a media-width interval.
  - Labels each panel: vehicle area name, "Panel N of M", install-direction arrow.
  - Outputs multi-page PDF: cover sheet with panel map, then one page per panel at 1:1.
  - Validation pre-flight blocks export and surfaces errors for: bleed underflow, panel exceeds media width, missing wrap-safe data, raster asset <150 DPI at final size.
  - Generates within 30 seconds (p95) for a full vehicle wrap.
- **Dependencies**: GH-008, GH-009
- **Phase**: 3

### 10.11. Detailed export with full metadata
- **ID**: GH-011
- **Description**: As any user, I want the exported PDF to include a comprehensive metadata block on the cover sheet so that the document is a self-contained record of the job.
- **Acceptance criteria**:
  - Cover sheet contains four labelled sections: Vehicle, Design, Print Production, Project Tracking - with the fields enumerated in section 4.8.
  - All metadata also embedded as PDF/X structured data (machine-readable).
  - Color palette section shows HEX, RGB, and closest Pantone match (PMS) for every brand color used.
  - Wrap coverage % is calculated from total wrap surface area / total vehicle surface area, rounded to nearest whole percent.
  - Project Tracking section reflects current project state (status, version, dates, names).
  - The PDF includes the AI provenance signature in footer.
- **Dependencies**: GH-010
- **Phase**: 3

### 10.12. Project handoff via token
- **ID**: GH-012
- **Description**: As a customer, I want to hand my finished design off to a shop using a one-time code so that the shop receives the full project without me re-uploading anything.
- **Acceptance criteria**:
  - Customer clicks "Send to a shop" → can pick "Alpha Wolf Decals" (default) or enter a shop's 12-char receive code.
  - Generates a single-use token tied to the project; sends notification email to the shop's admin.
  - Shop accepts → project is mirrored into shop's workspace with full version history and assets; shop becomes editor.
  - Customer retains read access and can comment but not edit.
  - Transfer is reversible by mutual approval within 7 days; afterward, requires support.
  - Audit logged in `project_activities` with timestamp and acting user.
- **Dependencies**: GH-002, GH-003, GH-006
- **Phase**: 4

### 10.13. Project activities log
- **ID**: GH-013
- **Description**: As any user, I want every meaningful action on a project (generation, edit, comment, approval, export) recorded in a human-readable timeline so that the history is auditable.
- **Acceptance criteria**:
  - Events written to `project_activities` table on: every AI generation, every manual edit committed to the editor, every comment, every approval state change, every export.
  - Timeline view in UI shows reverse-chronological events with actor, action, and timestamp.
  - Exportable as `activities.md` (markdown file) from the project menu.
  - Exported markdown matches the same schema as the repo-level `activities.md` (section 11.7) so the two are interchangeable in tooling.
  - Activities log is append-only; corrections are new entries, not edits.
- **Dependencies**: GH-001 (auth), GH-006 (generations), GH-008 (edits), GH-010 (exports)
- **Phase**: 3

### 10.14. Material and labor estimator on export
- **ID**: GH-014
- **Description**: As a shop, I want the production package to include a material and labor estimate based on my pricing so that I can quote off the same document.
- **Acceptance criteria**:
  - Shop sets per-foot vinyl cost, per-sqft laminate cost, and hourly labor rate in printer profile.
  - Export auto-calculates: total linear feet of vinyl, total sqft of laminate, estimated install hours (vehicle-type-based heuristic), and the dollar line items + total.
  - Estimate shown on its own page in the Production Package PDF, also exportable as standalone CSV.
- **Dependencies**: GH-009, GH-010, GH-011
- **Phase**: 5

### 10.15. Approval workflow
- **ID**: GH-015
- **Description**: As a shop, I want to send a version for customer approval and have the customer approve or request changes in-app so that we have a clear sign-off record.
- **Acceptance criteria**:
  - Editor surface "Send for Approval" button per version.
  - Sets version state to `pending_approval`; locks edits on that version.
  - Customer receives email + in-app notification.
  - Customer can approve (sets state `approved`), request changes (sets state `changes_requested` with required comment), or take no action (no expiry in v1).
  - Approval state visible on the project header and recorded in the activities log.
  - Approved versions are immutable; further edits fork a new version.
- **Dependencies**: GH-012, GH-013
- **Phase**: 4

### 10.16. Email + in-app notifications
- **ID**: GH-016
- **Description**: As a user, I want to receive email and in-app notifications for actions that need my attention (handoff received, approval requested, generation complete) so that I don't have to keep checking the app.
- **Acceptance criteria**:
  - Notifications generated on: handoff received, approval requested, approval granted, changes requested, comment mentioning user, AI generation complete (if user has navigated away).
  - Email delivery via Resend; in-app via a bell icon with unread badge.
  - User notification preferences: per-event-type toggle for email vs in-app vs both vs none.
  - Email templates pass spam-score testing (>9/10 on Mail Tester), include unsubscribe link, are domain-aligned (SPF/DKIM/DMARC pass).
- **Dependencies**: GH-001
- **Phase**: 4

### 10.17. Vehicle template request loop
- **ID**: GH-017
- **Description**: As a user, I want to request a vehicle that isn't in the database and receive an email when the template ships so that I can come back and design.
- **Acceptance criteria**:
  - "Request this vehicle" form collects year/make/model/trim plus optional reference photos.
  - Submission creates a record in admin queue with submitter email.
  - On admin marking "Shipped", system emails submitter with a deep link into the new template.
  - User can opt out of follow-up emails.
- **Dependencies**: GH-003, GH-004
- **Phase**: 4

### 10.18. Generation cost dashboard for shops
- **ID**: GH-018
- **Description**: As a shop admin, I want a dashboard showing my AI generation usage and cost by day, project, and team member so that I can manage spend.
- **Acceptance criteria**:
  - Dashboard at /shop/{id}/usage shows: total generations this month, total cost this month, daily trend chart, top 10 projects by cost, breakdown by team member.
  - Data fresh within 5 minutes of generation completion.
  - Exportable as CSV.
- **Dependencies**: GH-006
- **Phase**: 4

### 10.19. Account deletion (GDPR)
- **ID**: GH-019
- **Description**: As a user, I want to permanently delete my account and have my personal data removed so that I can exercise my data rights.
- **Acceptance criteria**:
  - Settings → Delete Account flow with double-confirmation and password re-entry.
  - On confirmation: account flagged for deletion, login disabled immediately, soft-deleted projects scheduled for hard delete in 7 days.
  - All PII (name, email, phone, address, VIN) hard-deleted within 7 days; project records anonymized.
  - User receives confirmation email immediately and a final deletion-complete email at 7 days.
  - Shops can request export of their account data (projects, exports, activity log) before deletion; delivered as a zip within 24 hours.
- **Dependencies**: GH-001
- **Phase**: 4

### 10.20. Security: auth & session hardening
- **ID**: GH-020
- **Description**: As the platform, I want auth and sessions hardened against common attacks so that customer and shop accounts cannot be trivially compromised.
- **Acceptance criteria**:
  - Sessions stored in httpOnly, Secure, SameSite=strict cookies.
  - CSRF tokens on all state-changing routes.
  - Password hashing via argon2id with sane defaults (m=64MB, t=3, p=4).
  - Rate-limit: 5 failed logins per IP per 15 minutes → lockout with backoff; per-account lockout after 10 failures.
  - All auth events logged (login, logout, failed login, password reset, OTP request, OTP success).
  - Pen-test pass before public launch; OWASP Top 10 reviewed and documented.
- **Dependencies**: GH-001, GH-002
- **Phase**: 4

### 10.21. Comment threads on projects and versions
- **ID**: GH-021
- **Description**: As any user with access to a project, I want to leave comments on a project or a specific version so that handoff, approval, and refinement happen in one place instead of email.
- **Acceptance criteria**:
  - Comment field available at the project level and per version.
  - Comments support @mentions of other users on the project; mention generates a notification (GH-016).
  - Comments are immutable once posted; editing creates an "edited" badge with diff on hover.
  - Customer + shop both see the same thread; visibility is project-scoped, not role-gated.
  - Comments captured in the activities log (GH-013).
- **Dependencies**: GH-012, GH-016
- **Phase**: 4

### 10.22. Asset upload IP acknowledgement
- **ID**: GH-022
- **Description**: As the platform, I want users to acknowledge they have rights to upload any brand asset so that we have a defensible IP posture and a takedown workflow.
- **Acceptance criteria**:
  - First brand asset upload per account triggers a one-time modal: "I confirm I have rights to use this artwork in commercial vehicle wraps."
  - Acknowledgement recorded against the user with timestamp + asset reference; persisted in audit log.
  - ToS link surfaced in the modal.
  - Takedown form linked from project export footer, public-facing, routes to internal admin queue.
- **Dependencies**: GH-005
- **Phase**: 4

## 11. Integration map: external skills and tooling

This PRD assumes implementation by Claude Code (or equivalent agentic dev tooling) with access to the following skill suite. Each skill is mapped to the lifecycle stage where it provides the most leverage. Install via:

```
npx claude-code-templates@latest --skill creative-design/mobile-design,productivity/file-organizer,development/clean-code,web-development/web-performance-optimization,business-marketing/seo-optimizer,creative-design/frontend-design,development/code-reviewer,development/senior-architect,creative-design/ui-ux-pro-max,creative-design/ui-design-system,web-development/react-best-practices,development/webapp-testing,development/senior-prompt-engineer,creative-design/ux-researcher-designer,development/senior-data-engineer,workflow-automation/workflow-automation,development/software-architecture,business-marketing/product-manager-toolkit,creative-design/web-design-guidelines,security/api-security-best-practices,business-marketing/product-strategist,development/python-patterns
```

### 11.1 Discovery & planning
- `business-marketing/product-strategist` - sharpen positioning before each phase gate.
- `business-marketing/product-manager-toolkit` - backlog grooming, story splitting, prioritization.
- `creative-design/ux-researcher-designer` - pre-Phase 1 user research with both Alpha Wolf shop staff and a panel of fleet managers.

### 11.2 Architecture & engineering
- `development/senior-architect` and `development/software-architecture` - invoked at the start of Phase 1 to validate stack and at every phase gate to review topology drift.
- `development/senior-data-engineer` - Phase 1 data model design; Phase 3 print paneling data pipeline.
- `development/senior-prompt-engineer` - Phase 2, owns the Claude orchestrator prompts and the prompt-tweak parser.
- `development/python-patterns` - Phase 2 + 3, AI service and print paneling engine.
- `web-development/react-best-practices` - Phase 1, codifies component patterns for the editor.

### 11.3 Design & UX
- `creative-design/frontend-design` - Phase 1, establishes design language and component library.
- `creative-design/ui-ux-pro-max` and `creative-design/ui-design-system` - Phase 1, ships the Tailwind/shadcn design tokens and Figma-aligned components.
- `creative-design/web-design-guidelines` - ongoing reference for marketing site + in-app surfaces.
- `creative-design/mobile-design` - Phase 6 (React Native client).

### 11.4 Quality, security, performance
- `development/code-reviewer` - every PR.
- `development/webapp-testing` - Playwright suite, runs in CI from Phase 2 onward.
- `security/api-security-best-practices` - Phase 4 hardening + pre-launch review.
- `web-development/web-performance-optimization` - Phase 4 hardening; runs Lighthouse audits and Core Web Vitals checks.

### 11.5 Operations & launch
- `workflow-automation/workflow-automation` - Phase 4, automates daily backups, alert routing, error-budget reports.
- `productivity/file-organizer` - keeps the project repo structure clean as it grows.
- `business-marketing/seo-optimizer` - Phase 4, marketing site SEO before public launch.
- `development/clean-code` - ongoing standard for every contributing engineer.

### 11.6 Visual + research tooling (per Archer's request)
- **Obsidian** - primary memory system for the build. Project-wide vault at `/docs/vault/`. Each major decision logged as a discrete note. Daily notes capture standups and decisions; the `activities.md` requirement (below) is the source of truth for project-level events.
- **Excalidraw** - embedded into Obsidian for architecture diagrams, customer journey maps, and sprint planning. Each diagram exported as both `.excalidraw` (editable) and `.svg` (viewable).
- **Firecrawl** - used during template DB build to scrape vehicle dimensions from manufacturer spec pages and competitor outline databases (license terms permitting). Configured with custom extraction schemas.
- **Claude in Chrome** - used to navigate templates.provehicleoutlines.com during the initial template library bootstrap; captures structure and serves as a manual comparator for accuracy QA on our proprietary templates.

### 11.7 `activities.md` requirement (mandatory)
Every project repo (and every customer project inside the app) maintains an `activities.md` file. Repo-level captures development activity; in-app captures user-driven project activity (see GH-013). Both follow the same append-only event log format:

```
## 2026-05-18 14:32 UTC - Archer
- Decision: Adopted hybrid Claude + Flux image-gen architecture
- Reason: Best balance of design reasoning + visual fidelity at projected cost p50 < $0.40/generation
- Followups: Need cost-tracking dashboard in Phase 2 (GH-018)
```

Updated at the close of every working session, every architectural decision, every story completion. The Obsidian vault links to it from the project root.

## 12. Open questions
- Should Alpha Wolf operate as the default routing shop for all customer-initiated handoffs, or should the system surface a list of opt-in shops once we have more than 5 onboarded? (Recommend default-to-Alpha-Wolf for v1 to avoid two-sided cold start.)
- Do we want to surface AI cost to customers, or absorb it as a customer-acquisition cost while we determine pricing? (Recommend absorb in v1.)
- What's the policy on customer-uploaded copyrighted assets (logos they don't own)? (Recommend a ToS acknowledgement at upload + AUP-aligned takedown process; revisit with counsel before public launch.)
- Should the production package PDF be downloadable by the customer who initiated the project (it's their design, after all)? (Recommend no - the production package is the shop's IP and revenue moat. Customer gets the visual mockup only.)

## 13. Appendix: reference exports

The two uploaded sample PDFs (Artboard 2.pdf, Van Wrap Back Print.pdf) demonstrate the *current* state of ProVehicleOutlines exports: a single page of visual mockup with no metadata. Our v1 baseline equivalent (Customer Visual Mockup PDF) ships the same visual fidelity *plus* the full metadata block on a cover sheet - closing the production-data gap that today's tools leave open.
