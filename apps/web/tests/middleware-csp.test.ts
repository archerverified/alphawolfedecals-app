import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';

// Goal 20 D4 (finding F1): the PostHog browser SDK loads remote config from
// https://us-assets.i.posthog.com (config.js, a SCRIPT) and feature flags from
// https://us.posthog.com — neither was in the CSP allowlist, so config + flags
// silently failed on every page. This pins the fix AND guards the locked
// security headers (ADR-0014 §9: the headers must never be dropped and the CSP
// must not be weakened).

function cspDirective(csp: string, name: string): string {
  return (
    csp
      .split(';')
      .map((d) => d.trim())
      .find((d) => d.startsWith(`${name} `) || d === name) ?? ''
  );
}

async function cspFor(path: string): Promise<string> {
  const res = await middleware(new NextRequest(`https://app.example.com${path}`));
  return res.headers.get('content-security-policy') ?? '';
}

describe('CSP PostHog allowlist (F1)', () => {
  it('allows the PostHog asset host in script-src (config.js loads)', async () => {
    const csp = await cspFor('/');
    expect(cspDirective(csp, 'script-src')).toContain('https://us-assets.i.posthog.com');
  });

  it('allows the PostHog asset + flags hosts in connect-src (remote config + flags load)', async () => {
    const connect = cspDirective(await cspFor('/'), 'connect-src');
    expect(connect).toContain('https://us-assets.i.posthog.com');
    expect(connect).toContain('https://us.posthog.com');
  });

  it('still allows the existing PostHog ingestion host (no regression)', async () => {
    expect(cspDirective(await cspFor('/'), 'connect-src')).toContain('https://us.i.posthog.com');
  });
});

describe('locked security headers are preserved (ADR-0014 §9)', () => {
  it('keeps HSTS, X-Frame-Options, and the tight frame/object-src', async () => {
    const res = await middleware(new NextRequest('https://app.example.com/'));
    expect(res.headers.get('strict-transport-security')).toContain('max-age=63072000');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const csp = await cspFor('/');
    expect(cspDirective(csp, 'frame-src')).toBe("frame-src 'none'");
    expect(cspDirective(csp, 'object-src')).toBe("object-src 'none'");
    expect(cspDirective(csp, 'base-uri')).toBe("base-uri 'self'");
  });
});
