// Magic-byte sniffing (PR #38 fixup): the declared MIME is client-controlled, so
// the worker confirms the file header before routing bytes to a converter.

import { describe, it, expect } from 'vitest';
import { classifyMime } from '../src/mime';
import { sniffSignature, bytesMatchKind } from '../src/sniff';

// Minimal valid headers for each format.
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0]);
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP')]);
const HEIC = Buffer.concat([
  Buffer.from([0, 0, 0, 0x18]),
  Buffer.from('ftypheic'),
  Buffer.alloc(8),
]);
const PDF = Buffer.from('%PDF-1.7\n%binary');
const EPS = Buffer.from('%!PS-Adobe-3.0 EPSF-3.0\n');
const SVG = Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>');
const SVG_BARE = Buffer.from('  <svg xmlns="http://www.w3.org/2000/svg"></svg>');
const HTML = Buffer.from('<!doctype html><html><body>hi</body></html>');

describe('sniffSignature', () => {
  it('detects each supported format from its header', () => {
    expect(sniffSignature(PNG)).toBe('png');
    expect(sniffSignature(JPEG)).toBe('jpeg');
    expect(sniffSignature(WEBP)).toBe('webp');
    expect(sniffSignature(HEIC)).toBe('heic');
    expect(sniffSignature(PDF)).toBe('pdf');
    expect(sniffSignature(EPS)).toBe('postscript');
    expect(sniffSignature(SVG)).toBe('svg');
    expect(sniffSignature(SVG_BARE)).toBe('svg');
  });

  it('returns null when it cannot identify the header', () => {
    expect(sniffSignature(Buffer.from('not a known format'))).toBeNull();
  });
});

describe('bytesMatchKind', () => {
  it('accepts headers that match the declared converter kind', () => {
    expect(bytesMatchKind(classifyMime('image/png'), PNG)).toBe(true);
    expect(bytesMatchKind(classifyMime('image/jpeg'), JPEG)).toBe(true);
    expect(bytesMatchKind(classifyMime('application/pdf'), PDF)).toBe(true);
    expect(bytesMatchKind(classifyMime('image/svg+xml'), SVG)).toBe(true);
    // Modern Illustrator files are PDF-compatible.
    expect(bytesMatchKind(classifyMime('application/illustrator'), PDF)).toBe(true);
    // Classic AI/EPS are PostScript.
    expect(bytesMatchKind(classifyMime('application/postscript'), EPS)).toBe(true);
  });

  it('rejects a file whose header contradicts the declared MIME', () => {
    // PNG bytes claimed as a PDF.
    expect(bytesMatchKind(classifyMime('application/pdf'), PNG)).toBe(false);
    // A PDF claimed as a raster image.
    expect(bytesMatchKind(classifyMime('image/png'), PDF)).toBe(false);
    // HTML masquerading as an SVG (the classic stored-XSS smuggle).
    expect(bytesMatchKind(classifyMime('image/svg+xml'), HTML)).toBe(false);
  });

  it('is lenient on a sniff miss (unknown header passes through)', () => {
    expect(bytesMatchKind(classifyMime('image/png'), Buffer.from('???'))).toBe(true);
  });
});
