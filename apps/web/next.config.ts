import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { NextConfig } from 'next';
import { withSentryConfig } from '@sentry/nextjs';

// ESM equivalent of __dirname — needed for an absolute outputFileTracingRoot,
// which Next.js requires to be a real filesystem path (relative or
// import.meta.url derived) so nft can resolve the monorepo workspace correctly.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactStrictMode: true,

  images: {
    // Supabase Storage — vehicle templates and project assets.
    // Locked to the specific project ref and the public-read path; never a
    // wildcard hostname (that would let any Supabase tenant's images route
    // through our optimization pipeline).
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'dxwnzxlmggpdjyoxdybh.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
    // AVIF first: 40-50% smaller than WebP at equivalent quality. Falls back
    // to WebP for browsers that don't support AVIF.
    formats: ['image/avif', 'image/webp'],
    // Vehicle/decal images are immutable on upload (new object path on
    // re-upload), so a 30-day CDN cache TTL is safe.
    minimumCacheTTL: 2_592_000,
    // Covers mobile cards (320/640), tablet (768), desktop gallery (1024/1280),
    // and full-bleed hero (1920). Omit 2048/3840 — no retina hero images yet.
    deviceSizes: [320, 640, 768, 1024, 1280, 1920],
  },

  transpilePackages: [
    '@alphawolf/auth',
    '@alphawolf/canvas',
    '@alphawolf/db',
    '@alphawolf/observability',
    '@alphawolf/parse',
    '@alphawolf/ui',
  ],

  // Native modules — Next.js/webpack can't parse .node binaries. Mark them
  // as server-side externals so they're loaded via Node's native require()
  // at runtime instead of being bundled.
  //
  // `serverExternalPackages` is the documented Next.js 15 setting, but it
  // does not reach the (action-browser) bundling context that Next.js uses
  // to prepare Server Actions. So we ALSO mark the same packages as webpack
  // externals on the server below. Belt + suspenders.
  //
  // svgo is the vehicle SVG validator's optimiser (@alphawolf/db). It is NOT a
  // native module, but its Node entry (svgo-node.js) loads config via a dynamic
  // require() that webpack can't statically analyse ("Critical dependency"
  // warning), and the @alphawolf/db barrel pulls it into every consumer. It's
  // server-only, so externalise it: required at runtime, never bundled.
  // sharp (raster pipeline), canvas (Konva's native server peer), and the parse
  // worker's queue/AI deps are native or dynamic-require modules that must not be
  // bundled. The editor is client-only (dynamic, ssr:false) so Konva itself never
  // SSRs; `canvas` is listed belt-and-suspenders. See ADR-0006 §8 / ADR-0009.
  serverExternalPackages: [
    '@node-rs/argon2',
    'svgo',
    'sharp',
    'canvas',
    'bullmq',
    'ioredis',
    'replicate',
    '@sentry/profiling-node',
  ],

  // pnpm monorepo nft (Node File Tracer) fix: when an external is reached
  // transitively through a workspace package (e.g. @alphawolf/db → svgo),
  // Vercels nft fails to bundle the external into the lambda. Result at
  // runtime: "Cannot find module svgo" on every /vehicles/* route.
  //
  // Two-part fix:
  //
  // 1. outputFileTracingRoot — point nft at the monorepo root (not apps/web)
  //    so its trace boundary spans the entire workspace including
  //    node_modules/.pnpm/.
  //
  // 2. outputFileTracingIncludes — explicitly include every
  //    serverExternalPackage. Paths are relative to the workspace root
  //    (outputFileTracingRoot above), so they stay INSIDE the trace
  //    boundary and dont get packaged as symlink-escapes. Without these,
  //    nft cant statically resolve dynamic requires (svgo loads its
  //    config via dynamic require) and the deps go missing.
  //
  // Why both pnpm symlink path (node_modules/.pnpm/<pkg>@*) AND the flat path
  // (node_modules/<pkg>) — pnpm sets up node_modules/<pkg> as a symlink to
  // the physical package under .pnpm/. Vercel resolves both during nft tracing.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  outputFileTracingIncludes: {
    '/**/*': [
      // svgo + svgson — vehicle SVG validation in @alphawolf/db
      'node_modules/.pnpm/svgo@*/node_modules/svgo/**/*',
      'node_modules/.pnpm/svgson@*/node_modules/svgson/**/*',
      // sharp — raster pipeline (used by parse worker + asset thumbs)
      'node_modules/.pnpm/sharp@*/node_modules/sharp/**/*',
      'node_modules/.pnpm/@img+sharp-*@*/**/*',
      // @node-rs/argon2 — password hashing (auth)
      'node_modules/.pnpm/@node-rs+argon2@*/node_modules/@node-rs/argon2/**/*',
      'node_modules/.pnpm/@node-rs+argon2-*@*/**/*',
      // bullmq + ioredis — enqueue() in @alphawolf/parse called from web
      'node_modules/.pnpm/bullmq@*/node_modules/bullmq/**/*',
      'node_modules/.pnpm/ioredis@*/node_modules/ioredis/**/*',
      // replicate — AI client (parse worker dep transitively reachable)
      'node_modules/.pnpm/replicate@*/node_modules/replicate/**/*',
      // @sentry/profiling-node — instrument-first via @alphawolf/observability
      'node_modules/.pnpm/@sentry+profiling-node@*/node_modules/@sentry/profiling-node/**/*',
      'node_modules/.pnpm/@sentry-internal+node-cpu-profiler@*/**/*',
    ],
  },

  webpack: (config, { isServer }) => {
    // NodeNext interop: workspace TS sources (services/parse, packages/auth, etc.)
    // use `.js` extensions in their relative imports (TypeScript NodeNext convention,
    // required by Node 22 ESM resolver at runtime). Next.js webpack with
    // `transpilePackages` reads those .ts sources directly and would otherwise look
    // for literal `.js` files and fail with "Module not found: Can't resolve './foo.js'".
    // This alias tells webpack to try `.ts`/`.tsx` before `.js` so the same source
    // works for raw Node (Render services) and webpack (apps/web on Vercel).
    config.resolve = config.resolve ?? {};
    config.resolve.extensionAlias = {
      ...(config.resolve.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
      '.mjs': ['.mts', '.mjs'],
    };

    if (isServer) {
      // Externalize any @node-rs/* package on the server. These ship .node
      // binaries via platform-specific sub-packages (e.g.
      // @node-rs/argon2-darwin-arm64) which webpack cannot parse. The regex
      // matches both the wrapper and every platform-specific variant so the
      // server build emits a plain `require('@node-rs/argon2')` and Node
      // loads the native binding at runtime.
      const existingExternals = Array.isArray(config.externals)
        ? config.externals
        : config.externals
          ? [config.externals]
          : [];
      // /^@node-rs\// : native bindings (see above).
      // svgo : its Node entry's dynamic require() can't be statically bundled.
      // sharp/canvas : native .node binaries (raster pipeline + Konva server peer).
      // bullmq/ioredis/replicate : pulled in via @alphawolf/parse's enqueue();
      //        dynamically imported there, externalised here so webpack never
      //        tries to statically bundle them into a server chunk.
      // @sentry/profiling-node : also reached through @alphawolf/parse's barrel
      //        (its instrument.ts dynamic-imports it); it pulls the native
      //        @sentry-internal/node-cpu-profiler .node binaries, which webpack
      //        can't parse. Externalise so Node loads them at runtime (only when
      //        a SENTRY_DSN is set) instead of bundling.
      config.externals = [
        ...existingExternals,
        /^@node-rs\//,
        'svgo',
        'sharp',
        'canvas',
        'bullmq',
        'ioredis',
        'replicate',
        '@sentry/profiling-node',
      ];
    }
    return config;
  },
};

// Wrap with Sentry: injects the build-time instrumentation and (only when a
// SENTRY_AUTH_TOKEN is present, i.e. CI/prod builds) uploads source maps for
// readable stack traces. org/project overridable via env.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG ?? 'alphawolfdecals',
  project: process.env.SENTRY_PROJECT ?? 'node',
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  disableLogger: true,
});
