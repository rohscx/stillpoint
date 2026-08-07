import { describe, expect, it } from 'vitest';
import {
  DEFAULT_POSITION,
  clampPosition,
  nudgePosition,
  pixelsToPosition,
  positionToPixels,
  snapPosition,
} from '../src/reader/ui/drag.js';

const viewport = { width: 1_000, height: 800 };
const frame = { width: 320, height: 200 };

describe('Redicle position geometry', () => {
  it.each([
    [{ x: -20, y: 50 }, { x: 16, y: 50 }],
    [{ x: 120, y: 50 }, { x: 84, y: 50 }],
    [{ x: 50, y: -20 }, { x: 50, y: 12.5 }],
    [{ x: 50, y: 120 }, { x: 50, y: 87.5 }],
  ])('clamps %o fully on-screen', (position, expected) => {
    expect(clampPosition(position, viewport, frame)).toEqual(expected);
  });

  it('snaps only positions within 2% of the default', () => {
    expect(snapPosition({ x: 51.9, y: 36 })).toEqual(DEFAULT_POSITION);
    expect(snapPosition({ x: 52.1, y: 38 })).toEqual({ x: 52.1, y: 38 });
    expect(snapPosition({ x: 50, y: 40.1 })).toEqual({ x: 50, y: 40.1 });
  });

  it('round-trips viewport percentages through pixels', () => {
    const position = { x: 71.25, y: 22.75 };
    expect(pixelsToPosition(positionToPixels(position, viewport), viewport)).toEqual(position);
  });

  it('nudges by exactly 2%', () => {
    expect(nudgePosition({ x: 50, y: 38 }, -1, 0)).toEqual({ x: 48, y: 38 });
    expect(nudgePosition({ x: 50, y: 38 }, 0, 1)).toEqual({ x: 50, y: 40 });
  });
});

describe('clampPosition with controls below the frame', () => {
  const viewport = { width: 1000, height: 400 };
  const frame = { width: 600, height: 200 };

  it('keeps the controls on screen, not just the frame', () => {
    // Without accounting for the 74px control cluster the frame clamps to y=75, which
    // pushes the transport, progress and status below the viewport where they cannot be
    // reached. SPEC §3.6.
    const clamped = clampPosition({ x: 50, y: 100 }, viewport, frame, 74);
    const centreY = clamped.y / 100 * viewport.height;
    expect(centreY + frame.height / 2 + 74).toBeLessThanOrEqual(viewport.height);
  });

  it('still clamps the frame when no controls are present', () => {
    expect(clampPosition({ x: 50, y: 100 }, viewport, frame, 0).y).toBe(75);
  });

  it('keeps the controls on screen when they exceed half the viewport below centre', () => {
    // Regression: a 50% cap on the below-centre extent let the controls overflow whenever
    // half the frame plus the controls exceeded half the viewport height.
    const shortViewport = { width: 1000, height: 330 };
    const tallFrame = { width: 600, height: 238 };
    const clamped = clampPosition({ x: 50, y: 100 }, shortViewport, tallFrame, 74);
    const centreY = clamped.y / 100 * shortViewport.height;
    expect(centreY + tallFrame.height / 2 + 74).toBeLessThanOrEqual(shortViewport.height + 0.001);
  });

  it('keeps the frame on screen when the viewport cannot fit both', () => {
    const shortViewport = { width: 1000, height: 220 };
    const clamped = clampPosition({ x: 50, y: 100 }, shortViewport, frame, 74);
    const centreY = clamped.y / 100 * shortViewport.height;
    expect(centreY - frame.height / 2).toBeGreaterThanOrEqual(0);
  });
});
