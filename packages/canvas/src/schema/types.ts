// Canvas-state JSON schema (ADR-0006 §2).
//
// This module is TYPE-ONLY: every export is erased at compile time. No runtime
// values live here. Branded ids prevent element/panel/asset ids from being
// swapped at call sites.

/** Brand a `string` so element/panel/asset ids are not interchangeable. */
export type ElementId = string & { readonly __brand: 'ElementId' };
/** = VehiclePanel.id */
export type PanelId = string & { readonly __brand: 'PanelId' };
/** = project_assets.asset_id */
export type AssetId = string & { readonly __brand: 'AssetId' };

export type VehicleView = 'front' | 'driver' | 'back' | 'passenger' | 'top';

export type FinishSwatch =
  | { kind: 'none' }
  | {
      kind: 'finish';
      hint: 'gloss' | 'satin' | 'matte' | 'chrome' | 'carbon' | 'brushed';
    }
  | { kind: 'color'; hex: string }; // solid vinyl color

// ---- common fields shared by every element -------------------------------
export interface BaseElement {
  readonly id: ElementId;
  /** Panel this element is parented to. Coordinates below are PANEL-LOCAL. */
  panelId: PanelId;
  /** Denormalized for fast per-view rendering/filtering. */
  view: VehicleView;
  /** panel-local, mm×10 (same unit as the SVG) */
  x: number;
  y: number;
  /** degrees, Konva convention */
  rotation: number;
  scaleX: number;
  scaleY: number;
  /** 0..1 */
  opacity: number;
  finishSwatch: FinishSwatch;
  /** authoritative z within the panel mirrors elementIds order */
  zIndex: number;
  /** not draggable/selectable when true */
  locked: boolean;
  /** user-facing layer name */
  name?: string;
}

// ---- text ----------------------------------------------------------------
export interface TextElement extends BaseElement {
  type: 'text';
  content: string;
  fontFamily: string;
  fontSize: number;
  /** hex */
  fill: string;
  align: 'left' | 'center' | 'right';
  lineHeight: number;
  letterSpacing: number;
  fontStyle: 'normal' | 'bold' | 'italic' | 'bold italic';
}

// ---- shape (rect / ellipse / line) ---------------------------------------
export interface Gradient {
  type: 'linear' | 'radial';
  /** offset 0..1 */
  stops: ReadonlyArray<{ offset: number; color: string }>;
  /** linear: angle in degrees; radial: focal as fraction of bbox */
  angle?: number;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  kind: 'rect' | 'ellipse' | 'line';
  /** bbox-local; for 'line' width=length, height ignored */
  width: number;
  height: number;
  /** rect only */
  cornerRadius?: number;
  /** line only: [x1,y1,x2,y2,...] panel-local */
  points?: ReadonlyArray<number>;
  /** null = no fill (line) */
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  /** overrides fill when present */
  gradient: Gradient | null;
}

// ---- image (raster + vector) ---------------------------------------------
export interface ImageElement extends BaseElement {
  type: 'image';
  /** FK into project_assets */
  assetId: AssetId;
  /** resolved at save time; re-validated on load */
  srcUrl: string;
  /** true = raster (png/jpg), false = vector (svg) */
  raster: boolean;
  naturalW: number;
  naturalH: number;
  /** crop is a sub-rect of the natural image, in natural pixels */
  crop: { x: number; y: number; width: number; height: number } | null;
}

export type CanvasElement = TextElement | ShapeElement | ImageElement;
export type ElementType = CanvasElement['type'];

// ---- per-panel container -------------------------------------------------
export interface PanelState {
  panelId: PanelId;
  view: VehicleView;
  /** z-order, back-to-front. Authoritative ordering; element.zIndex mirrors it. */
  elementIds: ElementId[];
}

// ---- top-level document --------------------------------------------------
export interface CanvasDocument {
  /** see versions.ts */
  schemaVersion: number;
  /** Vehicle.id this document targets */
  vehicleId: string;
  /** keyed by PanelId */
  panels: Record<string, PanelState>;
  /** keyed by ElementId, flat */
  elements: Record<string, CanvasElement>;
  /** current selection (persisted; see §3) */
  selection: ReadonlyArray<ElementId>;
  /** Monotonically-increasing counter for generating element ids client-side. */
  seq: number;
}
