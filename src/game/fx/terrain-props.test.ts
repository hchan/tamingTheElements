import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { ARCADE_P1_START_X, ARCADE_P2_START_X } from '@core/index';
import { drawRock, overlapsSpawn } from './terrain-props';

/** A graphics stand-in: every call chains and is recorded by name. */
function recorder(): { g: Phaser.GameObjects.Graphics; calls: string[] } {
  const calls: string[] = [];
  const g: unknown = new Proxy({}, { get: (_t, k: string) => (): unknown => { calls.push(k); return g; } });
  return { g: g as Phaser.GameObjects.Graphics, calls };
}

describe('earth props stay out of the spawn zones (qa r38)', () => {
  it('flags a footprint on either start column, in the fighters row', () => {
    expect(overlapsSpawn(ARCADE_P1_START_X - 20, 380, 100, 100)).toBe(true);
    expect(overlapsSpawn(ARCADE_P2_START_X + 10, 400, 90, 90)).toBe(true);
  });

  it('keeps props that are mid-field or far above or below the fighters row', () => {
    expect(overlapsSpawn(900, 380, 100, 100)).toBe(false);
    expect(overlapsSpawn(ARCADE_P1_START_X, 210, 100, 60)).toBe(false);
    expect(overlapsSpawn(ARCADE_P1_START_X, 560, 100, 60)).toBe(false);
  });

  it('draws only flat scree on a spawn footprint, never a crystal cluster or spire', () => {
    const spawn = recorder();
    drawRock(spawn.g, ARCADE_P1_START_X, 380, 110, 110, 0, false); // a squarish footprint at index 0 is a crystal elsewhere
    expect(spawn.calls).not.toContain('fillTriangle');
    expect(spawn.calls).not.toContain('fillPoints');
    const field = recorder();
    drawRock(field.g, 900, 380, 110, 110, 0, false);
    expect(field.calls).toContain('fillPoints');
  });
});
