import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@alphawolf/auth',
    '@alphawolf/canvas',
    '@alphawolf/db',
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
  ],

  webpack: (config, { isServer }) => {
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
      config.externals = [
        ...existingExternals,
        /^@node-rs\//,
        'svgo',
        'sharp',
        'canvas',
        'bullmq',
        'ioredis',
        'replicate',
      ];
    }
    return config;
  },
};

export default nextConfig;
