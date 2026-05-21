// unknown JSON -> CanvasDocument (ADR-0006 §2.4).
//
// Runs `migrateToCurrent` first, then validates BY HAND (no zod — the package
// stays dependency-free). An element with an unknown `type` is DROPPED with a
// collected warning rather than throwing, so one corrupt element can't brick a
// project. `CanvasSchemaError` is thrown only on structural corruption.

import type {
  CanvasDocument,
  CanvasElement,
  ElementId,
  FinishSwatch,
  Gradient,
  ImageElement,
  PanelId,
  PanelState,
  ShapeElement,
  TextElement,
  VehicleView,
} from '../schema/types';
import { CanvasSchemaError, migrateToCurrent } from './migrate';

export interface DeserializeResult {
  document: CanvasDocument;
  /** Non-fatal issues (e.g. dropped unknown element types). */
  warnings: string[];
}

const VEHICLE_VIEWS: ReadonlySet<string> = new Set(['front', 'driver', 'back', 'passenger', 'top']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isBoolean(v: unknown): v is boolean {
  return typeof v === 'boolean';
}

/** Read a finite number, falling back to `fallback` when absent/invalid. */
function num(v: unknown, fallback: number): number {
  return isFiniteNumber(v) ? v : fallback;
}

function str(v: unknown, fallback: string): string {
  return isString(v) ? v : fallback;
}

function bool(v: unknown, fallback: boolean): boolean {
  return isBoolean(v) ? v : fallback;
}

const FINISH_HINTS = ['gloss', 'satin', 'matte', 'chrome', 'carbon', 'brushed'] as const;
type FinishHint = (typeof FINISH_HINTS)[number];

function isFinishHint(v: unknown): v is FinishHint {
  return isString(v) && (FINISH_HINTS as readonly string[]).includes(v);
}

function parseFinishSwatch(v: unknown): FinishSwatch {
  if (!isRecord(v)) return { kind: 'none' };
  if (v.kind === 'color' && isString(v.hex)) return { kind: 'color', hex: v.hex };
  if (v.kind === 'finish' && isFinishHint(v.hint)) {
    return { kind: 'finish', hint: v.hint };
  }
  return { kind: 'none' };
}

function parseGradient(v: unknown): Gradient | null {
  if (!isRecord(v)) return null;
  if (v.type !== 'linear' && v.type !== 'radial') return null;
  const rawStops = Array.isArray(v.stops) ? v.stops : [];
  const stops = rawStops
    .filter(isRecord)
    .map((s) => ({ offset: num(s.offset, 0), color: str(s.color, '#000000') }));
  const gradient: Gradient = { type: v.type, stops };
  if (isFiniteNumber(v.angle)) gradient.angle = v.angle;
  return gradient;
}

/** Parse the fields every element shares. Returns null on structural failure. */
function parseBase(raw: Record<string, unknown>): {
  id: ElementId;
  panelId: PanelId;
  view: VehicleView;
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  finishSwatch: FinishSwatch;
  zIndex: number;
  locked: boolean;
  name?: string;
} | null {
  if (!isString(raw.id) || raw.id.length === 0) return null;
  if (!isString(raw.panelId)) return null;
  const view = isString(raw.view) && VEHICLE_VIEWS.has(raw.view) ? raw.view : 'driver';
  const base = {
    id: raw.id as ElementId,
    panelId: raw.panelId as PanelId,
    view: view as VehicleView,
    x: num(raw.x, 0),
    y: num(raw.y, 0),
    rotation: num(raw.rotation, 0),
    scaleX: num(raw.scaleX, 1),
    scaleY: num(raw.scaleY, 1),
    opacity: num(raw.opacity, 1),
    finishSwatch: parseFinishSwatch(raw.finishSwatch),
    zIndex: num(raw.zIndex, 0),
    locked: bool(raw.locked, false),
  };
  return isString(raw.name) ? { ...base, name: raw.name } : base;
}

function parseElement(raw: unknown, warnings: string[]): CanvasElement | null {
  if (!isRecord(raw)) {
    warnings.push('Dropped non-object element entry');
    return null;
  }
  const type = raw.type;
  if (type !== 'text' && type !== 'shape' && type !== 'image') {
    warnings.push(`Dropped element with unknown type: ${JSON.stringify(type)}`);
    return null;
  }
  const base = parseBase(raw);
  if (!base) {
    warnings.push('Dropped element missing required base fields (id/panelId)');
    return null;
  }

  if (type === 'text') {
    const el: TextElement = {
      ...base,
      type: 'text',
      content: str(raw.content, ''),
      fontFamily: str(raw.fontFamily, 'Inter'),
      fontSize: num(raw.fontSize, 240),
      fill: str(raw.fill, '#000000'),
      align: raw.align === 'center' || raw.align === 'right' ? raw.align : 'left',
      lineHeight: num(raw.lineHeight, 1.2),
      letterSpacing: num(raw.letterSpacing, 0),
      fontStyle:
        raw.fontStyle === 'bold' || raw.fontStyle === 'italic' || raw.fontStyle === 'bold italic'
          ? raw.fontStyle
          : 'normal',
    };
    return el;
  }

  if (type === 'shape') {
    const kind = raw.kind === 'ellipse' || raw.kind === 'line' ? raw.kind : 'rect';
    const el: ShapeElement = {
      ...base,
      type: 'shape',
      kind,
      width: num(raw.width, 0),
      height: num(raw.height, 0),
      fill: isString(raw.fill) ? raw.fill : null,
      stroke: isString(raw.stroke) ? raw.stroke : null,
      strokeWidth: num(raw.strokeWidth, 0),
      gradient: parseGradient(raw.gradient),
    };
    if (isFiniteNumber(raw.cornerRadius)) el.cornerRadius = raw.cornerRadius;
    if (Array.isArray(raw.points)) {
      el.points = raw.points.filter(isFiniteNumber);
    }
    return el;
  }

  // image
  if (!isString(raw.assetId)) {
    warnings.push('Dropped image element missing assetId');
    return null;
  }
  const el: ImageElement = {
    ...base,
    type: 'image',
    assetId: raw.assetId as ImageElement['assetId'],
    srcUrl: str(raw.srcUrl, ''),
    raster: bool(raw.raster, true),
    naturalW: num(raw.naturalW, 0),
    naturalH: num(raw.naturalH, 0),
    crop: isRecord(raw.crop)
      ? {
          x: num(raw.crop.x, 0),
          y: num(raw.crop.y, 0),
          width: num(raw.crop.width, 0),
          height: num(raw.crop.height, 0),
        }
      : null,
  };
  return el;
}

/**
 * Validate and normalize a (migrated) document. Drops corrupt elements/panels
 * with warnings; throws {@link CanvasSchemaError} only on top-level structural
 * corruption.
 */
export function deserializeDocument(input: unknown): DeserializeResult {
  if (!isRecord(input)) {
    throw new CanvasSchemaError('Document is not an object');
  }

  const migrated = migrateToCurrent(input);
  const warnings: string[] = [];

  if (!isString(migrated.vehicleId)) {
    throw new CanvasSchemaError('Document missing vehicleId');
  }
  if (!isRecord(migrated.elements)) {
    throw new CanvasSchemaError('Document missing elements map');
  }
  if (!isRecord(migrated.panels)) {
    throw new CanvasSchemaError('Document missing panels map');
  }

  // ---- elements ----------------------------------------------------------
  const elements: Record<string, CanvasElement> = {};
  const validIds = new Set<string>();
  for (const [key, rawEl] of Object.entries(migrated.elements)) {
    const el = parseElement(rawEl, warnings);
    if (!el) continue;
    if (el.id !== key) {
      warnings.push(`Element key "${key}" does not match its id "${el.id}"; keyed by id`);
    }
    elements[el.id] = el;
    validIds.add(el.id);
  }

  // ---- panels ------------------------------------------------------------
  const panels: Record<string, PanelState> = {};
  for (const [key, rawPanel] of Object.entries(migrated.panels)) {
    if (!isRecord(rawPanel)) {
      warnings.push(`Dropped non-object panel "${key}"`);
      continue;
    }
    const pid = isString(rawPanel.panelId) ? rawPanel.panelId : key;
    const view =
      isString(rawPanel.view) && VEHICLE_VIEWS.has(rawPanel.view)
        ? (rawPanel.view as VehicleView)
        : 'driver';
    const rawIds = Array.isArray(rawPanel.elementIds) ? rawPanel.elementIds : [];
    // Keep only ids that survived element validation, preserving z-order.
    const elementIds: ElementId[] = [];
    for (const id of rawIds) {
      if (isString(id) && validIds.has(id)) {
        elementIds.push(id as ElementId);
      } else {
        warnings.push(`Panel "${pid}" referenced missing/invalid element id ${JSON.stringify(id)}`);
      }
    }
    panels[pid] = { panelId: pid as PanelState['panelId'], view, elementIds };
  }

  // ---- selection ---------------------------------------------------------
  const rawSelection = Array.isArray(migrated.selection) ? migrated.selection : [];
  const selection: ElementId[] = rawSelection.filter(
    (id): id is ElementId => isString(id) && validIds.has(id),
  );

  const document: CanvasDocument = {
    schemaVersion: num(migrated.schemaVersion, 1),
    vehicleId: migrated.vehicleId,
    panels,
    elements,
    selection,
    seq: num(migrated.seq, 0),
  };

  return { document, warnings };
}
