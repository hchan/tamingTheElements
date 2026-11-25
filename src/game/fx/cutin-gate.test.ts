import { describe, expect, it } from 'vitest';
import { ROSTER_24_CHARACTERS } from '@core/index';
import { CUTIN_ALPHA, CUTIN_HEROES, CUTIN_MS, CUTIN_SLIDE, cutinFlagOn, cutinFrame, cutinKey, cutinUrl, shouldCutin } from './cutin-gate';

describe('super cut-in gate', () => {
  it('covers exactly the roster24 heroes (tests/repo/cutin-backdrops pins the files)', () => {
    expect([...CUTIN_HEROES].sort()).toEqual(ROSTER_24_CHARACTERS.map((c) => c.sprite).sort());
  });

  it('needs ?ff=roster24 and a dev or test build', () => {
    expect(cutinFlagOn('?ff=roster24', true)).toBe(true);
    expect(cutinFlagOn('?ff=play,roster24', true)).toBe(true);
    expect(cutinFlagOn('?ff=roster24', false)).toBe(false);
    expect(cutinFlagOn('', true)).toBe(false);
    expect(cutinFlagOn('?ff=play', true)).toBe(false);
  });

  it('shows only for a roster24 hero', () => {
    expect(shouldCutin('umbrel', '?ff=roster24', true)).toBe(true);
    expect(shouldCutin('curomo', '?ff=roster24', true)).toBe(false);
    expect(shouldCutin(undefined, '?ff=roster24', true)).toBe(false);
    expect(shouldCutin('umbrel', '', true)).toBe(false);
    expect(shouldCutin('zephra', '', false)).toBe(true); // released: no flag needed
    expect(shouldCutin('vortigal', '', false)).toBe(true);
    expect(shouldCutin('durrok', '', false)).toBe(true);
    expect(shouldCutin('glimmaw', '', false)).toBe(true);
    expect(shouldCutin('hyalia', '', false)).toBe(true);
    expect(shouldCutin('brazgor', '', false)).toBe(true);
    expect(shouldCutin('kindrel', '', false)).toBe(true);
    expect(shouldCutin('ouroth', '', false)).toBe(true);
    expect(shouldCutin('nykra', '', false)).toBe(true);
    expect(shouldCutin('abyssor', '', false)).toBe(true);
    expect(shouldCutin('quarrak', '', false)).toBe(true);
    expect(shouldCutin('umbrel', '?ff=roster24', false)).toBe(false);
  });

  it('builds the texture key and url', () => {
    expect(cutinKey('nykra')).toBe('cutin:nykra');
    expect(cutinUrl('/', 'nykra')).toBe('/assets/img/cutin/nykra.png');
    expect(cutinUrl('/tte', 'nykra')).toBe('/tte/assets/img/cutin/nykra.png');
  });

  it('fades in and out, slides only without reduced motion', () => {
    const o = { alpha: 0, dx: 0 };
    expect(cutinFrame(0, false, -1, o).alpha).toBe(0);
    expect(o.dx).toBe(-CUTIN_SLIDE);
    expect(cutinFrame(0, false, 1, o).dx).toBe(CUTIN_SLIDE);
    expect(cutinFrame(0, true, 1, o).dx).toBe(0);
    expect(cutinFrame(CUTIN_MS / 2, false, 1, o)).toEqual({ alpha: CUTIN_ALPHA, dx: 0 });
    expect(cutinFrame(CUTIN_MS, false, 1, o).alpha).toBe(0);
  });
});
