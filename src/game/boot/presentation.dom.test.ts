// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installPresentation } from './presentation';
import { PORTRAIT_PLAY } from './portrait-play';

let portrait = true;
let coarse = true;
const mqs: { fns: Set<() => void> }[] = [];

function stubMatchMedia(): void {
  mqs.length = 0;
  vi.stubGlobal('matchMedia', (query: string) => {
    const fns = new Set<() => void>();
    mqs.push({ fns });
    return {
      get matches(): boolean {
        return query.includes('coarse') ? portrait && coarse : portrait;
      },
      addEventListener: (_t: string, f: () => void) => { fns.add(f); },
      removeEventListener: (_t: string, f: () => void) => { fns.delete(f); },
    };
  });
}
function fire(): void {
  for (const m of mqs) for (const f of [...m.fns]) f();
}
const listenerCount = (): number => mqs.reduce((n, m) => n + m.fns.size, 0);

function fakeGame(): { game: never; refresh: ReturnType<typeof vi.fn>; destroy: () => void; reg: Map<string, unknown> } {
  const reg = new Map<string, unknown>();
  const refresh = vi.fn();
  let onDestroy: (() => void) | undefined;
  const game = {
    isBooted: true,
    registry: { set: (k: string, v: unknown) => reg.set(k, v), get: (k: string) => reg.get(k) },
    events: { once: (_e: string, f: () => void) => { onDestroy = f; }, emit: vi.fn() },
    scale: { refresh, fullscreen: { available: false }, toggleFullscreen: vi.fn() },
  };
  return { game: game as never, refresh, destroy: () => { onDestroy?.(); }, reg };
}
const attr = (): boolean => document.documentElement.hasAttribute('data-portrait-play');

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-portrait-play');
  document.body.innerHTML = '';
  portrait = true;
  coarse = true;
});

describe('portrait play flag', () => {
  it('(a) stays off while the rotate overlay is up', () => {
    stubMatchMedia();
    const g = fakeGame();
    installPresentation(g.game, document.body, { rotateHint: true, portraitPlay: true });
    expect(attr()).toBe(false);
    expect(g.reg.get(PORTRAIT_PLAY)).toBeFalsy();
  });
  it('(b) turns on after "Play anyway" and refreshes the scale once', () => {
    stubMatchMedia();
    const g = fakeGame();
    installPresentation(g.game, document.body, { rotateHint: true, portraitPlay: true });
    document.getElementById('rotateDismiss')?.click();
    expect(attr()).toBe(true);
    expect(g.reg.get(PORTRAIT_PLAY)).toBe(true);
    expect(g.refresh).toHaveBeenCalledTimes(1);
  });
  it('(c) turns off when the device goes landscape', () => {
    stubMatchMedia();
    const g = fakeGame();
    installPresentation(g.game, document.body, { rotateHint: true, portraitPlay: true });
    document.getElementById('rotateDismiss')?.click();
    portrait = false;
    fire();
    expect(attr()).toBe(false);
    expect(g.reg.get(PORTRAIT_PLAY)).toBe(false);
  });
  it('(d) is on at once in Online (no rotate hint)', () => {
    stubMatchMedia();
    const g = fakeGame();
    installPresentation(g.game, document.body, { rotateHint: false, portraitPlay: true });
    expect(attr()).toBe(true);
    expect(g.reg.get(PORTRAIT_PLAY)).toBe(true);
  });
  it('(e) is never on for cinematics, or without a coarse pointer', () => {
    stubMatchMedia();
    installPresentation(fakeGame().game, document.body, { rotateHint: false, portraitPlay: false });
    expect(attr()).toBe(false);
    coarse = false;
    installPresentation(fakeGame().game, document.body, { rotateHint: false, portraitPlay: true });
    expect(attr()).toBe(false);
  });
  it('(f) destroy cleans the attribute, registry and listeners', () => {
    stubMatchMedia();
    const g = fakeGame();
    installPresentation(g.game, document.body, { rotateHint: false, portraitPlay: true });
    expect(listenerCount()).toBeGreaterThan(0);
    g.destroy();
    expect(attr()).toBe(false);
    expect(g.reg.get(PORTRAIT_PLAY)).toBe(false);
    expect(listenerCount()).toBe(0);
  });
  it("(g) an older game destroyed late does not clear a newer game's flag", () => {
    stubMatchMedia();
    const a = fakeGame();
    const b = fakeGame();
    installPresentation(a.game, document.body, { rotateHint: false, portraitPlay: true });
    installPresentation(b.game, document.body, { rotateHint: false, portraitPlay: true });
    a.destroy();
    expect(attr()).toBe(true);
    b.destroy();
    expect(attr()).toBe(false);
  });
});
