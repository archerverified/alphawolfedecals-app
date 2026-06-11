// Unit tests for the vehicle outline SVG validator — one assertion (at least)
// per rule in docs/vehicle-database-spec.md §3.4, plus the real seed file.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { isValidPathData, validateOutlineSvg, type SvgValidationResult } from '../src/svg/validate';

// viewBox 4800x1200 (aspect 4.0); DIMS chosen so length×4/height×2 = 4.0 exactly.
const DIMS = { lengthMm: 5260, heightMm: 2630 };

function panel(view: string, opts: { outline?: boolean; wrapSafe?: boolean } = {}): string {
  const outline =
    opts.outline === false ? '' : '<path class="outline" d="M10 10 L100 10 L100 100 Z"/>';
  const wrap =
    opts.wrapSafe === false ? '' : '<path class="wrap-safe" d="M20 20 L90 20 L90 90 Z"/>';
  return `<g class="panel" id="p-${view}" data-name="${view} panel" data-install-order="2" data-finish-hint="satin">${outline}${wrap}</g>`;
}

function viewGroup(name: string, inner = panel(name)): string {
  return `<g id="view-${name}" data-view="${name}" transform="translate(0,0)">${inner}</g>`;
}

function buildSvg(
  views: string[] = ['front', 'driver', 'back', 'passenger'],
  viewBox = '0 0 4800 1200',
  extra = '',
): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">${views
    .map((v) => viewGroup(v))
    .join('')}${extra}</svg>`;
}

function expectFailRule(result: SvgValidationResult, rule: string): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.map((e) => e.rule)).toContain(rule);
  }
}

describe('validateOutlineSvg — happy path', () => {
  test('a conformant 4-view SVG passes and extracts panels + optimized markup', () => {
    const result = validateOutlineSvg(buildSvg(), DIMS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.panels).toHaveLength(4);
      expect(result.panels.map((p) => p.view).sort()).toEqual([
        'back',
        'driver',
        'front',
        'passenger',
      ]);
      expect(result.panels[0]?.finishHint).toBe('satin');
      expect(result.panels[0]?.installOrder).toBe(2);
      expect(result.optimizedSvg).toContain('<svg');
      expect(result.optimizedSvg).toContain('viewBox'); // rule 8: removeViewBox:false
      expect(result.viewBox).toEqual({ width: 4800, height: 1200 });
    }
  });

  test('an optional view-top is allowed', () => {
    const result = validateOutlineSvg(
      buildSvg(['front', 'driver', 'back', 'passenger', 'top']),
      DIMS,
    );
    expect(result.ok).toBe(true);
  });
});

describe('validateOutlineSvg — §3.4 rule rejections', () => {
  test('rule: not well-formed XML', () => {
    expectFailRule(validateOutlineSvg('<svg><g>', DIMS), 'parse');
  });

  test('rule 1: missing a required view group', () => {
    expectFailRule(validateOutlineSvg(buildSvg(['front', 'driver', 'passenger']), DIMS), 'views');
  });

  test('rule 1: duplicate view group', () => {
    expectFailRule(
      validateOutlineSvg(buildSvg(['front', 'front', 'driver', 'back', 'passenger']), DIMS),
      'views',
    );
  });

  test('rule 1: unknown view group', () => {
    expectFailRule(
      validateOutlineSvg(buildSvg(['front', 'driver', 'back', 'passenger', 'underside']), DIMS),
      'views',
    );
  });

  test('rule 2: a view with no panel', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4800 1200">${viewGroup('front', '')}${viewGroup('driver')}${viewGroup('back')}${viewGroup('passenger')}</svg>`;
    expectFailRule(validateOutlineSvg(svg, DIMS), 'panels');
  });

  test('rule 3: panel missing wrap-safe path', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4800 1200">${viewGroup('front', panel('front', { wrapSafe: false }))}${viewGroup('driver')}${viewGroup('back')}${viewGroup('passenger')}</svg>`;
    expectFailRule(validateOutlineSvg(svg, DIMS), 'panels');
  });

  test('rule 3: panel missing outline path', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4800 1200">${viewGroup('front', panel('front', { outline: false }))}${viewGroup('driver')}${viewGroup('back')}${viewGroup('passenger')}</svg>`;
    expectFailRule(validateOutlineSvg(svg, DIMS), 'panels');
  });

  test('rule 4: embedded image over 500KB', () => {
    const bigB64 = 'A'.repeat(700 * 1024); // ~525KB decoded
    const img = `<image href="data:image/png;base64,${bigB64}" />`;
    expectFailRule(validateOutlineSvg(buildSvg(undefined, '0 0 4800 1200', img), DIMS), 'image');
  });

  test('rule 4: a small embedded image is fine', () => {
    const img = `<image href="data:image/png;base64,${'A'.repeat(1024)}" />`;
    expect(validateOutlineSvg(buildSvg(undefined, '0 0 4800 1200', img), DIMS).ok).toBe(true);
  });

  test('rule 5: external use reference', () => {
    const use = '<use href="https://evil.example/x.svg#a" />';
    expectFailRule(validateOutlineSvg(buildSvg(undefined, '0 0 4800 1200', use), DIMS), 'use');
  });

  test('rule 5: internal use reference is fine', () => {
    const use = '<use href="#p-front" />';
    expect(validateOutlineSvg(buildSvg(undefined, '0 0 4800 1200', use), DIMS).ok).toBe(true);
  });

  test('rule 6: viewBox aspect ratio out of tolerance', () => {
    // viewBox aspect 8.0 vs expected 4.0 -> rejected.
    expectFailRule(validateOutlineSvg(buildSvg(undefined, '0 0 4800 600'), DIMS), 'viewBox');
  });

  test('rule 6: viewBox aspect within ±5% passes', () => {
    // 4800/1160 = 4.138 -> 3.4% off 4.0 -> within tolerance.
    expect(validateOutlineSvg(buildSvg(undefined, '0 0 4800 1160'), DIMS).ok).toBe(true);
  });

  test('rule 6: missing viewBox', () => {
    const svg = buildSvg().replace(' viewBox="0 0 4800 1200"', '');
    expectFailRule(validateOutlineSvg(svg, DIMS), 'viewBox');
  });

  test('rule 7: malformed path data', () => {
    const bad = `<g id="view-front" data-view="front"><g class="panel" id="p"><path class="outline" d="M10 banana L5"/><path class="wrap-safe" d="M1 1 L2 2 Z"/></g></g>`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4800 1200">${bad}${viewGroup('driver')}${viewGroup('back')}${viewGroup('passenger')}</svg>`;
    expectFailRule(validateOutlineSvg(svg, DIMS), 'path');
  });
});

describe('isValidPathData', () => {
  test.each([
    'M10 10 L100 10 L100 100 Z',
    'M10,10 L100,10 Z',
    'M0 0 C 10 10 20 20 30 30 Z',
    'M.5 .5 L1.5 1.5',
    'M10 20 30 40', // implicit lineto
    'M-3 -4 l5 5z',
  ])('valid: %s', (d) => {
    expect(isValidPathData(d)).toBe(true);
  });

  test.each([
    '',
    'L10 10', // must start with M
    'M10 banana',
    'M10', // moveto needs 2 args
    'hello world',
    'M10 10 Q 1 2 3', // quadratic needs multiples of 4
  ])('invalid: %s', (d) => {
    expect(isValidPathData(d)).toBe(false);
  });
});

// Goal 6 Template Studio: templates with fewer than the 4 standard views
// (vehicles.view_count 1..4) declare their exact view set.
describe('validateOutlineSvg — declared views (Goal 6)', () => {
  // 2-view boat sheet: aspect bears no relation to length×4/height×2.
  const BOAT_DIMS = { lengthMm: 11125, heightMm: 2400 };

  test('a 2-view sheet passes with views declared, aspect formula skipped', () => {
    const result = validateOutlineSvg(
      buildSvg(['driver', 'passenger'], '0 0 1920 1080'),
      BOAT_DIMS,
      {
        views: ['driver', 'passenger'],
      },
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.panels.map((p) => p.view).sort()).toEqual(['driver', 'passenger']);
    }
  });

  test('a declared view missing from the document fails', () => {
    expectFailRule(
      validateOutlineSvg(buildSvg(['driver'], '0 0 1920 1080'), BOAT_DIMS, {
        views: ['driver', 'passenger'],
      }),
      'views',
    );
  });

  test('an undeclared view group in the document fails (even "top")', () => {
    expectFailRule(
      validateOutlineSvg(buildSvg(['driver', 'passenger', 'top'], '0 0 1920 1080'), BOAT_DIMS, {
        views: ['driver', 'passenger'],
      }),
      'views',
    );
  });

  test('a declared view with no panels fails', () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080">${viewGroup(
      'driver',
    )}<g id="view-passenger" data-view="passenger"></g></svg>`;
    expectFailRule(
      validateOutlineSvg(svg, BOAT_DIMS, { views: ['driver', 'passenger'] }),
      'panels',
    );
  });

  test('declared views must be known view names', () => {
    expectFailRule(
      validateOutlineSvg(buildSvg(['driver'], '0 0 1920 1080'), BOAT_DIMS, { views: ['port'] }),
      'views',
    );
  });

  test('empty / duplicate declarations fail', () => {
    expectFailRule(validateOutlineSvg(buildSvg(['driver']), BOAT_DIMS, { views: [] }), 'views');
    expectFailRule(
      validateOutlineSvg(buildSvg(['driver']), BOAT_DIMS, { views: ['driver', 'driver'] }),
      'views',
    );
  });

  test('omitting the option keeps the original 4-view + aspect behavior', () => {
    // Same doc that passes with declared views fails the default contract.
    expectFailRule(
      validateOutlineSvg(buildSvg(['driver', 'passenger'], '0 0 1920 1080'), BOAT_DIMS),
      'views',
    );
  });
});

describe('real seed file', () => {
  test('the shipped Tier-1 Transit SVG passes validation', () => {
    const svg = readFileSync(
      join(__dirname, '../seeds/vehicles/2024-ford-transit-250-148-highroof.svg'),
      'utf8',
    );
    const result = validateOutlineSvg(svg, { lengthMm: 5531, heightMm: 2630 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      // front(1) + driver(2) + back(1) + passenger(2)
      expect(result.panels).toHaveLength(6);
    }
  });
});
