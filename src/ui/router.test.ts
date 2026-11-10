import { describe, expect, it } from 'vitest';
import { ROUTE_NAMES, resolveRoute } from './router';

describe('resolveRoute', () => {
  it('maps empty hash to main', () => {
    expect(resolveRoute('')).toEqual({ name: 'main', param: null });
    expect(resolveRoute('#')).toEqual({ name: 'main', param: null });
  });

  it('resolves known routes', () => {
    expect(resolveRoute('#garrison')).toEqual({ name: 'garrison', param: null });
    expect(resolveRoute('#newGame').name).toBe('newGame');
  });

  it('resolves race param routes', () => {
    expect(resolveRoute('#race_fire')).toEqual({ name: 'race', param: 'fire' });
    expect(resolveRoute('#race_')).toEqual({ name: 'main', param: null });
    expect(resolveRoute('#race_<img src=x>').name).toBe('main');
  });

  it('does not treat "race" itself as a plain route', () => {
    expect(resolveRoute('#race').name).toBe('main');
  });

  // router-main-hash: intentional divergence from legacy main[hash]()
  it('unknown/prototype hashes never call arbitrary functions', () => {
    for (const h of [
      '#__proto__',
      '#constructor',
      '#toString',
      '#hasOwnProperty',
      '#valueOf',
      '#initOnce',
      '#begin',
      '#nope',
      '#garrison()',
    ]) {
      expect(resolveRoute(h)).toEqual({ name: 'main', param: null });
    }
  });

  it('only ever returns a declared route name', () => {
    for (const h of ['#a', '#__proto__', '#exit', '#race_x', '']) {
      expect(ROUTE_NAMES).toContain(resolveRoute(h).name);
    }
  });
});
