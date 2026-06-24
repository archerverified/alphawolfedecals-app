// Wrap Spec Pack PDF builder (Goal 5 / B2C-009). PRD §3 step 5: the money
// artifact — Alpha Wolf supplies the SPEC, the receiving shop supplies the
// quote. NO PRICING ANYWHERE on the pack (Archer decision §9.1); page 4
// carries a deliberately blank shop-quote box instead.
//
// pdf-lib (pure JS, no native deps — safe on the Vercel lambda) + a
// zero-dependency QR matrix drawn as vector rects. Takes PRELOADED data so
// B2C-010 (email attachment, send-to-shop) reuses the same builder.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import qrcodegen from 'qrcode-generator';
import type { BriefData } from '@/lib/brief/schema';
import type { BriefPanel } from '@/components/brief/steps';
import { panelPrintSizesIn, type VehicleDims } from '@/lib/brief/quality';
import { MATERIAL_TIERS } from '@/lib/brief/schema';
import { tintVerdict, TINT_WINDOWS, type TintWindow } from '@/lib/brief/tint-laws';

export interface SpecPackPhoto {
  /** Parsed PNG bytes (the worker normalizes every raster to PNG). */
  png: Uint8Array;
  note?: string;
}

/** AI provenance for a pack whose hero is a generated final render (Goal 7 D6). */
export interface AiProvenance {
  provider: string;
  model: string;
  runId: string;
  promptVersion: string;
}

export interface SpecPackData {
  projectId: string;
  projectName: string;
  projectUrl: string; // QR target — the live project (the viral loop)
  customer: { name: string; email: string; phone?: string | null };
  vehicle: {
    label: string; // "2024 Ford Transit 250 …"
    lengthMm: number;
    widthMm: number;
    heightMm: number;
    /** Hero image bytes (template render or AI final); absent → text-only cover. */
    heroPng?: Uint8Array;
    /**
     * Encoding of heroPng. The fal provider returns JPEG by default, so AI
     * final heroes are usually 'jpg'; template thumbs are 'png'. Defaults to
     * 'png' when omitted.
     */
    heroKind?: 'png' | 'jpg';
    /**
     * Goal 15 D4: per-view final renders (logo already composited, D2), shown
     * as a grid on page 2. Compositor output is JPEG. Absent → single hero.
     */
    views?: Array<{ view: string; png: Uint8Array; kind?: 'png' | 'jpg' }>;
  };
  panels: BriefPanel[];
  brief: BriefData;
  briefVersion: number | null;
  photos: SpecPackPhoto[]; // ≤4 embedded
  createdAt: Date;
  /** Set when the hero is an AI final render — lands in the PDF metadata. */
  aiProvenance?: AiProvenance;
}

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 54;
const INK = rgb(0.09, 0.09, 0.1);
const MUTED = rgb(0.45, 0.46, 0.48);
const LINE = rgb(0.85, 0.86, 0.87);
const AMBER = rgb(0.7, 0.4, 0.05);

const MM_PER_IN = 25.4;
const WASTE_FACTOR = 1.15; // +15% waste allowance (PRD §3 step 5 page 4)

function mmToIn(mm: number): string {
  return `${Math.round(mm / MM_PER_IN)} in`;
}

const VIEW_LABELS: Record<string, string> = {
  front: 'Front',
  driver: 'Driver side',
  back: 'Rear',
  passenger: 'Passenger side',
  top: 'Roof',
};
function viewLabel(view: string): string {
  return VIEW_LABELS[view] ?? view;
}

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  data: SpecPackData;
  pageNo: number;
}

function wrapText(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// Make any input encodable by pdf-lib's standard fonts (WinAnsi): map the
// common typographic characters to ASCII first, then strip what's left
// (e.g. emoji from user notes) - the pack must render against any input.
const TYPOGRAPHIC: ReadonlyArray<[RegExp, string]> = [
  [/[\u2014\u2013]/g, '-'], // em/en dash
  [/[\u2018\u2019]/g, "'"],
  [/[\u201C\u201D]/g, '"'],
  [/\u2026/g, '...'],
  [/\u2022/g, '-'],
];
function safe(text: string): string {
  let out = text;
  for (const [re, sub] of TYPOGRAPHIC) out = out.replace(re, sub);

  return out.replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

function footer(ctx: Ctx, page: PDFPage) {
  const { font, data } = ctx;
  const y = 28;
  page.drawLine({
    start: { x: MARGIN, y: y + 14 },
    end: { x: PAGE_W - MARGIN, y: y + 14 },
    thickness: 0.5,
    color: LINE,
  });
  const contact = [data.customer.name, data.customer.phone, data.customer.email]
    .filter(Boolean)
    .join(' · ');
  page.drawText(safe(contact), { x: MARGIN, y, size: 7.5, font, color: MUTED });
  const right = `${data.createdAt.toISOString().slice(0, 10)} · brief v${data.briefVersion ?? '—'} · page ${ctx.pageNo}`;
  page.drawText(safe(right), {
    x: PAGE_W - MARGIN - font.widthOfTextAtSize(right, 7.5),
    y,
    size: 7.5,
    font,
    color: MUTED,
  });
  page.drawText('Designed with Alpha Wolf Wrap Studio — alphawolfedecals-app-web.vercel.app', {
    x: MARGIN,
    y: y - 11,
    size: 7.5,
    font,
    color: MUTED,
  });
}

function newPage(ctx: Ctx, title?: string): { page: PDFPage; y: number } {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageNo += 1;
  footer(ctx, page);
  let y = PAGE_H - MARGIN;
  if (title) {
    page.drawText(safe(title), { x: MARGIN, y: y - 14, size: 16, font: ctx.bold, color: INK });
    y -= 34;
  }
  return { page, y };
}

function drawQr(page: PDFPage, url: string, x: number, y: number, size: number) {
  const qr = qrcodegen(0, 'M'); // type 0 = auto version
  qr.addData(url);
  qr.make();
  const n = qr.getModuleCount();
  const cell = size / n;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) {
        page.drawRectangle({
          x: x + c * cell,
          y: y + size - (r + 1) * cell,
          width: cell,
          height: cell,
          color: INK,
        });
      }
    }
  }
}

function hexToRgbTriplet(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

function hexColor(hex: string) {
  return rgb(
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255,
  );
}

/** Included panels per the brief (null = full wrap = all). */
function includedPanels(data: SpecPackData): BriefPanel[] {
  const ids = data.brief.zones?.includedPanelIds ?? null;
  return ids === null ? data.panels : data.panels.filter((p) => ids.includes(p.id));
}

/** Embed the hero respecting its encoding (AI finals from fal are JPEG). */
function embedHero(doc: PDFDocument, data: SpecPackData) {
  const bytes = data.vehicle.heroPng!;
  return data.vehicle.heroKind === 'jpg' ? doc.embedJpg(bytes) : doc.embedPng(bytes);
}

export async function buildSpecPack(data: SpecPackData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // AI provenance + identity metadata (PRD v1.1 §4.4 requirement).
  doc.setTitle(`Wrap Spec Pack — ${data.projectName}`);
  doc.setAuthor('Alpha Wolf Wrap Studio');
  doc.setProducer('Alpha Wolf Wrap Studio spec-pack generator (B2C-009)');
  if (data.aiProvenance) {
    // Goal 7 D6: the cover hero is an AI final render — record full provenance
    // (provider, model, run, prompt version) in the document metadata.
    const p = data.aiProvenance;
    doc.setCreator(
      `AI-generated design — ${p.provider}/${p.model}, run ${p.runId}, prompt ${p.promptVersion}; ` +
        'provenance: alphawolfedecals-app-web.vercel.app',
    );
    doc.setKeywords([
      'AI-generated',
      `provider:${p.provider}`,
      `model:${p.model}`,
      `run:${p.runId}`,
      `promptVersion:${p.promptVersion}`,
    ]);
  } else {
    doc.setCreator(
      'AI-assisted design brief — generated content; provenance: alphawolfedecals-app-web.vercel.app',
    );
  }
  doc.setSubject(`Vehicle wrap specification for ${data.vehicle.label}`);
  doc.setCreationDate(data.createdAt);

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, bold, data, pageNo: 0 };

  // ---- Page 1 — Cover -------------------------------------------------------
  {
    const { page } = newPage(ctx);
    let y = PAGE_H - 90;
    page.drawText('ALPHA WOLF WRAP STUDIO', { x: MARGIN, y, size: 11, font: bold, color: MUTED });
    y -= 34;
    page.drawText('Wrap Spec Pack', { x: MARGIN, y, size: 30, font: bold, color: INK });
    y -= 26;
    for (const line of wrapText(bold, safe(data.projectName), 16, PAGE_W - 2 * MARGIN)) {
      page.drawText(line, { x: MARGIN, y, size: 16, font: bold, color: INK });
      y -= 20;
    }
    page.drawText(safe(data.vehicle.label), { x: MARGIN, y, size: 12, font, color: MUTED });
    y -= 16;
    page.drawText(
      safe(`Prepared for ${data.customer.name} · ${data.createdAt.toISOString().slice(0, 10)}`),
      { x: MARGIN, y, size: 10, font, color: MUTED },
    );
    y -= 24;

    if (data.vehicle.heroPng) {
      try {
        const img = await embedHero(doc, data);
        const maxW = PAGE_W - 2 * MARGIN;
        const maxH = 300;
        const scale = Math.min(maxW / img.width, maxH / img.height);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, { x: (PAGE_W - w) / 2, y: y - h, width: w, height: h });
        y -= h + 24;
      } catch {
        // Bad image bytes → text-only cover; never fail the pack.
      }
    }

    // QR + short URL to the live project (viral loop / affiliate groundwork).
    const qrSize = 84;
    drawQr(page, data.projectUrl, MARGIN, 90, qrSize);
    page.drawText('Scan to open this design', {
      x: MARGIN + qrSize + 12,
      y: 90 + qrSize - 18,
      size: 10,
      font: bold,
      color: INK,
    });
    page.drawText(safe(data.projectUrl), {
      x: MARGIN + qrSize + 12,
      y: 90 + qrSize - 34,
      size: 9,
      font,
      color: MUTED,
    });
  }

  // ---- Page 2 — Vehicle spec ------------------------------------------------
  {
    const { page, y: top } = newPage(ctx, 'Vehicle');
    let y = top;
    const v = data.vehicle;
    const rows: Array<[string, string]> = [
      ['Vehicle', v.label],
      ['Length', `${v.lengthMm} mm (${mmToIn(v.lengthMm)})`],
      ['Width', `${v.widthMm} mm (${mmToIn(v.widthMm)})`],
      ['Height', `${v.heightMm} mm (${mmToIn(v.heightMm)})`],
    ];
    for (const [k, val] of rows) {
      page.drawText(k, { x: MARGIN, y, size: 10, font: bold, color: MUTED });
      page.drawText(safe(val), { x: MARGIN + 110, y, size: 10, font, color: INK });
      y -= 18;
    }
    y -= 10;
    const designViews = v.views ?? [];
    if (designViews.length > 0) {
      // Goal 15 D4: show the design on EVERY view in a 2-column grid (logo
      // already composited on each — D2), not a single bare hero.
      page.drawText('Your design — every view', {
        x: MARGIN,
        y,
        size: 10,
        font: bold,
        color: MUTED,
      });
      y -= 16;
      const gap = 16;
      const cellW = (PAGE_W - 2 * MARGIN - gap) / 2;
      const cellH = 150;
      let col = 0;
      let rowTop = y;
      for (const view of designViews) {
        try {
          const img =
            view.kind === 'png' ? await doc.embedPng(view.png) : await doc.embedJpg(view.png);
          const scale = Math.min(cellW / img.width, cellH / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          const cx = MARGIN + col * (cellW + gap);
          page.drawImage(img, { x: cx + (cellW - w) / 2, y: rowTop - h, width: w, height: h });
          page.drawText(safe(viewLabel(view.view)), {
            x: cx,
            y: rowTop - cellH - 2,
            size: 8.5,
            font,
            color: MUTED,
          });
        } catch {
          /* skip a bad view image — never fail the pack */
        }
        col += 1;
        if (col === 2) {
          col = 0;
          rowTop -= cellH + 22;
        }
        if (rowTop < 120) break;
      }
    } else if (v.heroPng) {
      try {
        const img = await embedHero(doc, data);
        const maxW = PAGE_W - 2 * MARGIN;
        const maxH = y - 120;
        const scale = Math.min(maxW / img.width, maxH / img.height, 1.2);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawText('Template views', { x: MARGIN, y, size: 10, font: bold, color: MUTED });
        page.drawImage(img, { x: (PAGE_W - w) / 2, y: y - h - 14, width: w, height: h });
      } catch {
        /* text-only */
      }
    }
  }

  // ---- Page 3 — Design spec table -------------------------------------------
  {
    const { page, y: top } = newPage(ctx, 'Design spec');
    let y = top;
    const dims: VehicleDims = { lengthMm: data.vehicle.lengthMm, widthMm: data.vehicle.widthMm };
    const sizes = panelPrintSizesIn(data.panels, dims);
    const included = includedPanels(data);
    const logoZoneIds = new Set(data.brief.logo?.zonePanelIds ?? []);

    // Colors block (HEX + RGB + SKU + finish — PRD page-3 table requirement).
    page.drawText('Colors', { x: MARGIN, y, size: 11, font: bold, color: INK });
    y -= 16;
    const picks = data.brief.colors?.picks ?? [];
    if (picks.length === 0) {
      page.drawText('No colors specified — shop to advise.', {
        x: MARGIN,
        y,
        size: 9.5,
        font,
        color: MUTED,
      });
      y -= 16;
    }
    for (const p of picks) {
      page.drawRectangle({
        x: MARGIN,
        y: y - 2,
        width: 10,
        height: 10,
        color: hexColor(p.hex),
        borderColor: LINE,
        borderWidth: 0.5,
      });
      const label = [
        `${p.hex.toUpperCase()} (RGB ${hexToRgbTriplet(p.hex)})`,
        p.role,
        p.name,
        p.brand && p.sku ? `${p.brand} ${p.sku}` : undefined,
        p.finish,
      ]
        .filter(Boolean)
        .join(' · ');
      page.drawText(safe(label), { x: MARGIN + 16, y, size: 9.5, font, color: INK });
      y -= 15;
    }
    y -= 12;

    // Zone table header.
    const cols = [MARGIN, MARGIN + 150, MARGIN + 250, MARGIN + 330, MARGIN + 410];
    page.drawText('Zone', { x: cols[0]!, y, size: 9.5, font: bold, color: MUTED });
    page.drawText('Approx. size', { x: cols[1]!, y, size: 9.5, font: bold, color: MUTED });
    page.drawText('Area (sq ft)', { x: cols[2]!, y, size: 9.5, font: bold, color: MUTED });
    page.drawText('Logo', { x: cols[3]!, y, size: 9.5, font: bold, color: MUTED });
    page.drawText('Notes', { x: cols[4]!, y, size: 9.5, font: bold, color: MUTED });
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: LINE,
    });
    y -= 14;

    // Total over ALL included panels — independent of how many table rows fit
    // (PR #129 review MUST-FIX: a truncated table must not shrink the total).
    const totalSqFt = included.reduce((sum, panel) => {
      const size = sizes.get(panel.id);
      return size ? sum + (size.widthIn * size.heightIn) / 144 : sum;
    }, 0);
    let drawn = 0;
    for (const panel of included) {
      const size = sizes.get(panel.id);
      const sqft = size ? (size.widthIn * size.heightIn) / 144 : null;
      page.drawText(safe(panel.name), { x: cols[0]!, y, size: 9.5, font, color: INK });
      page.drawText(size ? `~${Math.round(size.widthIn)} × ${Math.round(size.heightIn)} in` : '—', {
        x: cols[1]!,
        y,
        size: 9.5,
        font,
        color: INK,
      });
      page.drawText(sqft ? `~${sqft.toFixed(1)}` : '—', {
        x: cols[2]!,
        y,
        size: 9.5,
        font,
        color: INK,
      });
      // Goal 15 D2: the logo is COMPOSITED onto the views (page 2), so this
      // column just flags WHICH zone carries it — no more clipped filename
      // overrunning into Notes (the Goal-14 bug).
      const hasLogo = logoZoneIds.has(panel.id);
      page.drawText(hasLogo ? 'Yes' : '—', {
        x: cols[3]!,
        y,
        size: 9.5,
        font: hasLogo ? bold : font,
        color: hasLogo ? INK : MUTED,
      });
      const note = data.brief.zoneNotes?.[panel.id];
      const noteLines = note
        ? wrapText(ctx.font, safe(note), 8.5, PAGE_W - MARGIN - cols[4]!)
        : ['—'];
      page.drawText(noteLines[0] ?? '—', { x: cols[4]!, y, size: 8.5, font, color: MUTED });
      for (let i = 1; i < Math.min(noteLines.length, 3); i++) {
        y -= 11;
        page.drawText(noteLines[i]!, { x: cols[4]!, y, size: 8.5, font, color: MUTED });
      }
      y -= 16;
      drawn += 1;
      if (y < 132) break; // single-page table budget; full zone list lives in the app
    }
    if (drawn < included.length) {
      page.drawText(`+ ${included.length - drawn} more zone(s) — full list in the app`, {
        x: MARGIN,
        y,
        size: 8.5,
        font,
        color: MUTED,
      });
      y -= 14;
    }
    y -= 4;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: PAGE_W - MARGIN, y },
      thickness: 0.5,
      color: LINE,
    });
    y -= 16;
    page.drawText(
      `Total material (incl. ${Math.round((WASTE_FACTOR - 1) * 100)}% waste allowance): ~${(totalSqFt * WASTE_FACTOR).toFixed(0)} sq ft`,
      { x: MARGIN, y, size: 10, font: bold, color: INK },
    );
    y -= 14;
    page.drawText(
      'Sizes are flat template estimates. The shop measures the vehicle before ordering film.',
      {
        x: MARGIN,
        y,
        size: 8.5,
        font,
        color: MUTED,
      },
    );
    y -= 11;
    page.drawText(
      'The Print Pack provides curvature-corrected, never-short panel sizes tiled to your printer.',
      {
        x: MARGIN,
        y,
        size: 8.5,
        font,
        color: MUTED,
      },
    );

    // Style & ideas (the AI/designer brief text).
    y -= 28;
    const style = [
      ...(data.brief.style?.presets ?? []),
      data.brief.style?.prompt,
      data.brief.aiNotes,
    ]
      .filter(Boolean)
      .join(' — ');
    if (style && y > 150) {
      page.drawText('Style & ideas', { x: MARGIN, y, size: 11, font: bold, color: INK });
      y -= 15;
      for (const line of wrapText(font, safe(style), 9.5, PAGE_W - 2 * MARGIN).slice(0, 6)) {
        page.drawText(line, { x: MARGIN, y, size: 9.5, font, color: INK });
        y -= 13;
      }
    }
  }

  // ---- Page 4 — Add-ons, photos, install notes, quote box --------------------
  {
    const { page, y: top } = newPage(ctx, 'Add-ons & install notes');
    let y = top;

    const tier = MATERIAL_TIERS.find((t) => t.id === data.brief.materials?.tier);
    page.drawText('Material', { x: MARGIN, y, size: 10, font: bold, color: MUTED });
    // Tier label only — the wizard's relative-cost glyphs ($..$$$$) stay OFF
    // the pack: nothing that reads like a price anchor (PRD §9.1 spirit).
    page.drawText(safe(tier ? tier.label : 'Shop to advise'), {
      x: MARGIN + 110,
      y,
      size: 10,
      font,
      color: INK,
    });
    y -= 18;

    // Tint with state-legality note (B2C-006 data).
    const tint = data.brief.tint;
    const tintEntries = Object.entries(tint?.perWindow ?? {}) as Array<[TintWindow, number]>;
    if (tintEntries.length > 0) {
      page.drawText('Window tint', { x: MARGIN, y, size: 10, font: bold, color: MUTED });
      for (const [w, vlt] of tintEntries) {
        const label = TINT_WINDOWS.find((t) => t.key === w)?.label ?? w;
        const verdict = tint?.state ? tintVerdict(tint.state, w, vlt) : null;
        const legality = verdict
          ? verdict.status === 'legal'
            ? `legal in ${tint!.state}`
            : verdict.status === 'close'
              ? `at the ${tint!.state} limit — installer confirms`
              : `NOT legal in ${tint!.state}`
          : 'state not chosen';
        page.drawText(safe(`${label}: ${vlt}% VLT (${legality})`), {
          x: MARGIN + 110,
          y,
          size: 10,
          font,
          color: verdict?.status === 'illegal' ? AMBER : INK,
        });
        y -= 15;
      }
      y -= 3;
    }

    const extras = [
      data.brief.extras?.chromeDelete && 'Chrome delete',
      data.brief.extras?.roofOnlyColorChange && 'Roof color change',
      data.brief.extras?.pinstripeAccent && 'Pinstripe / accents',
      data.brief.extras?.ppfZones && 'Paint protection film',
      data.brief.extras?.dotNumber && `DOT/MC: ${data.brief.extras.dotNumber}`,
    ].filter(Boolean) as string[];
    if (extras.length > 0) {
      page.drawText('Extras', { x: MARGIN, y, size: 10, font: bold, color: MUTED });
      page.drawText(safe(extras.join(' · ')), { x: MARGIN + 110, y, size: 10, font, color: INK });
      y -= 18;
    }

    // Customer's REAL vehicle (condition the shop should see).
    if (data.photos.length > 0) {
      y -= 8;
      page.drawText("Customer's vehicle (condition notes)", {
        x: MARGIN,
        y,
        size: 11,
        font: bold,
        color: INK,
      });
      y -= 12;
      const thumbW = (PAGE_W - 2 * MARGIN - 3 * 10) / 4;
      let x = MARGIN;
      let rowBottom = y;
      for (const photo of data.photos.slice(0, 4)) {
        try {
          const img = await doc.embedPng(photo.png);
          const scale = Math.min(thumbW / img.width, 90 / img.height);
          const w = img.width * scale;
          const h = img.height * scale;
          page.drawImage(img, { x, y: y - h, width: w, height: h });
          if (photo.note) {
            const noteLines = wrapText(font, safe(photo.note), 7.5, thumbW).slice(0, 3);
            let ny = y - h - 10;
            for (const line of noteLines) {
              page.drawText(line, { x, y: ny, size: 7.5, font, color: MUTED });
              ny -= 9;
            }
            rowBottom = Math.min(rowBottom, ny);
          } else {
            rowBottom = Math.min(rowBottom, y - h - 10);
          }
        } catch {
          /* skip bad image */
        }
        x += thumbW + 10;
      }
      y = rowBottom - 18;
    }

    // Blank shop-quote box — the WHOLE point: no Alpha Wolf pricing, ever.
    const boxH = Math.min(170, Math.max(120, y - 70));
    const boxY = 70;
    page.drawRectangle({
      x: MARGIN,
      y: boxY,
      width: PAGE_W - 2 * MARGIN,
      height: boxH,
      borderColor: INK,
      borderWidth: 1,
    });
    page.drawText('Shop quote (for the installing shop to complete)', {
      x: MARGIN + 12,
      y: boxY + boxH - 20,
      size: 10,
      font: bold,
      color: INK,
    });
    const lineYs = [boxY + boxH - 48, boxY + boxH - 76, boxY + boxH - 104];
    const labels = ['Line items:', 'Total:', 'Valid until:'];
    labels.forEach((label, i) => {
      const ly = lineYs[i];
      if (ly === undefined || ly < boxY + 10) return;
      page.drawText(label, { x: MARGIN + 12, y: ly, size: 9.5, font, color: MUTED });
      page.drawLine({
        start: { x: MARGIN + 80, y: ly - 2 },
        end: { x: PAGE_W - MARGIN - 12, y: ly - 2 },
        thickness: 0.5,
        color: LINE,
      });
    });
  }

  return doc.save();
}
