import { describe, expect, it } from 'vitest';
import { geometry } from '../src/index';

const { resolveSnap } = geometry;
type SnapCandidate = geometry.SnapCandidate;

function moving(minX: number, minY: number, maxX: number, maxY: number) {
  return {
    bbox: { minX, minY, maxX, maxY },
    center: { x: (minX + maxX) / 2, y: (minY + maxY) / 2 },
  };
}

describe('resolveSnap', () => {
  it('snaps the moving left edge to a nearby x candidate within threshold', () => {
    const candidates: SnapCandidate[] = [{ axis: 'x', value: 100, source: 'edge' }];
    const result = resolveSnap({
      moving: moving(95, 0, 195, 100), // left edge at x=95, 5 from candidate
      candidates,
      thresholdPx: 10,
    });
    expect(result.dx).toBe(5); // shift +5 so left edge lands on 100
    expect(result.dy).toBe(0);
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.source).toBe('edge');
  });

  it('does not snap when the nearest candidate is beyond threshold', () => {
    const result = resolveSnap({
      moving: moving(95, 0, 195, 100),
      candidates: [{ axis: 'x', value: 100, source: 'edge' }],
      thresholdPx: 3, // gap is 5 > 3
    });
    expect(result.dx).toBe(0);
    expect(result.lines).toHaveLength(0);
  });

  it('picks the nearest candidate when several are in range', () => {
    const candidates: SnapCandidate[] = [
      { axis: 'x', value: 90, source: 'body' }, // gap 5 from left edge (95)
      { axis: 'x', value: 98, source: 'center' }, // gap 3 from center? center=145
      { axis: 'x', value: 150, source: 'element' }, // gap 5 from center(145)
    ];
    // moving left=95 center=145 right=195.
    // candidate 150 vs center 145 -> gap 5; vs left 95 -> 55; vs right 195 -> 45.
    // candidate 90 vs left 95 -> gap 5. candidate 98 vs left 95 -> gap 3 (nearest).
    const result = resolveSnap({
      moving: moving(95, 0, 195, 100),
      candidates,
      thresholdPx: 10,
    });
    expect(result.dx).toBe(3); // 98 - 95
    expect(result.lines[0]?.value).toBe(98);
  });

  it('snaps x and y independently', () => {
    const candidates: SnapCandidate[] = [
      { axis: 'x', value: 200, source: 'edge' }, // moving center.x=150 -> gap 50 (no)
      { axis: 'x', value: 100, source: 'edge' }, // left edge 95 -> gap 5
      { axis: 'y', value: 0, source: 'edge' }, // top edge 0 -> gap 0
    ];
    const result = resolveSnap({
      moving: moving(95, 0, 195, 100),
      candidates,
      thresholdPx: 8,
    });
    expect(result.dx).toBe(5);
    expect(result.dy).toBe(0);
    expect(result.lines).toHaveLength(2);
  });

  it('returns zero deltas with no candidates', () => {
    const result = resolveSnap({
      moving: moving(0, 0, 10, 10),
      candidates: [],
      thresholdPx: 10,
    });
    expect(result).toEqual({ dx: 0, dy: 0, lines: [] });
  });

  it('snaps the moving center to a center candidate', () => {
    const result = resolveSnap({
      moving: moving(0, 0, 100, 100), // center at (50,50)
      candidates: [{ axis: 'x', value: 52, source: 'center' }],
      thresholdPx: 5,
    });
    expect(result.dx).toBe(2);
  });
});
