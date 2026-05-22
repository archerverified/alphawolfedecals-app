import { describe, expect, it } from 'vitest';
import {
  factory,
  serializeDocument,
  deserializeDocument,
  CanvasSchemaError,
  CURRENT_SCHEMA_VERSION,
  type CanvasDocument,
  type PanelState,
} from '../src/index';

function sampleDoc(): CanvasDocument {
  const pid = factory.panelId('panel-driver');
  const view = 'driver' as const;
  const text = factory.newText(
    { id: factory.elementId('el-1'), panelId: pid, view },
    { content: 'AlphaWolf', x: 100, y: 200, zIndex: 0 },
  );
  const rect = factory.newRect(
    { id: factory.elementId('el-2'), panelId: pid, view },
    { width: 500, height: 300, x: 300, y: 50, fill: '#ff0000', zIndex: 1 },
  );
  const img = factory.newImage(
    {
      id: factory.elementId('el-3'),
      panelId: pid,
      view,
      assetId: factory.assetId('asset-9'),
      srcUrl: 'https://example.test/a.png',
      naturalW: 800,
      naturalH: 600,
    },
    { x: 10, y: 10, zIndex: 2, crop: { x: 0, y: 0, width: 400, height: 300 } },
  );

  const panel: PanelState = {
    panelId: pid,
    view,
    elementIds: [text.id, rect.id, img.id],
  };

  const doc = factory.newDocument('vehicle-abc');
  doc.panels[pid] = panel;
  doc.elements[text.id] = text;
  doc.elements[rect.id] = rect;
  doc.elements[img.id] = img;
  doc.selection = [rect.id];
  doc.seq = 3;
  return doc;
}

describe('serialize -> deserialize round-trip', () => {
  it('preserves the document structurally', () => {
    const doc = sampleDoc();
    const payload = serializeDocument(doc);
    const { document, warnings } = deserializeDocument(payload);

    expect(warnings).toEqual([]);
    expect(document.vehicleId).toBe('vehicle-abc');
    expect(document.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(Object.keys(document.elements).sort()).toEqual(['el-1', 'el-2', 'el-3']);
    expect(document.panels['panel-driver']?.elementIds).toEqual(['el-1', 'el-2', 'el-3']);
    expect(document.selection).toEqual(['el-2']);
    expect(document.seq).toBe(3);
  });

  it('round-trips each element type with its discriminated fields', () => {
    const doc = sampleDoc();
    const { document } = deserializeDocument(serializeDocument(doc));

    const text = document.elements['el-1'];
    expect(text?.type).toBe('text');
    if (text?.type === 'text') expect(text.content).toBe('AlphaWolf');

    const shape = document.elements['el-2'];
    expect(shape?.type).toBe('shape');
    if (shape?.type === 'shape') {
      expect(shape.kind).toBe('rect');
      expect(shape.fill).toBe('#ff0000');
    }

    const img = document.elements['el-3'];
    expect(img?.type).toBe('image');
    if (img?.type === 'image') {
      expect(img.assetId).toBe('asset-9');
      expect(img.crop).toEqual({ x: 0, y: 0, width: 400, height: 300 });
    }
  });

  it('stamps the current schema version on serialize', () => {
    const doc = sampleDoc();
    doc.schemaVersion = 999; // stale/wrong on the in-memory doc
    const payload = serializeDocument(doc);
    expect(payload.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('rejects non-finite numbers on serialize', () => {
    const doc = sampleDoc();
    const el = doc.elements['el-1'];
    if (el) el.x = Number.NaN;
    expect(() => serializeDocument(doc)).toThrow(/non-finite/);
  });
});

describe('deserialize validation', () => {
  it('drops elements with an unknown type and collects a warning', () => {
    const payload = {
      schemaVersion: 1,
      vehicleId: 'v',
      panels: {
        p: { panelId: 'p', view: 'driver', elementIds: ['good', 'weird'] },
      },
      elements: {
        good: {
          id: 'good',
          type: 'text',
          panelId: 'p',
          view: 'driver',
          content: 'hi',
        },
        weird: { id: 'weird', type: 'hologram', panelId: 'p', view: 'driver' },
      },
      selection: [],
      seq: 0,
    };
    const { document, warnings } = deserializeDocument(payload);
    expect(document.elements['weird']).toBeUndefined();
    expect(document.elements['good']).toBeDefined();
    // The panel's reference to the dropped element is pruned.
    expect(document.panels['p']?.elementIds).toEqual(['good']);
    expect(warnings.some((w) => w.includes('unknown type'))).toBe(true);
  });

  it('throws CanvasSchemaError on structural corruption', () => {
    expect(() => deserializeDocument(null)).toThrow(CanvasSchemaError);
    expect(() => deserializeDocument(42)).toThrow(CanvasSchemaError);
    expect(() => deserializeDocument({ schemaVersion: 1, vehicleId: 'v', elements: {} })).toThrow(
      /panels/,
    );
    expect(() => deserializeDocument({ schemaVersion: 1, panels: {}, elements: {} })).toThrow(
      /vehicleId/,
    );
  });

  it('fills defaults for missing optional fields', () => {
    const payload = {
      schemaVersion: 1,
      vehicleId: 'v',
      panels: { p: { panelId: 'p', view: 'driver', elementIds: ['t'] } },
      elements: {
        t: { id: 't', type: 'text', panelId: 'p', view: 'driver' },
      },
      selection: [],
      seq: 0,
    };
    const { document } = deserializeDocument(payload);
    const t = document.elements['t'];
    expect(t?.type).toBe('text');
    if (t?.type === 'text') {
      expect(t.fontFamily).toBe('Inter');
      expect(t.opacity).toBe(1);
    }
  });
});
