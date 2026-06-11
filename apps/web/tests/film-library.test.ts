// Film SKU starter library invariants (Goal 5 / B2C-005). The data is factual
// manufacturer color identifiers — these tests pin the SHAPE so a bad edit
// can't ship a swatch the export pack would print wrong.

import { describe, expect, it } from 'vitest';
import { FILM_LIBRARY, searchFilmLibrary } from '../lib/brief/film-library';

describe('FILM_LIBRARY', () => {
  it('every entry has a valid hex, a brand-prefixed sku, and a finish', () => {
    for (const c of FILM_LIBRARY) {
      expect(c.hex, c.sku).toMatch(/^#[0-9a-f]{6}$/);
      expect(c.sku).toMatch(/^(2080-|SW900-)/);
      expect(c.name.length).toBeGreaterThan(2);
      expect(c.finish.length).toBeGreaterThan(2);
    }
  });

  it('skus are unique', () => {
    const skus = FILM_LIBRARY.map((c) => c.sku);
    expect(new Set(skus).size).toBe(skus.length);
  });

  it('covers both brands with a meaningful starter set', () => {
    const m3 = FILM_LIBRARY.filter((c) => c.brand === '3M').length;
    const avery = FILM_LIBRARY.filter((c) => c.brand === 'Avery Dennison').length;
    expect(m3).toBeGreaterThanOrEqual(30);
    expect(avery).toBeGreaterThanOrEqual(30);
  });

  it('search matches name, sku fragment, and finish, case-insensitively', () => {
    expect(searchFilmLibrary('hot rod').map((c) => c.sku)).toContain('2080-G13');
    expect(searchFilmLibrary('g12').map((c) => c.sku)).toContain('2080-G12');
    expect(searchFilmLibrary('SATIN BLACK').length).toBeGreaterThanOrEqual(2); // both brands
    expect(searchFilmLibrary('zzz-no-such')).toHaveLength(0);
    expect(searchFilmLibrary('').length).toBeGreaterThan(0); // empty → first page
  });
});
