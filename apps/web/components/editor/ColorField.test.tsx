// ColorField hex-parsing + render smoke test (Goal 3a PR3).
//
// The interactive paths (preset grid, OS picker, hex field) all funnel through
// `parseHexInput`, so we test that pure helper exhaustively and keep a single
// render assertion for the closed-state trigger label. Driving the Radix popover
// open in jsdom is flaky and adds no real coverage over the unit cases.

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ColorField, parseHexInput } from './ColorField';

describe('parseHexInput', () => {
  it('accepts a 6-digit hex and lowercases it', () => {
    expect(parseHexInput('#FF8800', false)).toEqual({ ok: true, value: '#ff8800' });
  });

  it('accepts a 3-digit shorthand hex', () => {
    expect(parseHexInput('#abc', false)).toEqual({ ok: true, value: '#abc' });
  });

  it('trims surrounding whitespace', () => {
    expect(parseHexInput('  #123456 ', false)).toEqual({ ok: true, value: '#123456' });
  });

  it('rejects a malformed value', () => {
    expect(parseHexInput('not-a-color', false)).toEqual({ ok: false });
    expect(parseHexInput('#12', false)).toEqual({ ok: false });
    expect(parseHexInput('123456', false)).toEqual({ ok: false }); // missing #
  });

  it('treats blank as null only when allowNone', () => {
    expect(parseHexInput('', true)).toEqual({ ok: true, value: null });
    expect(parseHexInput('   ', true)).toEqual({ ok: true, value: null });
    expect(parseHexInput('', false)).toEqual({ ok: false });
  });
});

describe('ColorField trigger', () => {
  it('shows the hex value when set', () => {
    render(<ColorField label="Fill" value="#3b82f6" onCommit={() => {}} />);
    expect(screen.getByText('#3b82f6')).toBeTruthy();
  });

  it('shows "None" when value is null', () => {
    render(<ColorField label="Stroke" value={null} allowNone onCommit={() => {}} />);
    expect(screen.getByText('None')).toBeTruthy();
  });
});
