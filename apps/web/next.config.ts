import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@alphawolf/auth', '@alphawolf/canvas', '@alphawolf/db', '@alphawolf/ui'],

  // Native modules — Next.js/webpack can't parse .node binaries. Mark them
  // as server-side externals so they're loaded via Node's native require()
  // at runtime instead of being bundled.
  //
  // `serverExternalPackages` is the documented Next.js 15 setting, but it
  // does not reach the (action-browser) bundling context that Next.js uses
  // to prepare Server Actions. So we ALSO mark the same packages as webpack
  // externals on the server below. Belt + suspenders.
  serverExternalPackages: ['@node-rs/argon2'],

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
      config.externals = [...existingExternals, /^@node-rs\//];
    }
    return config;
  },
};

export default nextConfig;
