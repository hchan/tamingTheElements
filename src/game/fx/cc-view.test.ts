import type Phaser from 'phaser';
import type { RenderCharacter, RenderView } from '@core/index';
import { describe, expect, it } from 'vitest';
import { MAX_CC_PARTS_TOTAL, MAX_CC_SEGS_TOTAL } from './cc-fx';
import { mountCcView } from './cc-view';
import { FLASH_MIN_GAP_TICKS, FlashGate } from './flash-gate';

/** Chainable stand-in for an Image or Graphics: every method returns itself, `frame.name` and `depth` are plain fields. */
function chain(): Record<string, unknown> {
  const o: Record<string, unknown> = { frame: { name: '' }, depth: 0 };
  const self: Record<string, unknown> = new Proxy(o, {
    get: (t, k: string) => {
      if (k in t) return t[k];
      if (k === 'setFrame') return (n: string) => { (t['frame'] as { name: string }).name = n; return self; };
      if (k === 'setDepth') return (d: number) => { t['depth'] = d; return self; };
      return () => self;
    },
  });
  return self;
}

interface Fake {
  scene: Phaser.Scene;
  draw: () => void;
  images: () => number;
}

function fakeScene(): Fake {
  let draw: () => void = () => undefined;
  let images = 0;
  const scene = {
    add: { image: () => { images++; return chain(); }, graphics: () => chain() },
    textures: { exists: () => true },
    events: {
      on: (_n: string, f: () => void) => { draw = f; return scene.events; },
      once: () => scene.events,
      off: () => scene.events,
    },
  };
  return { scene: scene as unknown as Phaser.Scene, draw: () => { draw(); }, images: () => images };
}

const hero = (id: number): RenderCharacter =>
  ({ id, team: id & 1, flags: 0, x: 400 + id * 600, y: 500, px: 400 + id * 600, py: 500, w: 80, h: 160 }) as unknown as RenderCharacter;

function fakeView(state: { tick: number }): RenderView {
  const heroes = [hero(0), hero(1)];
  return {
    get tick() { return state.tick; },
    arcade: () => ({
      round: 0,
      stunLeft: (id: number) => (id === 1 ? 60 : 0),
      rootLeft: () => 0,
      rootImmuneLeft: () => 0,
      mireLeft: (id: number) => (id === 0 ? 50 : 0),
      kbSpeed: () => 0,
      wallBounced: () => false,
    }),
    forEachCharacter: (f: (c: RenderCharacter) => void) => { for (const h of heroes) f(h); },
    forEachProjectile: () => undefined,
    forEachStatus: () => undefined,
  } as unknown as RenderView;
}

describe('cc view frame path', () => {
  it('stops creating Images after warm-up and holds the caps', () => {
    const f = fakeScene();
    const st = { tick: 100 };
    mountCcView(f.scene, fakeView(st), () => 0.5, () => false, () => false);
    for (let i = 0; i < 40; i++) { st.tick++; f.draw(); }
    const warm = f.images();
    expect(warm).toBeGreaterThan(0);
    expect(warm).toBeLessThanOrEqual(MAX_CC_PARTS_TOTAL);
    for (let i = 0; i < 300; i++) { st.tick++; f.draw(); }
    expect(f.images()).toBe(warm);
    expect(MAX_CC_SEGS_TOTAL).toBeGreaterThan(0);
  });
});

describe('cc view flash gate', () => {
  it('spaces break-out rings by at least 17 ticks per hero and at most 3 per second overall', () => {
    expect(FLASH_MIN_GAP_TICKS).toBe(17);
    const g = new FlashGate();
    expect(g.allow(0, 100)).toBe(true);
    expect(g.allow(0, 116)).toBe(false);
    expect(g.allow(0, 117)).toBe(true);
    let allowed = 0;
    const h = new FlashGate();
    for (let t = 0; t < 50; t++) if (h.allow(1, t)) allowed++;
    expect(allowed).toBeLessThanOrEqual(3);
  });
});
