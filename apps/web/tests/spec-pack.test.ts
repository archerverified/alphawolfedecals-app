// Wrap Spec Pack builder (Goal 5 / B2C-009). Pins the contract: 4 pages,
// provenance metadata, renders from a minimal brief AND a fully-loaded one,
// never throws on junk-ish input. Visual truth is checked by eye on the prod
// artifact (closeout screenshots); these tests keep the builder render-proof.

import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { buildSpecPack, type SpecPackData } from '../lib/export/spec-pack';

const RECT = (x: number, w: number) => `M ${x} 0 L ${x + w} 0 L ${x + w} 40 L ${x} 40 Z`;
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001';
const P2 = 'aaaaaaaa-0000-4000-8000-000000000002';

function baseData(): SpecPackData {
  return {
    projectId: 'bbbbbbbb-0000-4000-8000-000000000001',
    projectName: 'Smoke MVP Wrap',
    projectUrl: 'https://example.test/projects/bbbbbbbb-0000-4000-8000-000000000001',
    customer: { name: 'Casey Customer', email: 'casey@example.test', phone: '+15555550100' },
    vehicle: { label: '2024 Ford Transit 250', lengthMm: 5531, widthMm: 2032, heightMm: 2630 },
    panels: [
      { id: P1, name: 'Front Fascia', view: 'front', outlinePath: RECT(0, 960) },
      { id: P2, name: 'Driver Cargo Panel', view: 'driver', outlinePath: RECT(0, 900) },
    ],
    brief: {},
    briefVersion: null,
    photos: [],
    createdAt: new Date('2026-06-11T00:00:00Z'),
  };
}

async function tinyPng(): Promise<Uint8Array> {
  return new Uint8Array(
    await sharp({
      create: { width: 12, height: 8, channels: 3, background: { r: 30, g: 60, b: 200 } },
    })
      .png()
      .toBuffer(),
  );
}

describe('buildSpecPack', () => {
  it('renders 4 pages with provenance metadata from an EMPTY brief', async () => {
    const bytes = await buildSpecPack(baseData());
    expect(String.fromCharCode(...bytes.slice(0, 5))).toBe('%PDF-');
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(4);
    expect(doc.getTitle()).toContain('Wrap Spec Pack');
    expect(doc.getAuthor()).toBe('Alpha Wolf Wrap Studio');
    expect(doc.getCreator()).toContain('provenance');
  });

  it('renders a fully-loaded brief (colors+SKU, tint+state, photos, notes, hero)', async () => {
    const png = await tinyPng();
    const data: SpecPackData = {
      ...baseData(),
      briefVersion: 3,
      vehicle: { ...baseData().vehicle, heroPng: png },
      photos: [
        { png, note: 'dent on rear left quarter panel' },
        { png, note: 'roof rack stays on' },
      ],
      brief: {
        zones: { includedPanelIds: [P1] },
        logo: { assetId: P1, fileName: 'wolf-logo.png', zonePanelIds: [P1] },
        colors: {
          picks: [
            {
              hex: '#d62e23',
              role: 'primary',
              brand: '3M',
              sku: '2080-G13',
              name: 'Gloss Hot Rod Red',
              finish: 'gloss',
            },
            { hex: '#0d0d0d' },
          ],
        },
        style: { presets: ['Clean'], prompt: 'navy + white contractor look' },
        zoneNotes: { [P1]: 'keep the hood mostly black' },
        materials: { tier: 'premium_cast' },
        tint: { state: 'GA', perWindow: { front: 50, rear: 20 } },
        extras: { chromeDelete: true, dotNumber: 'USDOT 1234567' },
        aiNotes: 'Phone number large on rear doors. Emoji safety: 🚐 stripped.',
      },
      createdAt: new Date('2026-06-11T00:00:00Z'),
    };
    const bytes = await buildSpecPack(data);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(4);
    // A loaded pack is meaningfully heavier than the empty one (images embedded).
    const empty = await buildSpecPack(baseData());
    expect(bytes.length).toBeGreaterThan(empty.length + png.length);
  });

  it('never throws on junk image bytes (skips them)', async () => {
    const data: SpecPackData = {
      ...baseData(),
      vehicle: { ...baseData().vehicle, heroPng: new Uint8Array([1, 2, 3]) },
      photos: [{ png: new Uint8Array([9, 9, 9]), note: 'junk' }],
    };
    const bytes = await buildSpecPack(data);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(4);
  });

  it('has no pricing inputs by construction (the quote box is blank by design)', () => {
    // "No Alpha Wolf pricing anywhere" (PRD §9.1): SpecPackData carries no
    // price/quote/amount field, AND the builder draws tier LABELS only (the
    // wizard's $-glyph cost indicators are deliberately not printed — PR #129
    // review). This pins the input contract; the rendering side is a one-line
    // grep away in spec-pack.ts ('tier.cost' must not appear).
    const keys = JSON.stringify(Object.keys(baseData())).toLowerCase();
    for (const banned of ['price', 'quote', 'amount', 'cost', 'total']) {
      expect(keys).not.toContain(banned);
    }
  });
});
