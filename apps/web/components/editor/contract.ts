// Server↔client contract for the canvas editor (GH-008). Plain types only (no
// 'use client'), so both the server route page and the client editor import it.
//
// The editor renders from STRUCTURED PANEL DATA (not the raw vehicle SVG): each
// panel carries its view-local outline path (the body line) and wrap-safe path
// (the printable-area clip). Views are laid out in a row by the React layer,
// computing each view's x-offset from its content bbox (ADR-0006 §2: the view
// transform lives only in the React/Konva layer; here we derive it rather than
// reading it from the SVG, so the editor doesn't depend on the SVG file).

export interface EditorPanel {
  id: string; // = vehicle_panels.id, used as the canvas PanelId
  name: string;
  view: string; // 'front' | 'driver' | 'back' | 'passenger' | 'top'
  outlinePath: string; // view-local SVG path `d` (body line)
  wrapSafePath: string; // view-local SVG path `d` (printable-area clip)
  finishHint: string;
  /** Real printable surface area in mm² (0 = not yet calibrated). Surfaced as a
      friendly area in the zone inspector (Goal 12 D2). */
  printableAreaMm2: number;
}

export interface EditorVehicleData {
  id: string;
  label: string; // e.g. "2024 Ford Transit 250"
  panels: EditorPanel[];
  /** Public URL of the recognizable vehicle artwork (wrapped.svg) rendered as
      the editor backdrop (Goal 12 D2). null when the template has no art yet
      (e.g. the Transit) — the editor then falls back to outlined zone boxes. */
  artUrl: string | null;
}

/** AI design-assistant context surfaced inside the editor (Goal 12 D3). */
export interface EditorAiContext {
  /** Generation credit balance, shown before generating (cost transparency). */
  creditBalance: number;
  /** Whether a design brief exists — the brief→3-concepts run requires one. */
  hasBrief: boolean;
  /** Whether the project already has generation runs (→ "open AI studio"). */
  hasRuns: boolean;
}

export interface EditorProps {
  projectId: string;
  versionId: string;
  initialRev: number;
  vehicle: EditorVehicleData;
  /** Serialized @alphawolf/canvas document from project_versions.canvas_state. */
  initialDocument: Record<string, unknown>;
  /** AI design-assistant context (Goal 12 D3). */
  ai: EditorAiContext;
}
