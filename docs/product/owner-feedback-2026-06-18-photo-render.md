# Owner feedback - 2026-06-18 - photo-render flow + multi-view showcase

Source: Alpha Wolf owner, relayed by Archer. Captured as roadmap feedback. No code change here; the build is scoped in `prompts/23-goal-21-photo-render-multiview-showcase.md`.

## What the owner wants (his words, the ideal flow)
1. Upload photos of the vehicle + year/make/model.
2. Upload logo.
3. Prompt the AI to design the wrap how they want.
4. See output.

## The benchmark he showed (ChatGPT, short session)
He uploaded a photo of his real truck + the Alpha Wolf logo, then used two plain-language prompts:
1. "Can you make me a cool wrap on this truck with my logo?" returned a teal-splatter wrap rendered directly on the real truck photo.
2. "Can you get rid of all the blue splatter and maybe add some elegant swishes" returned a silver-and-black aggressive design shown across multiple angles in a branded marketing composite (side angles, a banner with the logo and PREMIUM WRAPS / CUSTOM DESIGN / BRAND ELEVATION / BUILT TO STAND OUT / YOUR BRAND. OUR CRAFT. UNMATCHED IMPACT., plus side and rear views).

The owner's reaction and Archer's: the output looks great. (Reference images live in the 2026-06-18 chat thread; they are not committed assets.)

## The specific feature ask
When viewing the 3 concept options to choose from, clicking a concept should expand it into a 3-to-4-side showcase of that design, in the polished marketing-composite style of the owner's second ChatGPT image.

## How this maps to the shipped app (audit, Goal 20)
About 80% already exists: year/make/model picks a real vehicle outline; the brief has an optional "add vehicle photos" step; logo upload is a brief step; plain-language prompt + style presets; 3 concept directions with a 4-view switcher; final flows to the editor with the real logo composited; export is a 4-page spec pack. The deltas: render on the customer's uploaded photo (not only the template outline), and the click-to-expand multi-view marketing showcase per concept.

## Key decision (do not lose)
The print-ready spec pack the shops receive needs accurate panel geometry, bleed, and dimensions. A freeform photo render is a marketing concept, not a production file. Decision: build BOTH. The photo render is the wow/hero concept (and the multi-view showcase); the template-geometry render keeps feeding the export pack. The photo concept is labeled a preview, never the print deliverable.

## Validations worth noting
- The owner's two-prompt session confirms the app's natural-language generate-then-iterate flow is the right interaction model.
- The wow factor comes from rendering on the customer's actual vehicle, not a generic template. That is the single highest-leverage upgrade.

## Status
Scoped as Goal 21 (proposed). Recommended sequence: the Goal 20 fix-it goal first (clears launch-blockers and restores the e2e gate), then Goal 21. Awaiting Archer's go and sequencing.
