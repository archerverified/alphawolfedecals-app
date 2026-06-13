// Unit tests for the shop-locator maps fallback (Goal 9 / D3).

import { describe, expect, test } from 'vitest';

import { mapsSearchUrl } from '../lib/locator/directory';

describe('mapsSearchUrl', () => {
  test('builds a wrap-shop search for a city/zip query', () => {
    const url = mapsSearchUrl('Austin, TX');
    expect(url).toContain('https://www.google.com/maps/search/?api=1&query=');
    expect(url).toContain(encodeURIComponent('vehicle wrap shop Austin, TX'));
  });

  test('falls back to "near me" on an empty query', () => {
    expect(mapsSearchUrl('   ')).toContain(encodeURIComponent('vehicle wrap shop near me'));
  });

  test('URL-encodes the query (no injection of raw params)', () => {
    const url = mapsSearchUrl('a&b=c');
    expect(url).not.toContain('a&b=c');
    expect(url).toContain(encodeURIComponent('vehicle wrap shop a&b=c'));
  });
});
