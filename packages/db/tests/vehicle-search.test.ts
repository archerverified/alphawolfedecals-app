// Unit tests for the pure vehicle search / facet / where builders. No DB.

import { describe, expect, test } from 'vitest';
import { buildPublishedWhere, buildVehicleSearchSql, summariseFacets } from '../src/repos/vehicles';

describe('buildPublishedWhere', () => {
  test('always pins status=published', () => {
    expect(buildPublishedWhere({})).toEqual({ status: 'published' });
  });

  test('adds each provided cascade level', () => {
    expect(buildPublishedWhere({ year: 2024, make: 'Ford', model: 'F-150' })).toEqual({
      status: 'published',
      year: 2024,
      make: 'Ford',
      model: 'F-150',
    });
  });

  test('trim is tri-state: null means base trim, undefined means any', () => {
    expect(buildPublishedWhere({ trim: null })).toEqual({ status: 'published', trim: null });
    expect(buildPublishedWhere({})).not.toHaveProperty('trim');
  });

  test('includes body-type facets when present', () => {
    expect(
      buildPublishedWhere({ bodyType: 'pickup', cabSize: 'crew', bedSize: 'standard' }),
    ).toEqual({ status: 'published', bodyType: 'pickup', cabSize: 'crew', bedSize: 'standard' });
  });
});

describe('buildVehicleSearchSql', () => {
  test('returns null for a blank query', () => {
    expect(buildVehicleSearchSql('')).toBeNull();
    expect(buildVehicleSearchSql('   ')).toBeNull();
  });

  test('pins published, uses the trigram operator, and ANDs per-term ILIKEs', () => {
    const sql = buildVehicleSearchSql('transit 250')!;
    expect(sql).toContain("status = 'published'");
    expect(sql).toContain('%'); // pg_trgm similarity operator
    expect(sql).toContain('similarity(');
    expect(sql).toContain("ILIKE '%transit%'");
    expect(sql).toContain("ILIKE '%250%'");
  });

  test('escapes single quotes (SQL-injection guard via pgQuoteLiteral)', () => {
    // A naive build would close the string literal early; pgQuoteLiteral doubles
    // the quote so the value stays a single literal.
    const sql = buildVehicleSearchSql("O'Neil")!;
    expect(sql).toContain("'O''Neil'");
    expect(sql).not.toContain("'O'Neil'");
  });

  test('clamps the limit', () => {
    expect(buildVehicleSearchSql('x', 99999)).toContain('LIMIT 200');
    expect(buildVehicleSearchSql('x', -5)).toContain('LIMIT 1');
  });
});

describe('summariseFacets', () => {
  test('returns distinct, sorted, null-free facet values', () => {
    const facets = summariseFacets([
      { bodyType: 'pickup', cabSize: 'crew', bedSize: 'standard', roofHeight: null },
      { bodyType: 'pickup', cabSize: 'regular', bedSize: 'standard', roofHeight: null },
      { bodyType: 'pickup', cabSize: 'crew', bedSize: 'long', roofHeight: null },
    ]);
    expect(facets.bodyTypes).toEqual(['pickup']);
    expect(facets.cabSizes).toEqual(['crew', 'regular']);
    expect(facets.bedSizes).toEqual(['long', 'standard']);
    expect(facets.roofHeights).toEqual([]);
  });

  test('surfaces van roof heights', () => {
    const facets = summariseFacets([
      { bodyType: 'van', cabSize: null, bedSize: null, roofHeight: 'high' },
      { bodyType: 'van', cabSize: null, bedSize: null, roofHeight: 'mid' },
    ]);
    expect(facets.roofHeights).toEqual(['high', 'mid']);
    expect(facets.cabSizes).toEqual([]);
  });
});
