# Goal 12 — Design Editor Overhaul (architecture)

How the editor went from abstract panel boxes to a real wrap-design surface. The
key realization: the AW-owned `wrapped.svg` artwork and the `vehicle_panels`
geometry share ONE coordinate space, so the editor renders the art as a backdrop
with the panels as selectable zones on top — no AI generation required.

```mermaid
flowchart TD
  subgraph DB["Supabase (existing data — D1 finding)"]
    art["vehicles.svg_storage_key<br/>→ wrapped.svg (recognizable, AW-owned)"]
    panels["vehicle_panels<br/>(svg_path, wrap_safe_zone, printable_area_mm2)"]
  end

  subgraph SRV["editor/page.tsx (server, RLS-scoped)"]
    artUrl["storage.templatePublicUrl(svg_storage_key)<br/>→ artUrl (null ⇒ Transit fallback)"]
    panelData["EditorPanel[] + printableAreaMm2"]
    aiCtx["generation.getRunContext → balance + activeRun<br/>(lightweight; review fix)"]
  end
  art --> artUrl
  panels --> panelData

  subgraph STAGE["CanvasStage (native absolute coords — D2)"]
    cam["camera: frame whole vehicle ('all')<br/>or one view (art-cropped)"]
    L1["VehicleArtLayer — wrapped art backdrop"]
    L2["VehicleLayer — selectable wrap ZONES<br/>(hover/click → name + area)"]
    L3["ArtworkLayer — customer elements (clipped)"]
    L4["OverlayLayer — transformer + snap + OOB cue"]
  end
  artUrl --> L1
  panelData --> L2
  panelData --> L3

  subgraph UI["CanvasEditor"]
    vsel["view selector (All · Front · Driver · Rear · Passenger)"]
    zinsp["zone inspector — name · view · m²/ft² · finish"]
    ai["'Design with AI' (D3) → dialog (cost shown)"]
    up["UploadPanel → onPlaceImage"]
  end
  vsel --> cam
  L2 -->|select zone| zinsp
  aiCtx --> ai
  ai -->|reuse Goal 7| gen["/generate · GenerateButton · brief→3 concepts"]
  up -->|D4: fitImageToZone| snap["center + scale-to-fit in selected zone<br/>(was 0,0)"]
  snap --> L3

  classDef fix fill:#e0f2fe,stroke:#00AEEF;
  class L1,L2,cam,zinsp,ai,snap fix;
```

**Deliverables:** D1 (art already existed → evidenced report, $0 spend) · D2 (art
backdrop + native coords + camera + selectable zones) · D3 (in-editor AI entry,
reuses Goal 7) · D4 (logo snaps to zone) · D5 (axe-clean, design grade F→A−).
