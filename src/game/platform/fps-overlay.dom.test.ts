// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installFpsOverlay, wantsFpsOverlay } from './fps-overlay';

describe('wantsFpsOverlay', () => {
  it('is on for ff=fps or showFps among several flags, otherwise off', () => {
    expect(wantsFpsOverlay('?ff=fps')).toBe(true);
    expect(wantsFpsOverlay('?ff=arenaDemo, showFps')).toBe(true);
    expect(wantsFpsOverlay('?ff=arenaDemo')).toBe(false);
    expect(wantsFpsOverlay('')).toBe(false);
    expect(wantsFpsOverlay('?fps=1')).toBe(false);
  });
});

describe('installFpsOverlay', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows fps and frame times from rAF deltas and removes itself on dispose', () => {
    const cbs = new Map<number, FrameRequestCallback>();
    let next = 1;
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cbs.set(next, cb);
      return next++;
    });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => cbs.delete(id));
    const dispose = installFpsOverlay();
    try {
      const box = document.getElementById('fpsOverlay');
      expect(box).not.toBeNull();
      expect(box?.getAttribute('aria-hidden')).toBe('true');
      // The first frame only primes the clock; then nine 20 ms deltas and one 50 ms hitch (the 10th delta renders).
      let now = 100;
      const step = (dt: number): void => {
        now += dt;
        const [id, cb] = [...cbs.entries()][0] as [number, FrameRequestCallback];
        cbs.delete(id);
        cb(now);
      };
      step(0);
      for (let i = 0; i < 9; i++) step(20);
      step(50);
      expect(box?.textContent).toBe('43 fps\n23.0 ms avg\n50.0 ms worst');
    } finally {
      dispose();
    }
    expect(document.getElementById('fpsOverlay')).toBeNull();
    expect(cbs.size).toBe(0);
  });
});
