import { describe, it, expect } from 'vitest';
import { classifyMime, isAllowedMime, sourceExtFor } from '../src/mime';
import { sanitizeSvg } from '../src/converters';
import { isQueueEnabled } from '../src/queue';

describe('mime classification', () => {
  it('routes each format to the right converter kind', () => {
    expect(classifyMime('image/svg+xml')).toBe('svg');
    expect(classifyMime('application/pdf')).toBe('vector-pdf');
    expect(classifyMime('application/postscript')).toBe('vector-ai');
    expect(classifyMime('application/illustrator')).toBe('vector-ai');
    expect(classifyMime('image/png')).toBe('raster');
    expect(classifyMime('image/jpeg')).toBe('raster');
    expect(classifyMime('image/heic')).toBe('raster');
    expect(classifyMime('text/plain')).toBe('unsupported');
  });

  it('is case-insensitive and tolerates content-type params', () => {
    expect(classifyMime('IMAGE/PNG; charset=binary')).toBe('raster');
    expect(classifyMime('Image/SVG+XML')).toBe('svg');
  });

  it('maps mime -> source extension for the CLI converters', () => {
    expect(sourceExtFor('application/pdf')).toBe('pdf');
    expect(sourceExtFor('application/postscript')).toBe('eps');
    expect(sourceExtFor('application/illustrator')).toBe('ai');
    expect(sourceExtFor('image/png')).toBe('png');
  });

  it('isAllowedMime gates the upload allowlist', () => {
    expect(isAllowedMime('image/png')).toBe(true);
    expect(isAllowedMime('application/pdf')).toBe(true);
    expect(isAllowedMime('text/plain')).toBe(false);
  });
});

describe('svg sanitisation', () => {
  it('strips script tags, event handlers and javascript: hrefs', () => {
    const dirty = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script>` +
        `<rect onclick="evil()" width="10" height="10"/>` +
        `<a href="javascript:bad()">x</a></svg>`,
    );
    const clean = sanitizeSvg(dirty).toString('utf8');
    expect(clean).not.toContain('<script');
    expect(clean).not.toContain('onclick');
    expect(clean).not.toContain('javascript:');
    expect(clean).toContain('<rect');
  });
});

describe('queue mode selection', () => {
  it('runs inline when REDIS_URL is unset', () => {
    const prev = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    expect(isQueueEnabled()).toBe(false);
    if (prev !== undefined) process.env.REDIS_URL = prev;
  });

  it('uses the queue when REDIS_URL is set', () => {
    const prev = process.env.REDIS_URL;
    process.env.REDIS_URL = 'rediss://example:6379';
    expect(isQueueEnabled()).toBe(true);
    if (prev === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = prev;
  });
});
