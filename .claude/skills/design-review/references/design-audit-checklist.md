# Design Audit Checklist (10 categories, ~80 items)

Apply at each page in scope. Every finding gets an impact rating
(**high** / **medium** / **polish**) and a category. High findings affect the
first impression and user trust; medium findings erode polish and are felt
subconsciously; polish findings separate good from great.

## 1. Visual Hierarchy & Composition (8)
- Clear focal point? One primary CTA per view?
- Eye flows naturally top-left to bottom-right?
- Visual noise — competing elements fighting for attention?
- Information density appropriate for the content type?
- Z-index clarity — nothing unexpectedly overlapping?
- Above-the-fold content communicates purpose in 3 seconds?
- Squint test: hierarchy still visible when blurred?
- White space intentional, not leftover?

## 2. Typography (15)
- Font count ≤ 3 (flag if more).
- Scale follows a ratio (1.25 major third or 1.333 perfect fourth).
- Line-height: ~1.5x body, 1.15–1.25x headings.
- Measure: 45–75 chars per line (66 ideal).
- Heading hierarchy: no skipped levels (h1 → h3 with no h2).
- Weight contrast: ≥ 2 weights used for hierarchy.
- No blacklisted fonts (Papyrus, Comic Sans, Lobster, Impact, Jokerman).
- If the primary font is Inter/Roboto/Open Sans/Poppins → flag as potentially generic.
- `text-wrap: balance` or `text-pretty` on headings.
- Curly quotes, not straight quotes.
- Ellipsis character (`…`), not three dots.
- `font-variant-numeric: tabular-nums` on number columns.
- Body text ≥ 16px.
- Caption/label ≥ 12px.
- No letterspacing on lowercase text.

## 3. Color & Contrast (10)
- Palette coherent (≤ 12 unique non-gray colors).
- WCAG AA: body 4.5:1, large text (18px+) 3:1, UI components 3:1.
- Semantic colors consistent (success=green, error=red, warning=amber).
- No color-only encoding — always add labels, icons, or patterns.
- Dark mode: surfaces use elevation, not just lightness inversion.
- Dark mode: text off-white (~#E0E0E0), not pure white.
- Primary accent desaturated 10–20% in dark mode.
- `color-scheme: dark` on the html element when dark mode is present.
- No red/green-only combinations (8% of men have red-green deficiency).
- Neutral palette is warm or cool consistently — not mixed.

## 4. Spacing & Layout (12)
- Grid consistent at all breakpoints.
- Spacing on a scale (4px or 8px base), not arbitrary values.
- Alignment consistent — nothing floats outside the grid.
- Rhythm: related items closer, distinct sections further apart.
- Border-radius hierarchy (not one bubbly radius on everything).
- Inner radius = outer radius − gap (nested elements).
- No horizontal scroll on mobile.
- Max content width set (no full-bleed body text).
- `env(safe-area-inset-*)` for notch devices.
- URL reflects state (filters, tabs, pagination in query params).
- Flex/grid for layout (not JS measurement).
- Breakpoints: mobile 375, tablet 768, desktop 1024, wide 1440.

## 5. Interaction States (11)
- Hover state on all interactive elements.
- `focus-visible` ring present (never bare `outline: none`).
- Active/pressed state with depth or color shift.
- Disabled state: reduced opacity + `cursor: not-allowed`.
- Loading: skeleton shapes match real content layout.
- Empty states: warm message + primary action + visual (not just "No items.").
- Error messages: specific + include a fix/next step.
- Success: confirmation animation or color, auto-dismiss.
- Touch targets ≥ 44px on all interactive elements.
- `cursor: pointer` on all clickable elements.
- Mindless-choice audit: every decision point is an obvious click. If a click requires thought about whether it's the right choice, flag HIGH.

## 6. Responsive Design (8)
- Mobile layout makes *design* sense (not just stacked desktop columns).
- Touch targets sufficient (≥ 44px).
- No horizontal scroll on any viewport.
- Images responsive (srcset, sizes, or CSS containment).
- Text readable without zoom on mobile (≥ 16px body).
- Navigation collapses appropriately (hamburger, bottom nav).
- Forms usable on mobile (correct input types, no autofocus).
- No `user-scalable=no` / `maximum-scale=1` in the viewport meta.

## 7. Motion & Animation (6)
- Easing: ease-out entering, ease-in exiting, ease-in-out moving.
- Duration 50–700ms (slower only for page transitions).
- Every animation communicates something (state, attention, spatial relationship).
- `prefers-reduced-motion` respected.
- No `transition: all` — list properties explicitly.
- Animate only `transform` and `opacity` (not width/height/top/left).

## 8. Content & Microcopy (8+)
- Empty states designed with warmth (message + action + illustration/icon).
- Error messages specific: what happened + why + what to do next.
- Button labels specific ("Save API Key", not "Continue"/"Submit").
- No placeholder/lorem ipsum visible in production.
- Truncation handled (`text-overflow: ellipsis`, `line-clamp`, `break-words`).
- Active voice ("Install the CLI", not "The CLI will be installed").
- Loading states end with `…` ("Saving…", not "Saving...").
- Destructive actions have a confirmation modal or undo window.
- **Happy-talk detection:** scan for "Welcome to..." / self-congratulatory intros. If you can hear "blah blah blah", it's happy talk — flag for removal.
- **Instructions detection:** any visible instruction longer than one sentence. If users must read instructions, the design failed — flag the instructions AND the interaction they compensate for.
- **Happy-talk word count:** count visible words; classify each block as useful content vs. happy talk; report "This page has X words. Y (Z%) are happy talk."

## 9. AI-Slop Detection (the blacklist)
See `design-hard-rules.md` → AI-Slop blacklist. Grade independently as a headline metric.

## 10. Performance as Design (6)
- LCP < 2.0s (web apps), < 1.5s (informational sites).
- CLS < 0.1 (no visible layout shifts during load).
- Skeleton quality: shapes match real content, shimmer animation.
- Images: `loading="lazy"`, width/height set, WebP/AVIF.
- Fonts: `font-display: swap`, preconnect to CDN origins.
- No visible font-swap flash (FOUT) — critical fonts preloaded.
