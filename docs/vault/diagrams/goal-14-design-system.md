# Goal 14 — Design System Integration (diagram)

How the committed **alpha-wolf-design** system was wired across the Wrap Studio app
as a **presentational-only** layer (zero behavior change). The single lever: the
shadcn primitives already referenced semantic CSS vars that were never defined —
defining them (mapped to `--aws-*`) restyled every primitive with no component change.

```mermaid
flowchart TD
    SKILL[".claude/skills/alpha-wolf-design<br/>tokens · wrap_studio kit · rules · Geist · logo.png"]

    subgraph D2["D2 — Token foundation (globals.css)"]
      THEME["@theme inline → shadcn color vars<br/>--primary/--ring/--border/--card/--accent…"]
      ROOT[":root → --aws-* values<br/>zinc surfaces · black action · cyan #00AEEF"]
      FONT["Geist Sans+Mono<br/>next/font/local · display:optional"]
      BORDER["* { border-color: var(--border) }<br/>(bare border = zinc-200)"]
      LOGO["public/brand/alpha-wolf-logo.png"]
    end

    subgraph D3["D3 — Primitives (packages/ui)"]
      PRIM["Button · Input · Card · Label · Select<br/>Toast/Sonner · Skeleton — restyled via tokens"]
      NEW["+ Eyebrow · + Badge (kit-faithful)"]
      METER["5-step password meter — verified single-sourced"]
    end

    subgraph D4["D4 — Surfaces (apps/web)"]
      LAND["Landing — zinc-900 hero band (BOLDER · DEC-3)"]
      AUTH["Auth shell — logo lockup · brand banner"]
      CAT["Catalogue — dedupe + progressive hint"]
      DET["Vehicle detail — Start design = primary btn"]
      BRIEF["Brief — distinct logo copy · stepper"]
      GEN["Generation — skeleton · boilerplate-once (DEC-4 mock'd)"]
      ED["Editor — toast bottom-right · chrome on-brand"]
      EXP["Export PDF — logo column fits"]
      SEC["Projects · Share · Referral · Locator · Dashboard · Order-confirmed<br/>warm empty states · Badge · emoji removed"]
    end

    subgraph DEFECTS["Goal-13 defects closed"]
      D135["D13-5 brand-less front door"]
      D132["D13-2 toast occludes Save"]
      D133["D13-3 dup logo copy"]
      D134["D13-4 empty concept cards → skeleton"]
      D136["D13-6 password meter"]
      D137["D13-7 catalogue dup + detail CTA"]
    end

    subgraph GATE["D5 — DON'T-BREAK gate"]
      UNIT["unit/integration 251+ ✓"]
      E2E["e2e: signup · catalogue · brief · editor · mvp ✓"]
      AXE["axe WCAG 2.2 AA — 0 violations held"]
      EDV["editor renders vehicle · zones · logo · AI"]
    end

    SKILL --> D2
    D2 --> D3
    D3 --> D4
    THEME --> PRIM
    ROOT --> PRIM
    FONT --> D4
    BORDER --> PRIM
    LOGO --> LAND
    LOGO --> AUTH
    NEW --> SEC
    D4 --> DEFECTS
    LAND --> D135
    AUTH --> D135
    ED --> D132
    BRIEF --> D133
    GEN --> D134
    METER --> D136
    CAT --> D137
    DET --> D137
    D4 --> GATE
```

**Posture:** surgical/visual-only by default; two bolder calls flagged for Archer's
sign-off — the landing `zinc-900` inverse hero band (DEC-3) and the generation
featured-concept layout (DEC-4, mockup-only this pass; the populated grid can't
render under the local mock provider, so the safe slop-fixes shipped and the
featured reflow is greenlight-pending).

**Hard line held:** no Konva/canvas/render/zones logic, no server actions/auth/RLS,
no export computation, no third color, no emoji, no invented radii — all touched
files are Tailwind classes / copy / markup-for-styling with identical component APIs.
