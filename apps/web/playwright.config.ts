import { defineConfig, devices } from '@playwright/test';

// When DEPLOY_URL points at a remote target (production smoke tests, preview
// URL verification, etc.) we should NOT try to spawn a local `pnpm dev`
// server — it wastes 30+s on every run and fails outright in CI environments
// that don't have devDependencies installed. Detect a remote target by the
// absence of localhost/127.0.0.1 in DEPLOY_URL.
const deployUrl = process.env.DEPLOY_URL;
const isRemoteTarget =
  !!deployUrl && !deployUrl.includes('127.0.0.1') && !deployUrl.includes('localhost');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: deployUrl ?? 'http://127.0.0.1:3000',
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
  ...(isRemoteTarget
    ? {}
    : {
        webServer: {
          command: 'pnpm dev',
          url: 'http://127.0.0.1:3000',
          reuseExistingServer: !process.env.CI,
          timeout: 120 * 1000,
        },
      }),
});
