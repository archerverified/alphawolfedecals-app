// Hardened SVG sanitiser cases (PR #38 fixup). Covers the vectors the original
// regex missed: <style> (with @import), data: URIs in href, namespaced event
// handlers — while leaving benign geometry untouched.

import { describe, it, expect } from 'vitest';
import { sanitizeSvg } from '../src/converters';

const wrap = (inner: string) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${inner}</svg>`);
const clean = (inner: string) => sanitizeSvg(wrap(inner)).toString('utf8');

describe('sanitizeSvg hardening', () => {
  it('removes <script> elements', () => {
    const out = clean('<script>alert(1)</script><rect width="10" height="10"/>');
    expect(out).not.toContain('<script');
    expect(out).not.toContain('alert(1)');
    expect(out).toContain('<rect');
  });

  it('removes <style> elements (including @import)', () => {
    const out = clean('<style>@import url(http://evil.com/x.css);</style><rect/>');
    expect(out).not.toContain('<style');
    expect(out).not.toContain('@import');
    expect(out).not.toContain('evil.com');
  });

  it('strips data: URIs in image href (or drops the element)', () => {
    const out = clean('<image href="data:text/html,<script>alert(1)</script>"/>');
    expect(out).not.toContain('data:text/html');
    expect(out).not.toContain('<script');
  });

  it('strips namespaced event handlers like xlink:onclick', () => {
    const out = clean('<a xlink:onclick="steal()"><rect/></a>');
    expect(out).not.toContain('onclick');
    expect(out).not.toContain('steal()');
  });

  it('also strips javascript: hrefs and on* handlers (regression)', () => {
    const out = clean('<a href="javascript:bad()">x</a><rect onclick="evil()"/>');
    expect(out).not.toContain('javascript:');
    expect(out).not.toContain('onclick');
  });

  it('leaves benign geometry untouched', () => {
    const benign = '<path d="M0 0 L10 10 Z" fill="#3366ff"/>';
    expect(clean(benign)).toContain(benign);
  });

  // Goal 17: a logo is frequently a raster (PNG/JPEG) wrapped in an SVG via a
  // data: URI (e.g. exported from Figma/Illustrator). The old blanket data:-strip
  // erased the artwork → an invisible logo in the export. Safe rasters must survive
  // while text/html, svg+xml, and script schemes stay blocked.
  it('PRESERVES a safe embedded raster (data:image/png) so logo artwork is not erased', () => {
    const out = clean('<image xlink:href="data:image/png;base64,iVBORw0KGgoAAAANS"/>');
    expect(out).toContain('data:image/png;base64,iVBORw0KGgoAAAANS');
  });

  it('PRESERVES data:image/jpeg too', () => {
    expect(clean('<image href="data:image/jpeg;base64,/9j/4AAQ"/>')).toContain(
      'data:image/jpeg;base64,/9j/4AAQ',
    );
  });

  it('still strips data:image/svg+xml (a nested SVG can re-introduce active content)', () => {
    const out = clean('<image href="data:image/svg+xml,%3Csvg onload=alert(1)%3E"/>');
    expect(out).not.toContain('data:image/svg+xml');
  });
});
