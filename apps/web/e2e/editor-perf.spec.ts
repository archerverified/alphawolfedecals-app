// GH-008 fps benchmark (ADR-0006 §8). Mounts 200 elements via the dev-only
// ?perfSeed=200 route param, programmatically drags one element for ~2s, and
// samples requestAnimationFrame deltas inside the page. Asserts median frame
// time < 16.7ms (60fps) and p95 < 33ms (no sustained jank).
//
// Run on the local M1 dev server (the AC's target hardware) and paste the
// numbers into the PR. On shared CI runners this is informational, not gating
// (CI hardware ≠ M1), which is why it lives outside the CI `turbo run test`.

import { expect, test, type Page } from '@playwright/test';
import { signUpAndVerify, signIn, uniqueEmail } from './support/flows';

type KNode = {
  position: (p?: { x: number; y: number }) => void;
  getLayer: () => { batchDraw: () => void } | null;
};
type StageHandle = { findOne: (s: string) => KNode | undefined };

const SEEDED_VEHICLE_ID = 'a0000000-0000-4000-8000-000000000001';

async function createProject(page: Page): Promise<string> {
  await page.goto(`/vehicles/${SEEDED_VEHICLE_ID}`);
  await page.getByRole('button', { name: /start a project/i }).click();
  await page
    .getByRole('dialog')
    .getByRole('button', { name: /create|start/i })
    .click();
  await page.waitForURL(/\/projects\/[0-9a-f-]+\/editor/);
  const m = page.url().match(/\/projects\/([0-9a-f-]+)\/editor/);
  if (!m) throw new Error('no project id');
  return m[1] as string;
}

test('editor sustains ~60fps dragging with 200 elements', async ({ page, request }) => {
  const email = uniqueEmail('perf');
  await signUpAndVerify(page, request, email);
  await signIn(page, email, '/vehicles/select');

  const projectId = await createProject(page);
  await page.goto(`/projects/${projectId}/editor?perfSeed=200`);
  await page.getByTestId('canvas-ready').waitFor({ state: 'attached' });

  const stats = await page.evaluate(async () => {
    const deltas: number[] = [];
    let last = performance.now();
    let raf: number;
    const loop = () => {
      const t = performance.now();
      deltas.push(t - last);
      last = t;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    const stage = (window as unknown as { __KONVA_STAGE__?: StageHandle }).__KONVA_STAGE__;
    const node = stage?.findOne('.perf-drag-target');
    const start = performance.now();
    let x = 0;
    while (performance.now() - start < 2000) {
      x = (x + 4) % 800;
      node?.position({ x, y: 100 });
      node?.getLayer()?.batchDraw();
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    cancelAnimationFrame(raf);

    deltas.sort((a, b) => a - b);
    const median = deltas[Math.floor(deltas.length / 2)] ?? 0;
    const p95 = deltas[Math.floor(deltas.length * 0.95)] ?? 0;
    return { median, p95, frames: deltas.length };
  });

  console.log(
    `[fps] median=${stats.median.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms frames=${stats.frames}`,
  );
  expect(stats.median).toBeLessThan(16.7);
  expect(stats.p95).toBeLessThan(33);
});
