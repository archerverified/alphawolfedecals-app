# Design Hard Rules + AI-Slop Blacklist

Read this when scoring a UI (the "AI Slop" category, and the landing-page / app-UI
rule sets). Classify the surface first, then apply the matching rules.

## Classifier — determine the rule set before evaluating

- **MARKETING / LANDING PAGE** — hero-driven, brand-forward, conversion-focused → apply Landing Page Rules.
- **APP UI** — workspace-driven, data-dense, task-focused (dashboards, admin, settings) → apply App UI Rules.
- **HYBRID** — marketing shell with app-like sections → Landing Page Rules for the hero/marketing sections, App UI Rules for the functional sections.

## Hard rejection criteria (instant-fail patterns — flag if ANY apply)

1. Generic SaaS card grid as the first impression.
2. Beautiful image with a weak brand.
3. Strong headline with no clear action.
4. Busy imagery behind text.
5. Sections repeating the same mood statement.
6. Carousel with no narrative purpose.
7. App UI made of stacked cards instead of a real layout.

## Litmus checks (answer YES/NO for each)

1. Brand/product unmistakable in the first screen?
2. One strong visual anchor present?
3. Page understandable by scanning headlines only?
4. Each section has one job?
5. Are cards actually necessary?
6. Does motion improve hierarchy or atmosphere?
7. Would the design feel premium with all decorative shadows removed?

## Landing-page rules (classifier = MARKETING/LANDING)

- First viewport reads as one composition, not a dashboard.
- Brand-first hierarchy: brand > headline > body > CTA.
- Typography expressive and purposeful — no default stacks (Inter, Roboto, Arial, system).
- No flat single-color backgrounds — use gradients, images, or subtle patterns.
- Hero is full-bleed, edge-to-edge — no inset/tiled/rounded variants.
- Hero budget: brand, one headline, one supporting sentence, one CTA group, one image.
- No cards in the hero. Cards only when the card IS the interaction.
- One job per section: one purpose, one headline, one short supporting sentence.
- Motion: 2–3 intentional motions minimum (entrance, scroll-linked, hover/reveal).
- Color: define CSS variables, avoid purple-on-white defaults, one accent color by default.
- Copy is product language, not design commentary. If deleting 30% improves it, keep deleting.
- Beautiful defaults: composition-first, brand as the loudest text, two typefaces max, cardless by default, first viewport as a poster not a document.

## App-UI rules (classifier = APP UI)

- Calm surface hierarchy, strong typography, few colors.
- Dense but readable, minimal chrome.
- Organize into: primary workspace, navigation, secondary context, one accent.
- Avoid: dashboard-card mosaics, thick borders, decorative gradients, ornamental icons.
- Copy is utility language — orientation, status, action — not mood/brand/aspiration.
- Cards only when the card IS the interaction.
- Section headings state what the area is or what the user can do ("Selected KPIs", "Plan status").

## Universal rules (apply to ALL types)

- Define CSS variables for the color system.
- No default font stacks (Inter, Roboto, Arial, system) as the primary display/body face.
- One job per section.
- "If deleting 30% of the copy improves it, keep deleting."
- Cards earn their existence — no decorative card grids.
- NEVER use small, low-contrast type (body text under 16px, or body contrast under 4.5:1).
- NEVER use placeholder-as-label (the label must stay visible once the field has content).
- ALWAYS preserve visited vs. unvisited link distinction.
- NEVER float a heading between paragraphs — it must sit visually closer to the section it introduces than to the one above it.

## AI-Slop blacklist (the patterns that scream "AI-generated")

The test: would a human designer at a respected studio ever ship this?

1. Purple/violet/indigo gradient backgrounds, or blue-to-purple color schemes.
2. **The 3-column feature grid** — icon-in-colored-circle + bold title + 2-line description, repeated 3x symmetrically. The single most recognizable AI layout.
3. Icons in colored circles as section decoration (SaaS starter-template look).
4. Centered everything (`text-align: center` on all headings, descriptions, cards).
5. Uniform bubbly border-radius on every element.
6. Decorative blobs, floating circles, wavy SVG dividers. If a section feels empty it needs better content, not decoration.
7. Emoji as design elements (rockets in headings, emoji as bullets).
8. Colored left-border on cards (`border-left: 3px solid <accent>`).
9. Generic hero copy ("Welcome to X", "Unlock the power of...", "Your all-in-one solution for...").
10. Cookie-cutter section rhythm (hero → 3 features → testimonials → pricing → CTA, every section the same height).
11. `system-ui` / `-apple-system` as the PRIMARY display/body font — the "I gave up on typography" signal. Pick a real typeface.

Source: adapted from gstack design methodology (Garry Tan, MIT) and OpenAI's
"Designing Delightful Frontends with GPT-5.4" (Mar 2026).
