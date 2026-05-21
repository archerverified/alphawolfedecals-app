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
}

export interface EditorVehicleData {
  id: string;
  label: string; // e.g. "2024 Ford Transit 250"
  panels: EditorPanel[];
}

export interface EditorProps {
  projectId: string;
  versionId: string;
  initialRev: number;
  vehicle: EditorVehicleData;
  /** Serialized @alphawolf/canvas document from project_versions.canvas_state. */
  initialDocument: Record<string, unknown>;
}
