import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ['@alphawolf/auth', '@alphawolf/canvas', '@alphawolf/db', '@alphawolf/ui'],
};

export default nextConfig;
