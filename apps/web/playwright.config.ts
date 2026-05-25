import { defineConfig, devices } from '@playwright/test';

// When DEPLOY_URL points at a remote target (production smoke tests, preview
// URL verification, etc.) we should NOT try to spawn a local `pnpm dev`
// server — it wastes 30+s on every run and fails outright in CI environments
// that don't have devDependencies installed.
//
// Parse DEPLOY_URL once and derive everything from it. Substring matching
// (e.g. `deployUrl.includes('127.0.0.1')`) is unsafe because hostnames like
// `127.0.0.1.evil.example` would incorrectly classify as local. Hostname
// equality on the parsed URL is the only correct test.
//
// A malformed DEPLOY_URL throws here on purpose — better to fail the test
// run immediately than to silently default to localhost and run smoke
// against the wrong target.
const deployUrl = process.env.DEPLOY_URL;
const parsedDeployUrl = deployUrl ? new URL(deployUrl) : null;
const isLocalTarget =
  !parsedDeployUrl ||
  parsedDeployUrl.hostname === 'localhost' ||
  parsedDeployUrl.hostname === '127.0.0.1' ||
  parsedDeployUrl.hostname === '::1'; // IPv6 localhost (Node sometimes binds v6 first)
const isRemoteTarget = !isLocalTarget;
// Single source of truth for both baseURL and the local webServer URL,
// so a custom local port (e.g. DEPLOY_URL=http://127.0.0.1:8080) stays
// consistent across both.
const targetOrigin = parsedDeployUrl?.origin ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: targetOrigin,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Only spawn the local dev server when we're actually testing against
  // localhost. Remote-target runs (DEPLOY_URL=https://...) skip this block.
  // webServer.url is derived from the same parsed origin as baseURL so a
  // custom local port stays consistent. Note: `pnpm dev` itself defaults to
  // Next.js port 3000 — if you set DEPLOY_URL with a different local port,
  // also export PORT=<port> so the dev server binds where Playwright looks.
  ...(isRemoteTarget
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          url: targetOrigin,
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
      }),
});
