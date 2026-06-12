// Vehicle outline SVG validator (GH-004). Enforces every rule in
// docs/vehicle-database-spec.md §3.4 and, on success, extracts the panel
// structure and returns the SVGO-optimised markup that gets stored.
//
// All-or-nothing per the spec ("rejects on any miss") and per the hard
// constraint "do not deploy a partial SVG validator". Runs fully in-process
// (svgson parse + a path-data grammar check + svgo) so it needs no Inkscape and
// no BullMQ round-trip. Pure parsing — safe to import anywhere server-side; the
// admin upload (apps/web) and the seed loader both call it so the two paths
// can't drift.

import { parseSync, type INode } from 'svgson';
import { optimize } from 'svgo';
import type { FinishHint } from '@prisma/client';

const REQUIRED_VIEWS = ['front', 'driver', 'back', 'passenger'] as const;
const OPTIONAL_VIEWS = ['top'] as const;
const KNOWN_VIEWS = [...REQUIRED_VIEWS, ...OPTIONAL_VIEWS];

const FINISH_HINTS: readonly FinishHint[] = [
  'gloss',
  'satin',
  'matte',
  'chrome',
  'carbon',
  'brushed',
  'none',
];

// §3.4: viewBox aspect ratio must be within this fraction of length×4 / height×2.
const ASPECT_TOLERANCE = 0.05;
// §3.4: reject embedded raster <image> heavier than this (decoded bytes). The
// GH-004 AC phrases it as "no embedded raster images >500KB".
const MAX_EMBEDDED_IMAGE_BYTES = 500 * 1024;
// 12mm inset is the spec's wrap-safe default (§6 step 4); stored with each panel.
const WRAP_SAFE_INSET_MM = 12;

export type SvgValidationError = { rule: string; message: string };

export type ExtractedPanel = {
  name: string;
  view: string;
  outlinePath: string;
  wrapSafePath: string;
  finishHint: FinishHint;
  installOrder: number;
  notes: string | null;
};

export type SvgValidationResult =
  | {
      ok: true;
      optimizedSvg: string;
      panels: ExtractedPanel[];
      viewBox: { width: number; height: number };
      warnings: string[];
    }
  | { ok: false; errors: SvgValidationError[] };

export type OutlineDims = { lengthMm: number; heightMm: number };

// Declared-views support (Goal 6 Template Studio). Templates with fewer than
// the 4 standard views (the AW catalogue: a 2-view boat, a 3-view coach —
// vehicles.view_count is CHECK-constrained 1..4) declare the exact view set
// their sheet carries. When `views` is provided:
//   * every declared view must be present with ≥1 panel, and no OTHER view
//     group may appear (including "top" unless declared) — the SVG and the
//     vehicle row can't drift apart;
//   * the §3.4 aspect-ratio formula is SKIPPED — it encodes the 4-across
//     reference sheet (length×4 / height×2) and is meaningless for other
//     layouts. Scale correctness for declared-view sheets is enforced by the
//     Studio's measurement calibration instead, not by aspect heuristics.
// Omitting `views` keeps the original behavior (4 required + optional top).
export type OutlineValidationOptions = { views?: readonly string[] };

// --- small AST helpers ------------------------------------------------------

function classesOf(node: INode): string[] {
  return (node.attributes.class ?? '').split(/\s+/).filter(Boolean);
}

function hasClass(node: INode, cls: string): boolean {
  return classesOf(node).includes(cls);
}

function href(node: INode): string | undefined {
  return node.attributes.href ?? node.attributes['xlink:href'];
}

function* walk(node: INode): Generator<INode> {
  for (const child of node.children) {
    yield child;
    yield* walk(child);
  }
}

function findAll(root: INode, predicate: (n: INode) => boolean): INode[] {
  const out: INode[] = [];
  for (const n of walk(root)) if (predicate(n)) out.push(n);
  return out;
}

// svgson does NOT decode XML entities in attribute values, so an authored
// name like "Bow &amp; Mid" would otherwise be stored verbatim. Decode the
// named + numeric entities on the free-text fields we extract (name, notes);
// path data and view names are charset-constrained and validated, so entities
// there fail their own rules.
const XML_ENTITY_DECODES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXmlEntities(value: string): string {
  return value.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (_, ent: string) => {
    if (ent[0] !== '#') return XML_ENTITY_DECODES[ent]!;
    const code =
      ent[1] === 'x' ? Number.parseInt(ent.slice(2), 16) : Number.parseInt(ent.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : `&${ent};`;
  });
}

// --- path-data grammar (rule 7) --------------------------------------------

const PATH_ARITY: Record<string, number> = {
  m: 2,
  l: 2,
  h: 1,
  v: 1,
  c: 6,
  s: 4,
  q: 4,
  t: 2,
  a: 7,
  z: 0,
};
const CMD_RE = /[MmLlHhVvCcSsQqTtAaZz]/;
// One token: a command letter, or a number (int/float/scientific, signed).
const TOKEN_RE = /[MmLlHhVvCcSsQqTtAaZz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g;

// True when `d` is a well-formed SVG path: starts with a moveto, uses only valid
// commands and number tokens, and supplies a correct (multiple-of-arity) number
// of parameters per command. Implicit repeated commands (e.g. "M x y x y") are
// accepted. Note: pathological arc-flag packing without delimiters (e.g.
// "a..01..") is not modelled — traced outlines from Illustrator/Inkscape always
// delimit, which is the input this validator guards.
export function isValidPathData(d: string | undefined): boolean {
  if (typeof d !== 'string') return false;
  const s = d.trim();
  if (!s) return false;
  if (!/^[Mm]/.test(s)) return false;
  if (/[^MmLlHhVvCcSsQqTtAaZz0-9eE.,+\-\s]/.test(s)) return false;

  const tokens = s.match(TOKEN_RE);
  if (!tokens) return false;

  let i = 0;
  let processedAny = false;
  while (i < tokens.length) {
    const token = tokens[i]!;
    if (!CMD_RE.test(token)) return false; // expected a command letter here
    i++;
    const arity = PATH_ARITY[token.toLowerCase()]!;
    let count = 0;
    while (i < tokens.length && !CMD_RE.test(tokens[i]!)) {
      i++;
      count++;
    }
    if (arity === 0) {
      if (count !== 0) return false;
    } else {
      if (count === 0 || count % arity !== 0) return false;
    }
    processedAny = true;
  }
  return processedAny;
}

// --- the validator ----------------------------------------------------------

function fail(errors: SvgValidationError[]): SvgValidationResult {
  return { ok: false, errors };
}

export function validateOutlineSvg(
  svgText: string,
  dims: OutlineDims,
  opts?: OutlineValidationOptions,
): SvgValidationResult {
  const errors: SvgValidationError[] = [];
  const warnings: string[] = [];

  // Resolve the view contract up front. Declared views are validated as
  // config: a bad declaration is a caller bug, reported as errors rather than
  // thrown so admin UIs surface it like any other validation miss.
  const declared = opts?.views;
  if (declared !== undefined) {
    if (declared.length === 0) {
      return fail([{ rule: 'views', message: 'Declared views list is empty.' }]);
    }
    const unknown = declared.filter(
      (v) => !KNOWN_VIEWS.includes(v as (typeof KNOWN_VIEWS)[number]),
    );
    if (unknown.length > 0) {
      return fail([{ rule: 'views', message: `Unknown declared view(s): ${unknown.join(', ')}.` }]);
    }
    if (new Set(declared).size !== declared.length) {
      return fail([{ rule: 'views', message: 'Declared views list has duplicates.' }]);
    }
  }
  const requiredViews: readonly string[] = declared ?? REQUIRED_VIEWS;
  // Views allowed to appear in the document: exactly the declared set, or the
  // default contract (4 required + optional top).
  const allowedViews: readonly string[] = declared ?? KNOWN_VIEWS;

  let root: INode;
  try {
    root = parseSync(svgText);
  } catch {
    return fail([{ rule: 'parse', message: 'SVG is not well-formed XML.' }]);
  }
  if (root.name !== 'svg') {
    return fail([{ rule: 'parse', message: `Root element must be <svg>, found <${root.name}>.` }]);
  }

  // Rule 6: viewBox present + aspect ratio within ±5% of length×4 / height×2.
  let viewBox = { width: 0, height: 0 };
  const vbRaw = root.attributes.viewBox;
  const vbParts = (vbRaw ?? '')
    .trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!vbRaw || vbParts.length !== 4 || vbParts.some((n) => !Number.isFinite(n))) {
    errors.push({ rule: 'viewBox', message: 'Missing or malformed viewBox (need 4 numbers).' });
  } else {
    const [, , w, h] = vbParts as [number, number, number, number];
    viewBox = { width: w, height: h };
    if (w <= 0 || h <= 0) {
      errors.push({ rule: 'viewBox', message: 'viewBox width/height must be positive.' });
    } else if (declared === undefined && dims.heightMm > 0 && dims.lengthMm > 0) {
      const actual = w / h;
      const expected = (dims.lengthMm * 4) / (dims.heightMm * 2);
      const drift = Math.abs(actual - expected) / expected;
      if (drift > ASPECT_TOLERANCE) {
        errors.push({
          rule: 'viewBox',
          message: `viewBox aspect ${actual.toFixed(3)} is ${(drift * 100).toFixed(1)}% off the expected ${expected.toFixed(3)} (length×4 / height×2); must be within ±5%.`,
        });
      }
    }
  }

  // Rule 1: the 4 required view groups present (each once), top optional, no
  // unknown view groups.
  const viewGroups = findAll(
    root,
    (n) => n.name === 'g' && (/^view-/.test(n.attributes.id ?? '') || !!n.attributes['data-view']),
  );
  const viewByName = new Map<string, INode>();
  for (const g of viewGroups) {
    const name = g.attributes['data-view'] ?? (g.attributes.id ?? '').replace(/^view-/, '');
    if (!allowedViews.includes(name)) {
      errors.push({ rule: 'views', message: `Unknown view group "${name}".` });
      continue;
    }
    if (viewByName.has(name)) {
      errors.push({ rule: 'views', message: `Duplicate view group "${name}".` });
      continue;
    }
    viewByName.set(name, g);
  }
  for (const required of requiredViews) {
    if (!viewByName.has(required)) {
      errors.push({ rule: 'views', message: `Missing required view group "view-${required}".` });
    }
  }

  // Rules 2 + 3 (and panel extraction): each view has ≥1 g.panel; each panel has
  // both an .outline and a .wrap-safe path.
  const panels: ExtractedPanel[] = [];
  let installSeq = 0;
  for (const view of allowedViews) {
    const group = viewByName.get(view);
    if (!group) continue;
    const panelGroups = findAll(group, (n) => n.name === 'g' && hasClass(n, 'panel'));
    if (requiredViews.includes(view) && panelGroups.length === 0) {
      errors.push({ rule: 'panels', message: `View "${view}" has no <g class="panel">.` });
    }
    for (const panel of panelGroups) {
      const outline = findAll(panel, (n) => n.name === 'path' && hasClass(n, 'outline'))[0];
      const wrapSafe = findAll(panel, (n) => n.name === 'path' && hasClass(n, 'wrap-safe'))[0];
      const label = decodeXmlEntities(
        panel.attributes['data-name'] ?? panel.attributes.id ?? `${view} panel`,
      );
      if (!outline) {
        errors.push({ rule: 'panels', message: `Panel "${label}" is missing its .outline path.` });
      }
      if (!wrapSafe) {
        errors.push({
          rule: 'panels',
          message: `Panel "${label}" is missing its .wrap-safe path.`,
        });
      }
      const finishRaw = panel.attributes['data-finish-hint'];
      const finishHint: FinishHint = FINISH_HINTS.includes(finishRaw as FinishHint)
        ? (finishRaw as FinishHint)
        : 'none';
      const installRaw = Number.parseInt(panel.attributes['data-install-order'] ?? '', 10);
      panels.push({
        name: label,
        view,
        outlinePath: outline?.attributes.d ?? '',
        wrapSafePath: wrapSafe?.attributes.d ?? '',
        finishHint,
        installOrder: Number.isFinite(installRaw) ? installRaw : ++installSeq,
        notes:
          panel.attributes['data-notes'] != null
            ? decodeXmlEntities(panel.attributes['data-notes'])
            : null,
      });
    }
  }

  // Rule 5: no external <use href="..."> (anything not a local "#id" fragment).
  for (const use of findAll(root, (n) => n.name === 'use')) {
    const ref = href(use);
    if (ref && !ref.startsWith('#')) {
      errors.push({ rule: 'use', message: `External <use href="${ref}"> is not allowed.` });
    }
  }

  // Rule 4: no embedded raster <image> over 500KB (decoded bytes).
  for (const img of findAll(root, (n) => n.name === 'image')) {
    const ref = href(img);
    if (ref && ref.startsWith('data:')) {
      const comma = ref.indexOf(',');
      const b64 = comma >= 0 ? ref.slice(comma + 1) : '';
      const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
      const bytes = Math.max(0, Math.floor((b64.length * 3) / 4) - padding);
      if (bytes > MAX_EMBEDDED_IMAGE_BYTES) {
        errors.push({
          rule: 'image',
          message: `Embedded image is ${(bytes / 1024).toFixed(0)}KB; max is 500KB.`,
        });
      }
    }
  }

  // Rule 7: every path's `d` parses.
  for (const path of findAll(root, (n) => n.name === 'path')) {
    if (!isValidPathData(path.attributes.d)) {
      const cls = path.attributes.class ? ` (class="${path.attributes.class}")` : '';
      errors.push({ rule: 'path', message: `Malformed path data${cls}.` });
    }
  }

  if (errors.length > 0) return fail(errors);

  // Rule 8: SVGO before storage, with the exact overrides the spec mandates.
  let optimizedSvg: string;
  try {
    const result = optimize(svgText, {
      multipass: true,
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              removeViewBox: false,
              removeMetadata: false,
              cleanupIds: false,
            },
          },
        },
      ],
    });
    optimizedSvg = result.data;
  } catch (err) {
    return fail([{ rule: 'svgo', message: `SVGO optimisation failed: ${(err as Error).message}` }]);
  }

  return { ok: true, optimizedSvg, panels, viewBox, warnings };
}

// Convenience: build the vehicle_panels wrap_safe_zone JSON the repo stores.
export function wrapSafeZoneFor(panel: ExtractedPanel): { clip_path: string; inset_mm: number } {
  return { clip_path: panel.wrapSafePath, inset_mm: WRAP_SAFE_INSET_MM };
}
