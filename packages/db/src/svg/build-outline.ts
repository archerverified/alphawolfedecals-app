// Outline-SVG builder (Goal 6 Template Studio).
//
// The inverse of validate.ts: panel data authored in the Studio (or by the
// AW panel-authoring script) is serialised into a spec-§3.4 outline SVG —
// view groups carrying their sheet placement as a transform, each panel a
// <g class="panel"> with .outline + .wrap-safe paths and the data-* fields the
// validator extracts. Every generated document is round-tripped through
// validateOutlineSvg before anything is stored or published, so this builder
// never needs to be trusted on its own.
//
// Provenance metadata is REQUIRED: the strategy doc's legal wall is enforced
// by every authored template carrying a human-readable statement of which
// owned source it traces to (mirrors the hand-written Transit seed metadata).

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]!);
}

export type OutlinePanelSpec = {
  name: string;
  /** View-local outline path `d` (the body line). */
  outlinePath: string;
  /** View-local wrap-safe path `d` (the printable-area clip). */
  wrapSafePath: string;
  finishHint?: string;
  installOrder?: number;
  notes?: string | null;
};

export type OutlineViewSpec = {
  view: string;
  /** Sheet placement of this view group (the Transit convention). */
  translate?: { x: number; y: number };
  panels: OutlinePanelSpec[];
  /** Optional decorative no-wrap region paths (glass, trim), view-local. */
  noWrapPaths?: string[];
};

export type BuildOutlineInput = {
  viewBox: { width: number; height: number };
  /** data-vehicle slug, e.g. "2024-bmw-x3" */
  vehicleSlug: string;
  /** REQUIRED provenance statement (license wall — see module header). */
  metadata: string;
  version?: number;
  views: OutlineViewSpec[];
};

function panelId(view: string, name: string): string {
  return `${view}-${name}`
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function buildOutlineSvg(input: BuildOutlineInput): string {
  if (!input.metadata.trim()) {
    throw new Error('[svg] buildOutlineSvg: provenance metadata is required');
  }
  if (input.views.length === 0) {
    throw new Error('[svg] buildOutlineSvg: at least one view is required');
  }

  const lines: string[] = [];
  lines.push('<svg xmlns="http://www.w3.org/2000/svg"');
  lines.push(`     viewBox="0 0 ${input.viewBox.width} ${input.viewBox.height}"`);
  lines.push(`     data-vehicle="${esc(input.vehicleSlug)}"`);
  lines.push(`     data-version="${input.version ?? 1}">`);
  lines.push(`  <metadata>${esc(input.metadata)}</metadata>`);

  // Auto-numbering continues past the highest EXPLICIT order so mixed
  // explicit/auto payloads cannot emit duplicate data-install-order values.
  let installSeq = Math.max(
    0,
    ...input.views.flatMap((v) => v.panels.map((p) => p.installOrder ?? 0)),
  );
  for (const view of input.views) {
    const t = view.translate ?? { x: 0, y: 0 };
    lines.push(
      `  <g id="view-${esc(view.view)}" data-view="${esc(view.view)}" transform="translate(${t.x},${t.y})">`,
    );
    for (const panel of view.panels) {
      const order = panel.installOrder ?? ++installSeq;
      const attrs = [
        `class="panel"`,
        `id="${esc(panelId(view.view, panel.name))}"`,
        `data-name="${esc(panel.name)}"`,
        `data-install-order="${order}"`,
        `data-finish-hint="${esc(panel.finishHint ?? 'gloss')}"`,
      ];
      if (panel.notes) attrs.push(`data-notes="${esc(panel.notes)}"`);
      lines.push(`    <g ${attrs.join(' ')}>`);
      lines.push(`      <path class="outline" d="${esc(panel.outlinePath)}" />`);
      lines.push(`      <path class="wrap-safe" d="${esc(panel.wrapSafePath)}" />`);
      lines.push('    </g>');
    }
    for (const noWrap of view.noWrapPaths ?? []) {
      lines.push(`    <path class="no-wrap" d="${esc(noWrap)}" />`);
    }
    lines.push('  </g>');
  }
  lines.push('</svg>');
  return lines.join('\n');
}
