// Print Pack PDF builder (Goal 22 / D3). Renders a PrintPlan into a print-ready
// PDF a shop can drop in:
//   * Page 1: the panel-layout sheet: printer + media, a per-panel tile table,
//     job totals (linear feet, media area), and a prominent never-short +
//     confidence banner when any dimension is an estimate.
//   * Pages 2..N: one schematic per panel, tiles drawn to scale with their
//     exact physical width x length, the lapped overlap marked, and the flat ->
//     true -> safe dims + curvature confidence. Optional per-view art is placed as
//     a labelled reference preview.
//
// pdf-lib only (no new dep). Standard WinAnsi fonts, so all drawn text is
// sanitised to ASCII first (the pack must render against any input).

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from 'pdf-lib';
import type { PrintPlan, PrintPlanPanel } from './print-pack';

const PAGE_W = 612; // US Letter, points
const PAGE_H = 792;
const MARGIN = 54;
const INK = rgb(0.09, 0.09, 0.1);
const MUTED = rgb(0.45, 0.46, 0.48);
const LINE = rgb(0.82, 0.83, 0.84);
const AMBER = rgb(0.7, 0.4, 0.05);
const AMBER_BG = rgb(0.99, 0.96, 0.9);
const TILE_FILL = rgb(0.93, 0.95, 0.98);
const OVERLAP_FILL = rgb(0.85, 0.78, 0.6);
const CYAN = rgb(0, 0.682, 0.937); // Alpha Wolf #00AEEF

export interface PrintPackMeta {
  projectName: string;
  vehicleLabel: string;
  generatedAtIso: string;
  /** Optional per-view design art (PNG/JPEG) placed as a reference preview. */
  artByView?: Map<string, { bytes: Uint8Array; kind: 'png' | 'jpg' }>;
}

// Map common typographic chars to ASCII, then strip anything else WinAnsi can't
// encode, so a stray emoji or smart quote never blows up rendering.
function asc(text: string): string {
  return text
    .replace(/[—–]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[^\x20-\x7e]/g, '');
}

const VIEW_LABELS: Record<string, string> = {
  front: 'Front',
  driver: 'Driver side',
  back: 'Rear',
  passenger: 'Passenger side',
  top: 'Roof',
};
const viewLabel = (v: string): string => VIEW_LABELS[v] ?? v;

const round1 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1);

const CONFIDENCE_LABEL: Record<string, string> = {
  measured_in_shop: 'Measured',
  calibrated_sibling: 'Calibrated',
  class_prior: 'Estimated',
  unknown: 'UNMEASURED',
};

interface Ctx {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
}

function text(
  page: PDFPage,
  font: PDFFont,
  s: string,
  x: number,
  y: number,
  size: number,
  color = INK,
): void {
  page.drawText(asc(s), { x, y, size, font, color });
}

function drawSummaryPage(ctx: Ctx, plan: PrintPlan, meta: PrintPackMeta): void {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  page.drawRectangle({ x: 0, y: PAGE_H - 6, width: PAGE_W, height: 6, color: CYAN });

  text(page, ctx.bold, 'Alpha Wolf Print Pack', MARGIN, y, 20);
  y -= 22;
  text(page, ctx.font, `${meta.projectName}  -  ${meta.vehicleLabel}`, MARGIN, y, 11, MUTED);
  y -= 14;
  const date = asc(meta.generatedAtIso.slice(0, 10));
  text(page, ctx.font, `Generated ${date}`, MARGIN, y, 9, MUTED);
  y -= 24;

  // Printer + media block.
  const eff = round1(plan.printer.effectiveWidthIn);
  text(page, ctx.bold, 'Printer / media', MARGIN, y, 11);
  y -= 14;
  const printerLines = [
    `Printer: ${plan.printer.label ?? plan.printer.key ?? 'manual'}`,
    `Effective print width: ${eff} in  (nominal ${round1(plan.printer.nominalWidthIn)} in)`,
    `Panel overlap: ${round1(plan.printer.overlapIn)} in   Bleed: ${round1(plan.printer.bleedIn)} in`,
  ];
  for (const l of printerLines) {
    text(page, ctx.font, l, MARGIN, y, 10);
    y -= 13;
  }
  y -= 8;

  // Never-short + confidence banner.
  if (plan.estimated || plan.needsMeasurement) {
    const bannerH = plan.needsMeasurement ? 46 : 34;
    page.drawRectangle({
      x: MARGIN,
      y: y - bannerH,
      width: PAGE_W - 2 * MARGIN,
      height: bannerH,
      color: AMBER_BG,
      borderColor: AMBER,
      borderWidth: 1,
    });
    text(page, ctx.bold, 'Dimensions include some ESTIMATES.', MARGIN + 8, y - 14, 10, AMBER);
    text(
      page,
      ctx.font,
      'Never short: every size is curvature-corrected + safety-margined + bleed.',
      MARGIN + 8,
      y - 26,
      9,
      INK,
    );
    if (plan.needsMeasurement) {
      text(
        page,
        ctx.bold,
        'Some panels are UNMEASURED. Measure them on the real vehicle before printing.',
        MARGIN + 8,
        y - 38,
        9,
        AMBER,
      );
    }
    y -= bannerH + 12;
  }

  // Panel table.
  text(page, ctx.bold, 'Panels', MARGIN, y, 11);
  y -= 16;
  const cols = [MARGIN, MARGIN + 150, MARGIN + 232, MARGIN + 330, MARGIN + 380, MARGIN + 452];
  const header = ['Panel', 'View', 'True (in)', 'Tiles', 'Lin ft', 'Confidence'];
  header.forEach((h, i) => text(page, ctx.bold, h, cols[i]!, y, 8.5, MUTED));
  y -= 4;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, color: LINE });
  y -= 12;

  for (const p of plan.panels) {
    if (y < MARGIN + 90) break; // summary stays on one page; details follow per-panel
    const trueDim = `${round1(p.trueWidthIn)} x ${round1(p.trueHeightIn)}`;
    const conf = CONFIDENCE_LABEL[p.source] ?? p.source;
    const row = [
      p.name,
      viewLabel(p.view),
      trueDim,
      String(p.paneled.tiles.length),
      round1(p.paneled.linearFeet),
      conf,
    ];
    row.forEach((cell, i) => {
      const color = i === 5 && p.source === 'unknown' ? AMBER : INK;
      text(page, ctx.font, cell, cols[i]!, y, 9, color);
    });
    y -= 13;
  }

  y -= 6;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, color: LINE });
  y -= 16;
  text(page, ctx.bold, 'Totals', MARGIN, y, 10);
  y -= 14;
  text(
    page,
    ctx.font,
    `Panels: ${plan.panels.length}   Total media: ${round1(plan.totalLinearFeet)} linear ft  (~${round1(plan.totalMediaAreaSqFt)} sq ft incl. overlap + bleed)`,
    MARGIN,
    y,
    10,
  );
  y -= 16;

  if (plan.skipped.length > 0) {
    text(
      page,
      ctx.font,
      `Skipped (no usable dimensions, measure manually): ${plan.skipped.map((s) => s.name).join(', ')}`,
      MARGIN,
      y,
      8.5,
      AMBER,
    );
    y -= 14;
  }

  text(
    page,
    ctx.font,
    `Tiled to the EFFECTIVE printable width (${eff} in), never the nominal media. Seams fall on body breaks; interior seams overlap ${round1(plan.printer.overlapIn)} in.`,
    MARGIN,
    MARGIN,
    8,
    MUTED,
  );
}

async function embedArt(
  doc: PDFDocument,
  art: { bytes: Uint8Array; kind: 'png' | 'jpg' },
): Promise<PDFImage | null> {
  try {
    return art.kind === 'png' ? await doc.embedPng(art.bytes) : await doc.embedJpg(art.bytes);
  } catch {
    return null; // unreadable bytes -> no preview, never throw
  }
}

async function drawPanelPage(ctx: Ctx, p: PrintPlanPanel, meta: PrintPackMeta): Promise<void> {
  const page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  text(page, ctx.bold, `${p.name}`, MARGIN, y, 16);
  text(page, ctx.font, viewLabel(p.view), PAGE_W - MARGIN - 90, y, 11, MUTED);
  y -= 22;

  const conf = CONFIDENCE_LABEL[p.source] ?? p.source;
  text(page, ctx.bold, `Confidence: ${conf}`, MARGIN, y, 10, p.source === 'unknown' ? AMBER : INK);
  y -= 14;
  if (p.warning) {
    for (const line of wrap(ctx.font, p.warning, 9, PAGE_W - 2 * MARGIN)) {
      text(page, ctx.font, line, MARGIN, y, 9, AMBER);
      y -= 11;
    }
  }
  y -= 6;

  // Dimension block.
  const dimLines = [
    `Flat (template):   ${round1(p.flatWidthIn)} x ${round1(p.flatHeightIn)} in`,
    `True (curvature x${round1(p.curvatureK)}): ${round1(p.trueWidthIn)} x ${round1(p.trueHeightIn)} in`,
    `Safe cut (+${Math.round(p.curvatureMargin * 100)}% margin): ${round1(p.safeWidthIn)} x ${round1(p.safeHeightIn)} in`,
    `Tiles: ${p.paneled.tiles.length}   Linear feet: ${round1(p.paneled.linearFeet)}`,
  ];
  for (const l of dimLines) {
    text(page, ctx.font, l, MARGIN, y, 10);
    y -= 13;
  }
  y -= 8;

  // Tile schematic. The panel rectangle is acrossExtent (horizontal) x
  // feedExtent (vertical, runs down the roll). Scale to fit the content box.
  const across = p.paneled.acrossExtentIn;
  const feed = p.paneled.feedExtentIn;
  const boxTop = y;
  const boxMaxW = PAGE_W - 2 * MARGIN;
  const boxMaxH = boxTop - (MARGIN + 60);
  if (across > 0 && feed > 0 && boxMaxH > 40) {
    const scale = Math.min(boxMaxW / across, boxMaxH / feed);
    const w = across * scale;
    const h = feed * scale;
    const x0 = MARGIN;
    const yTop = boxTop;
    const yBot = boxTop - h;

    for (const t of p.paneled.tiles) {
      const tx = x0 + t.acrossStartIn * scale;
      const tw = t.widthIn * scale;
      page.drawRectangle({
        x: tx,
        y: yBot,
        width: tw,
        height: h,
        color: TILE_FILL,
        borderColor: INK,
        borderWidth: 0.75,
      });
      // Mark the lapped overlap shared with the previous tile.
      if (t.overlapPrevIn > 0) {
        page.drawRectangle({
          x: tx,
          y: yBot,
          width: t.overlapPrevIn * scale,
          height: h,
          color: OVERLAP_FILL,
        });
      }
      const cx = tx + tw / 2 - 26;
      text(page, ctx.bold, `#${t.index}`, cx, yBot + h / 2 + 6, 9);
      text(
        page,
        ctx.font,
        `${round1(t.widthIn)} x ${round1(t.lengthIn)}`,
        cx - 8,
        yBot + h / 2 - 6,
        8,
      );
    }
    // Overall dimension labels.
    text(page, ctx.font, `${round1(across)} in across (incl. bleed)`, x0, yTop + 4, 8, MUTED);
    text(page, ctx.font, `${round1(feed)} in feed`, x0 + w + 4, yBot + h / 2, 8, MUTED);

    // Optional reference art preview to the right of / below the schematic.
    const art = meta.artByView?.get(p.view);
    if (art) {
      const img = await embedArt(ctx.doc, art);
      if (img) {
        const previewW = 90;
        const ratio = img.height / img.width;
        const previewH = Math.min(previewW * ratio, 90);
        page.drawImage(img, {
          x: PAGE_W - MARGIN - previewW,
          y: MARGIN + 14,
          width: previewW,
          height: previewH,
        });
        text(page, ctx.font, 'reference preview', PAGE_W - MARGIN - previewW, MARGIN + 2, 7, MUTED);
      }
    }
  }
}

function wrap(font: PDFFont, s: string, size: number, maxWidth: number): string[] {
  const words = asc(s).split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let line = '';
  for (const w of words) {
    const cand = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(cand, size) <= maxWidth) line = cand;
    else {
      if (line) out.push(line);
      line = w;
    }
  }
  if (line) out.push(line);
  return out;
}

export async function buildPrintPackPdf(plan: PrintPlan, meta: PrintPackMeta): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle('Alpha Wolf Print Pack');
  doc.setCreator('Alpha Wolf Wrap Studio');
  doc.setSubject(`Print pack for ${asc(meta.projectName)}`);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const ctx: Ctx = { doc, font, bold };

  drawSummaryPage(ctx, plan, meta);
  for (const p of plan.panels) {
    await drawPanelPage(ctx, p, meta);
  }

  return doc.save();
}
