// Goal 7 D3 — OPT-IN integration test: ONE real Haiku call (~$0.01).
// Never runs in CI: requires BOTH RUN_ORCHESTRATOR_INTEGRATION=1 and a real
// ANTHROPIC_API_KEY in the environment. Run locally with:
//
//   RUN_ORCHESTRATOR_INTEGRATION=1 ANTHROPIC_API_KEY=sk-... \
//     pnpm --filter @alphawolf/web exec vitest run tests/ai-orchestrator.integration.test.ts
//
// @vitest-environment node
// (the SDK refuses to run in a browser-like environment; jsdom counts as one)

import { describe, expect, it } from 'vitest';

const enabled =
  process.env.RUN_ORCHESTRATOR_INTEGRATION === '1' &&
  Boolean(process.env.ANTHROPIC_API_KEY?.trim());

describe.runIf(enabled)('orchestrator integration (real Haiku call, ~$0.01)', () => {
  it('compiles a tiny brief into three schema-valid directions', async () => {
    const { compileBrief } = await import('../lib/ai/orchestrator');

    const result = await compileBrief({
      briefData: {
        colors: { picks: [{ hex: '#00AEEF', role: 'primary', finish: 'gloss' }] },
        style: { presets: ['Clean'] },
      },
      vehicle: { year: 2024, make: 'Ford', model: 'Transit', bodyType: 'van' },
      views: ['front', 'driver'],
      logoZones: ['Driver Front Door'],
      panelsByView: {
        front: ['Hood', 'Front Bumper'],
        driver: ['Driver Front Door', 'Driver Slider'],
      },
    });

    expect(result.directions.map((d) => d.key)).toEqual(['literal', 'bolder', 'minimal']);
    for (const direction of result.directions) {
      expect(direction.title.length).toBeLessThanOrEqual(40);
      expect(direction.summary.length).toBeLessThanOrEqual(140);
      for (const view of ['front', 'driver']) {
        expect(direction.viewPrompts[view]!.length).toBeGreaterThan(40);
      }
    }
    expect(result.usage.estimatedUsd).toBeLessThan(0.05);

    // Surfaced so the runner can report the real cost of this call.
    console.info(
      `[orchestrator integration] tokens in=${result.usage.inputTokens} out=${result.usage.outputTokens} ` +
        `estimatedUsd=$${result.usage.estimatedUsd}`,
    );
  }, 120_000);
});

describe.runIf(!enabled)('orchestrator integration (skipped)', () => {
  it('is gated behind RUN_ORCHESTRATOR_INTEGRATION=1 + ANTHROPIC_API_KEY', () => {
    expect(enabled).toBe(false);
  });
});
