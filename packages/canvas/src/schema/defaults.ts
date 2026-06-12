// Element factory defaults (ADR-0006 §1: `newText()`, `newRect()`, ...).
//
// Factories produce fully-populated elements so callers never construct partial
// objects by hand. Each takes a required id/panel/view and accepts an overrides
// object for the rest.

import type {
  AssetId,
  CanvasDocument,
  ElementId,
  ImageElement,
  PanelId,
  ShapeElement,
  TextElement,
  VehicleView,
} from './types.js';
import { CURRENT_SCHEMA_VERSION } from './versions.js';

/** Mint a branded ElementId from a raw string. */
export function elementId(raw: string): ElementId {
  return raw as ElementId;
}
/** Mint a branded PanelId from a raw string. */
export function panelId(raw: string): PanelId {
  return raw as PanelId;
}
/** Mint a branded AssetId from a raw string. */
export function assetId(raw: string): AssetId {
  return raw as AssetId;
}

interface BaseInit {
  id: ElementId;
  panelId: PanelId;
  view: VehicleView;
}

const BASE_DEFAULTS = {
  x: 0,
  y: 0,
  rotation: 0,
  scaleX: 1,
  scaleY: 1,
  opacity: 1,
  finishSwatch: { kind: 'none' } as const,
  zIndex: 0,
  locked: false,
};

export function newText(
  init: BaseInit,
  overrides: Partial<Omit<TextElement, 'id' | 'type'>> = {},
): TextElement {
  return {
    ...BASE_DEFAULTS,
    id: init.id,
    panelId: init.panelId,
    view: init.view,
    type: 'text',
    content: 'Text',
    fontFamily: 'Inter',
    fontSize: 240,
    fill: '#000000',
    align: 'left',
    lineHeight: 1.2,
    letterSpacing: 0,
    fontStyle: 'normal',
    ...overrides,
  };
}

export function newRect(
  init: BaseInit,
  overrides: Partial<Omit<ShapeElement, 'id' | 'type' | 'kind'>> = {},
): ShapeElement {
  return {
    ...BASE_DEFAULTS,
    id: init.id,
    panelId: init.panelId,
    view: init.view,
    type: 'shape',
    kind: 'rect',
    width: 1000,
    height: 1000,
    fill: '#cccccc',
    stroke: null,
    strokeWidth: 0,
    gradient: null,
    ...overrides,
  };
}

export function newEllipse(
  init: BaseInit,
  overrides: Partial<Omit<ShapeElement, 'id' | 'type' | 'kind'>> = {},
): ShapeElement {
  return {
    ...BASE_DEFAULTS,
    id: init.id,
    panelId: init.panelId,
    view: init.view,
    type: 'shape',
    kind: 'ellipse',
    width: 1000,
    height: 1000,
    fill: '#cccccc',
    stroke: null,
    strokeWidth: 0,
    gradient: null,
    ...overrides,
  };
}

export function newLine(
  init: BaseInit,
  overrides: Partial<Omit<ShapeElement, 'id' | 'type' | 'kind'>> = {},
): ShapeElement {
  return {
    ...BASE_DEFAULTS,
    id: init.id,
    panelId: init.panelId,
    view: init.view,
    type: 'shape',
    kind: 'line',
    width: 1000,
    height: 0,
    points: [0, 0, 1000, 0],
    fill: null,
    stroke: '#000000',
    strokeWidth: 20,
    gradient: null,
    ...overrides,
  };
}

interface ImageInit extends BaseInit {
  assetId: AssetId;
  srcUrl: string;
  naturalW: number;
  naturalH: number;
}

export function newImage(
  init: ImageInit,
  overrides: Partial<Omit<ImageElement, 'id' | 'type' | 'assetId'>> = {},
): ImageElement {
  return {
    ...BASE_DEFAULTS,
    id: init.id,
    panelId: init.panelId,
    view: init.view,
    type: 'image',
    assetId: init.assetId,
    srcUrl: init.srcUrl,
    raster: true,
    naturalW: init.naturalW,
    naturalH: init.naturalH,
    crop: null,
    ...overrides,
  };
}

/** An empty document targeting a vehicle, at the current schema version. */
export function newDocument(vehicleId: string): CanvasDocument {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    vehicleId,
    panels: {},
    elements: {},
    selection: [],
    seq: 0,
  };
}
