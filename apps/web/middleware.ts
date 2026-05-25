// Production middleware — runs on every matched request (Edge runtime).
//
// Responsibilities:
// 1. Security headers: CSP, HSTS, X-Frame-Options, X-Content-Type-Options,
//    Referrer-Policy, Permissions-Policy — on every response.
// 2. Rate limiting: per-IP sliding window on auth flows (signup, signin, OTP).
//    Uses Upstash Redis REST API. Gracefully disabled when credentials absent
//    (CI, local without secrets, development).
// 3. CSRF bootstrap: double-submit cookie for Server Actions on forms.
//
// Edge runtime constraint: no `node:*` imports, no Prisma, no argon2.
// Use Web Crypto API for CSRF token generation.
//
// CSP trade-off: `'unsafe-inline'` is required for two reasons:
//   - Next.js 15 App Router injects an inline bootstrap script into every HTML page
//   - Tailwind v4 and shadcn/Radix inject per-component style strings at runtime
// Phase 2 will explore nonce-based CSP (requires SSR nonce propagation through
// all RSC boundaries) to narrow this gap. `'unsafe-eval'` is included as a
// safety net for Konva's canvas rendering path; audit and remove if confirmed
// unnecessary in the deployed build.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { CSRF_COOKIE_NAME } from '@alphawolf/auth';

// ---------------------------------------------------------------------------
// Security headers
// ---------------------------------------------------------------------------

const SUPABASE_HOSTNAME = 'dxwnzxlmggpdjyoxdybh.supabase.co';

const SECURITY_HEADERS: [string, string][] = [
  [
    'Content-Security-Policy',
    [
      "default-src 'self'",
      // 'unsafe-inline': Next.js bootstrap + Tailwind v4 runtime styles.
      // 'unsafe-eval': Konva canvas path; revisit in Phase 2.
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      // blob: for canvas.toBlob(), data: for inline SVG data URIs.
      `img-src 'self' data: blob: https://${SUPABASE_HOSTNAME}`,
      [
        "connect-src 'self'",
        `https://${SUPABASE_HOSTNAME}`,
        `wss://${SUPABASE_HOSTNAME}`,
        // Sentry error ingestion — CSP wildcards only match ONE subdomain level
        // per spec, so the bare *.ingest.sentry.io pattern does NOT match the
        // regional hosts Sentry actually uses (e.g.
        // o4511425978630144.ingest.us.sentry.io). Sentry SaaS only supports US
        // and EU data storage regions; EU is *.ingest.de.sentry.io (Germany),
        // NOT *.ingest.eu.sentry.io.
        // Source: https://docs.sentry.io/security-legal-pii/security/ip-ranges/
        'https://*.ingest.sentry.io',
        'https://*.ingest.us.sentry.io',
        'https://*.ingest.de.sentry.io',
        // PostHog analytics (services/ai events, Phase 2 web events)
        'https://us.i.posthog.com',
        'https://eu.i.posthog.com',
        // Vercel Speed Insights and Analytics
        'https://vitals.vercel-insights.com',
        'https://va.vercel-scripts.com',
      ].join(' '),
      "font-src 'self'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      'upgrade-insecure-requests',
    ].join('; '),
  ],
  // 2 years; includeSubDomains. Only effective on HTTPS (production).
  ['Strict-Transport-Security', 'max-age=63072000; includeSubDomains'],
  ['X-Frame-Options', 'DENY'],
  ['X-Content-Type-Options', 'nosniff'],
  ['Referrer-Policy', 'strict-origin-when-cross-origin'],
  ['Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()'],
];

// ---------------------------------------------------------------------------
// Rate limiting (Upstash Redis — gracefully disabled when credentials absent)
// ---------------------------------------------------------------------------

// Auth routes that receive per-IP rate limiting.
const RATE_LIMITED_PREFIXES = ['/signup', '/signin', '/verify'];

// Initialise rate limiter lazily. Returns null when credentials are absent,
// which bypasses rate limiting without throwing. Uses @upstash/ratelimit +
// @upstash/redis (both edge-safe REST clients).
let _ratelimiter: unknown | null = undefined; // undefined = not yet checked

async function getRatelimiter(): Promise<{
  limit: (id: string) => Promise<{ success: boolean }>;
} | null> {
  // Already resolved (null = no credentials, object = live limiter)
  if (_ratelimiter !== undefined) return _ratelimiter as Awaited<ReturnType<typeof getRatelimiter>>;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    _ratelimiter = null;
    return null;
  }

  try {
    const [{ Ratelimit }, { Redis }] = await Promise.all([
      import('@upstash/ratelimit'),
      import('@upstash/redis'),
    ]);
    _ratelimiter = new Ratelimit({
      redis: new Redis({ url, token }),
      // 10 attempts per IP per minute on auth routes. Generous enough to not
      // frustrate legitimate users; tight enough to block credential-stuffing.
      limiter: Ratelimit.slidingWindow(10, '1 m'),
      prefix: 'rl:auth',
    });
    return _ratelimiter as Awaited<ReturnType<typeof getRatelimiter>>;
  } catch {
    _ratelimiter = null;
    return null;
  }
}

// ---------------------------------------------------------------------------
// CSRF token bootstrap (Edge Crypto API — no node:crypto)
// ---------------------------------------------------------------------------

const TOKEN_BYTES = 32;

function generateEdgeCsrfToken(): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Routes that require the CSRF cookie to be bootstrapped before render.
const CSRF_ROUTES = new Set(['/signup', '/signup-shop', '/verify', '/vehicles/request']);

function needsCsrfBootstrap(pathname: string): boolean {
  if (CSRF_ROUTES.has(pathname)) return true;
  if (pathname.startsWith('/admin')) return true;
  // Dynamic /vehicles/<id> detail page renders <StartProjectButton>, which
  // submits a CSRF-protected Server Action. The only static child route under
  // /vehicles/ is /vehicles/select (the browse index — no forms), so exclude
  // it explicitly and treat everything else under /vehicles/ as a dynamic
  // detail route that needs the CSRF cookie.
  if (pathname.startsWith('/vehicles/') && pathname !== '/vehicles/select') {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // 1. Security headers — every response.
  for (const [name, value] of SECURITY_HEADERS) {
    response.headers.set(name, value);
  }

  // 2. Rate limiting — auth routes only.
  const isRateLimited = RATE_LIMITED_PREFIXES.some((p) => pathname.startsWith(p));
  if (isRateLimited) {
    const rl = await getRatelimiter();
    if (rl) {
      const ip =
        request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
        request.headers.get('x-real-ip') ??
        'unknown';
      const { success } = await rl.limit(ip);
      if (!success) {
        return new NextResponse('Too Many Requests', {
          status: 429,
          headers: { 'Retry-After': '60' },
        });
      }
    }
  }

  // 3. CSRF bootstrap — form pages only.
  if (needsCsrfBootstrap(pathname) && !request.cookies.get(CSRF_COOKIE_NAME)) {
    const token = generateEdgeCsrfToken();
    response.cookies.set(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'strict',
      path: '/',
      secure: process.env.NODE_ENV === 'production',
    });
  }

  return response;
}

// Run on all routes except Next.js internals and static assets. The security
// headers must reach every page; CSRF + rate limiting are gated internally.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp|avif)$).*)'],
};
