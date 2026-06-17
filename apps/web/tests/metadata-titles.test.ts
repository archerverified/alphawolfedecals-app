// Goal 17 D4 — guard the doubled-<title> fix. The root layout defines a title
// template ('%s — Alpha Wolf Wrap Studio'), so a page that ALSO bakes the brand
// into its own title renders it twice (e.g. 'Sign in — Alpha Wolf Wrap Studio —
// Alpha Wolf Wrap Studio'). Pages must set ONLY their page-specific title and let
// the template add the brand once. This source-guard stops a regression.

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const APP_DIR = join(__dirname, '..', 'app');
const BRAND_SUFFIX = '— Alpha Wolf Wrap Studio';

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsxFiles(p));
    else if (entry.name.endsWith('.tsx')) out.push(p);
  }
  return out;
}

describe('page metadata titles (Goal 17 D4 — no doubled brand)', () => {
  it('no page bakes the brand into its title: the layout template adds it exactly once', () => {
    const offenders: string[] = [];
    for (const file of tsxFiles(APP_DIR)) {
      if (file.endsWith('layout.tsx')) continue; // the template legitimately holds the brand
      for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (line.includes('title:') && line.includes(BRAND_SUFFIX)) {
          offenders.push(`${file.replace(APP_DIR, 'app')}: ${line.trim()}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
