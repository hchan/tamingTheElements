import { describe, expect, it, vi } from 'vitest';
import type Phaser from 'phaser';
import { LowLifeVignette, REDUCED_STRENGTH } from './low-life-vignette';

function rig(): { vignette: LowLifeVignette; filter: { active: boolean; strength: number }; add: ReturnType<typeof vi.fn> } {
  const filter = { active: false, strength: 0 };
  const add = vi.fn(() => filter);
  const camera = { filters: { external: { addVignette: add } } } as unknown as Phaser.Cameras.Scene2D.Camera;
  return { vignette: new LowLifeVignette(camera), filter, add };
}

describe('LowLifeVignette', () => {
  it('creates no filter while life is healthy or unknown', () => {
    const { vignette, add } = rig();
    vignette.set(0.9);
    vignette.set(undefined);
    expect(add).not.toHaveBeenCalled();
  });

  it('creates the filter once on the first low reading and scales strength with danger', () => {
    const { vignette, filter, add } = rig();
    vignette.set(0.2);
    expect(add).toHaveBeenCalledTimes(1);
    expect(filter.active).toBe(true);
    const mild = filter.strength;
    vignette.set(0.05);
    expect(add).toHaveBeenCalledTimes(1);
    expect(filter.strength).toBeGreaterThan(mild);
    expect(filter.strength).toBeCloseTo(0.6);
  });

  it('disables (does not destroy) the filter when life recovers or the hero is gone', () => {
    const { vignette, filter } = rig();
    vignette.set(0.1);
    vignette.set(0.8);
    expect(filter.active).toBe(false);
    expect(filter.strength).toBe(0);
    vignette.set(0.1);
    expect(filter.active).toBe(true);
    vignette.set(0);
    expect(filter.active).toBe(false);
  });

  it('under reduced motion holds a steady strength instead of ramping with falling life, and follows the setting live', () => {
    const filter = { active: false, strength: 0 };
    const camera = { filters: { external: { addVignette: vi.fn(() => filter) } } } as unknown as Phaser.Cameras.Scene2D.Camera;
    let reduced = true;
    const v = new LowLifeVignette(camera, () => reduced);
    v.set(0.28);
    expect(filter.strength).toBe(REDUCED_STRENGTH);
    v.set(0.05);
    expect(filter.active).toBe(true);
    expect(filter.strength).toBe(REDUCED_STRENGTH);
    reduced = false;
    v.set(0.05);
    expect(filter.strength).toBeGreaterThan(REDUCED_STRENGTH);
    reduced = true;
    v.set(0.9);
    expect(filter.active).toBe(false);
    expect(filter.strength).toBe(0);
  });
});
