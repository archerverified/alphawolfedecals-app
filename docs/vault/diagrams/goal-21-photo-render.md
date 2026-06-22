# Goal 21 - Photo-render concepts + multi-view marketing showcase

How the on-photo render path and the showcase attach to the existing pipeline, and how the
print/export path stays isolated from them.

```mermaid
flowchart TD
  subgraph brief["Brief (existing)"]
    photo["Customer vehicle photo<br/>brief.data.photos[] -> project-assets (private)"]
    logo["Logo asset<br/>brief.data.logo.assetId"]
  end

  subgraph run["Generation run (initial / final)"]
    orch["orchestrateSlice<br/>compileBrief -> 3 directions x per-view prompts"]
    tj["TEMPLATE jobs<br/>render_target=template, real views"]
    pj["PHOTO jobs (Goal 21)<br/>render_target=photo, view=photo<br/>1 per direction (initial) / 1 (final)"]
    orch --> tj
    orch -->|photo present| pj
  end

  subgraph render["renderSlice (partitioned)"]
    tcond["Template branch<br/>imageUrls[0] = templatePublicUrl(views/&lt;veh&gt;/&lt;view&gt;.png)<br/>+ Goal-17 anchor + Goal-18 gradient guide"]
    pcond["Photo branch (isolated)<br/>imageUrls[0] = signed customer photo<br/>model = nano_banana_edit, no anchor/guide"]
    tj --> tcond
    pj --> pcond
  end

  subgraph store["generation_images (owner RLS, immutable)"]
    timg["render_target=template renders"]
    pimg["render_target=photo renders"]
    tcond --> timg
    pcond --> pimg
  end

  subgraph print["PRINT / EDITOR path (LOCKED, template-only)"]
    hero["loadFinalViews: render_target=template ONLY"]
    pack["buildSpecPack: panel geometry (svgPath) + template hero"]
    canvas["insertIntoCanvas: template renders + REAL logo composited"]
    timg --> hero --> pack
    timg --> canvas
  end

  subgraph showcase["SHOWCASE / STUDIO (marketing, photo-aware)"]
    gallery["deriveConcepts: photo -> photoView / finalPhotoView<br/>(never card.views; switcher excludes 'photo')"]
    preview["Studio on-photo preview<br/>'Concept preview, not the print file'"]
    comp["composeShowcase (sharp): template views + photo hero<br/>+ REAL logo overlay + cyan #00AEEF brand"]
    pimg --> gallery --> preview
    timg --> comp
    pimg --> comp
  end

  share["Public share link<br/>render_target=template ONLY (photo excluded)"]
  timg --> share

  logo -.composited, never AI-redrawn.-> canvas
  logo -.composited, never AI-redrawn.-> comp

  classDef locked fill:#1b2a4a,stroke:#00AEEF,color:#fff
  classDef photo fill:#3a1b1b,stroke:#ff8a8a,color:#fff
  class print,hero,pack,canvas locked
  class pj,pcond,pimg,preview photo
```

## Invariants enforced (verified by tests + final review)

- The photo render is `render_target='photo'` / `view='photo'` and is filtered out of every
  print/editor/share read (`loadFinalViews`, `insertIntoCanvas`, public share), so the spec pack and
  the editor canvas keep deriving from template geometry only.
- The Goal-17 anchor + Goal-18 gradient-guide coherence machinery runs on template jobs only; a photo
  job never becomes an anchor and never gates a template job; template conditioning is unchanged.
- Photo jobs ride the existing run's single credit spend; the daily $5 spend cap stays a true upper
  bound (`estimateRunCostUsd` counts the photo renders).
- The real logo is composited (sharp) on the showcase + editor + export; it is never sent to the AI.
- New `render_target` column on already-RLS'd tables; no new tables/buckets/policies. All photo,
  showcase, and brief paths are owner-scoped via `withUser`.

Spend ceiling for build/verify: $10 (logged DECISION D-A). Marginal feature cost: +3 nano renders on
the initial run, +1 on the final (~$0.16 / project).
