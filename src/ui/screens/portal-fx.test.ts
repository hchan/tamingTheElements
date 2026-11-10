import { describe, expect, it } from 'vitest';
import { createPortalFx, spawnEmber, stepEmbers, type FxCanvas } from './portal-fx';

function fakeTarget() {
  const handlers = new Map<string, Set<() => void>>();
  return {
    addEventListener: (t: string, fn: () => void) => {
      const set = handlers.get(t) ?? new Set<() => void>();
      set.add(fn);
      handlers.set(t, set);
    },
    removeEventListener: (t: string, fn: () => void) => {
      handlers.get(t)?.delete(fn);
    },
    fire: (t: string) => {
      handlers.get(t)?.forEach((fn) => {
        fn();
      });
    },
    count: () => [...handlers.values()].reduce((n, s) => n + s.size, 0),
  };
}

function fakeCanvas(): FxCanvas {
  const ctx = {
    clearRect() {},
    beginPath() {},
    arc() {},
    fill() {},
    fillStyle: '',
    globalAlpha: 1,
  };
  return { width: 100, height: 50, getContext: () => ctx };
}

function setup(reduced: boolean) {
  const target = fakeTarget();
  const frames: (() => void)[] = [];
  const cancelled: number[] = [];
  let seed = 0.3;
  const fx = createPortalFx({
    canvas: fakeCanvas(),
    target,
    rng: () => (seed = (seed * 9301 + 0.49297) % 1),
    reducedMotion: () => reduced,
    requestFrame: (cb) => frames.push(cb),
    cancelFrame: (id) => cancelled.push(id),
  });
  return { fx, target, frames, cancelled };
}

describe('portal-fx', () => {
  it('stepEmbers ages and drops dead embers', () => {
    const e = spawnEmber(100, 50, () => 0.5);
    e.maxLife = 2;
    const list = [e];
    stepEmbers(list, () => 0.5);
    expect(list).toHaveLength(1);
    stepEmbers(list, () => 0.5);
    expect(list).toHaveLength(0);
  });

  it('animates on hover and stops on leave', () => {
    const { fx, target, frames, cancelled } = setup(false);
    expect(fx.running).toBe(false);
    target.fire('mouseenter');
    expect(fx.running).toBe(true);
    frames.shift()?.();
    expect(fx.emberCount).toBeGreaterThan(0);
    target.fire('mouseleave');
    expect(fx.running).toBe(false);
    expect(cancelled).toHaveLength(1);
    expect(fx.emberCount).toBe(0);
  });

  it('reduced motion draws a static frame and never schedules frames', () => {
    const { fx, target, frames } = setup(true);
    target.fire('mouseenter');
    expect(frames).toHaveLength(0);
    expect(fx.running).toBe(false);
    expect(fx.emberCount).toBeGreaterThan(0);
  });

  it('dispose removes every listener and ignores later events', () => {
    const { fx, target, frames } = setup(false);
    expect(target.count()).toBeGreaterThan(0);
    target.fire('mouseenter');
    fx.dispose();
    expect(target.count()).toBe(0);
    target.fire('mouseenter');
    expect(frames).toHaveLength(1);
    expect(fx.running).toBe(false);
    fx.dispose();
  });
});
