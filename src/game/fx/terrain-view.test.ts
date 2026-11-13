import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { EntityFlag, SimEventKind, type RenderArcade, type RenderCharacter, type RenderView, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { MAX_SPARKS, SPARK_TICKS, SWAP_FLOOR } from './terrain-fx';
import { mountTerrainView, terrainState } from './terrain-view';

/** Minimal chainable emitter (on, once, off, emit) that counts its listeners. */
class Emitter {
  private readonly map = new Map<string, { fn: (...a: unknown[]) => void; once: boolean }[]>();
  on(name: string, fn: (...a: unknown[]) => void): this {
    this.map.set(name, [...(this.map.get(name) ?? []), { fn, once: false }]);
    return this;
  }
  once(name: string, fn: (...a: unknown[]) => void): this {
    this.map.set(name, [...(this.map.get(name) ?? []), { fn, once: true }]);
    return this;
  }
  off(name: string, fn: (...a: unknown[]) => void): this {
    this.map.set(name, (this.map.get(name) ?? []).filter((l) => l.fn !== fn));
    return this;
  }
  emit(name: string, ...args: unknown[]): void {
    const ls = this.map.get(name) ?? [];
    this.map.set(name, ls.filter((l) => !l.once));
    for (const l of ls) l.fn(...args);
  }
  get count(): number {
    let n = 0;
    for (const ls of this.map.values()) n += ls.length;
    return n;
  }
}

interface Fake {
  kind: string;
  visible: boolean;
  text: string;
  alpha: number;
  scale: number;
  texture: { key: string };
  destroyed: boolean;
  calls: string[];
}

/** A game object whose every setter chains; graphics record their draw calls (cleared by `clear`). */
function fakeObject(kind: string, made: Fake[], key = ''): Fake {
  const o: Fake = { kind, visible: true, text: '', alpha: 1, scale: 1, texture: { key }, destroyed: false, calls: [] };
  const record: Record<string, (...a: never[]) => void> = {
    setVisible: (v: boolean) => { o.visible = v; },
    setText: (t: string) => { o.text = t; },
    setAlpha: (a: number) => { o.alpha = a; },
    setScale: (s: number) => { o.scale = s; },
    setTexture: (k: string) => { o.texture = { key: k }; },
    clear: () => { o.calls = []; },
  };
  const proxy: Fake = new Proxy(o, {
    get(target, k: string) {
      if (k in target) return target[k as keyof Fake];
      if (k === 'height') return 30;
      if (k === 'width') return 100;
      if (k === 'destroy') return () => { o.destroyed = true; };
      return (...a: never[]) => {
        record[k]?.(...a);
        if (kind === 'graphics' && k !== 'setDepth' && k !== 'clear' && k !== 'setAlpha') o.calls.push(k);
        return proxy;
      };
    },
  });
  made.push(proxy);
  return proxy;
}

function fakeScene(textures: string[] = []): { scene: Phaser.Scene; events: Emitter; made: Fake[]; setActive: (a: boolean) => void; loads: string[]; layers: { data: number[][]; puts: number[][][] }[] } {
  const events = new Emitter();
  const made: Fake[] = [];
  const loads: string[] = [];
  const layers: { data: number[][]; puts: number[][][] }[] = [];
  let active = true;
  const scene = {
    events,
    cameras: { main: { midPoint: { x: 960 } } },
    scale: { width: 1280, displaySize: { width: 1280 } },
    sys: { isActive: () => active },
    textures: {
      exists: (k: string) => textures.includes(k),
      createCanvas: () => ({ getContext: () => null, refresh: () => undefined }),
      remove: () => undefined,
    },
    load: { image: (k: string) => { loads.push(k); }, start: () => undefined },
    make: {
      tilemap: ({ data }: { data: number[][] }) => {
        const rec = { data, puts: [] as number[][][] };
        layers.push(rec);
        const layer = fakeObject('layer', made);
        Object.assign(layer, { putTilesAt: (d: number[][]) => { rec.puts.push(d); return layer; } });
        return { addTilesetImage: () => ({}), createLayer: () => layer, destroy: () => undefined };
      },
    },
    add: {
      graphics: () => fakeObject('graphics', made),
      text: () => fakeObject('text', made),
      image: (_x: number, _y: number, key: string) => fakeObject('image', made, key),
    },
  } as unknown as Phaser.Scene;
  return { scene, events, made, setActive: (a) => { active = a; }, loads, layers };
}

let seq = 0;
const ev = (kind: number, tick: number, payload: Record<string, number> = {}): SimEvent =>
  ({ tick, sourceId: 0, kind: kind as SimEvent['kind'], seq: seq++, ...payload });

const BGS = ['bg:fire', 'bg:water', 'bg:earth', 'bg:air'];
const TILES = 'tilefloor';
/** Two patches: a 80x80 at (100, 300) and a 120x100 at (500, 320). */
const PATCHES = [100, 300, 80, 80, 500, 320, 120, 100];

function mount(opts: { reduceMotion?: boolean; stage?: number; element?: string; x?: number; y?: number; atlas?: boolean } = {}) {
  let tick = 100;
  const patches = new Array<number>(20).fill(0);
  PATCHES.forEach((v, i) => { patches[i] = v; });
  const arcade = { stage: opts.stage ?? 1, swapLeft: 0, swapTo: 0, patchCount: 2, patches } as unknown as RenderArcade;
  const hero = { id: 0, team: 0, flags: EntityFlag.alive, x: opts.x ?? 120 - 40, y: opts.y ?? 340 - 40, w: 80, h: 80, element: opts.element ?? 'fire' } as RenderCharacter;
  const view = {
    get tick() { return tick; },
    arcade: () => arcade,
    forEachCharacter: (visit: (c: RenderCharacter) => void) => { visit(hero); },
  } as unknown as RenderView;
  const arena = fakeScene(opts.atlas ? [...BGS, TILES] : BGS);
  const hud = fakeScene();
  const lines: Announcement[] = [];
  const prefs = { reduceMotion: opts.reduceMotion ?? false, highContrast: false };
  const consume = mountTerrainView(arena.scene, hud.scene, view, (l) => lines.push(l), () => prefs);
  const state = (): NonNullable<ReturnType<typeof terrainState>> => {
    const st = terrainState(arena.scene);
    if (!st) throw new Error('not mounted');
    return st;
  };
  return {
    arena, hud, arcade, hero, lines, prefs, state,
    feed: (t: number, events: SimEvent[] = []) => { tick = t; consume(events); },
    frame: (delta = 16) => { arena.events.emit('postupdate', 0, delta); },
  };
}

describe('terrain view (fake scenes)', () => {
  it('tile floor: requests the atlas when missing, builds one layer once it is there, re-fills it on a stage swap', () => {
    const missing = mount();
    missing.frame();
    expect(missing.arena.loads).toEqual([TILES, 'stagebg']); // the floor atlas and the stage backdrop atlas
    expect(missing.arena.layers).toHaveLength(0);

    const m = mount({ atlas: true });
    expect(m.arena.loads).toEqual(['stagebg']);
    m.frame();
    m.frame();
    expect(m.arena.layers).toHaveLength(1);
    const layer = m.arena.layers[0];
    expect(layer?.data).toHaveLength(17); // 23 rows less the 6 under the stage backdrop band (WALL_Y)
    expect(layer?.data[0]).toHaveLength(60); // 1920 / 32: the wide Arcade arena (WP 38d)
    expect(layer?.data.flat().every((v) => v >= 0 && v < 8)).toBe(true); // the fire row of the atlas
    expect(layer?.puts).toHaveLength(0);
    m.arcade.stage = 2;
    m.frame();
    m.frame();
    expect(m.arena.layers).toHaveLength(1);
    expect(layer?.puts).toHaveLength(1);
    expect(layer?.puts[0]?.flat().every((v) => v >= 8 && v < 16)).toBe(true); // the water row
  });

  it('draws each patch with its word, the stage backdrop and, for a fire hero in a fire patch, the FIRE x2 badge', () => {
    const m = mount();
    m.frame();
    expect(m.state()).toMatchObject({ stage: 1, patches: 2, labels: ['FIRE x2', 'FIRE x2'], backdrop: 'fire', badge: 'FIRE x2', alpha: 1 });
    expect(m.state().rects).toEqual(PATCHES);
    const floor = m.arena.made.filter((o) => o.kind === 'graphics')[1];
    expect(floor?.calls).toContain('strokePoints'); // the scorch cracks
    expect(m.arena.made.filter((o) => o.kind === 'image')[0]?.texture.key).toBe('bg:fire');
    // The badge is in the Hud scene.
    expect(m.hud.made.some((o) => o.kind === 'text' && o.text === 'FIRE x2' && o.visible)).toBe(true);
  });

  it('draws a distinct pattern per stage: flames, waves, bricks, swirls', () => {
    const calls: Record<number, string[]> = {};
    for (const stage of [1, 2, 3, 4]) {
      const m = mount({ stage, element: 'void' });
      m.frame();
      calls[stage] = [...new Set(m.arena.made.filter((o) => o.kind === 'graphics')[1]?.calls)].sort();
      expect(m.state().labels[0]).toBe(['FIRE x2', 'WATER +HP', 'ROCK', 'AIR x2'][stage - 1]);
      expect(m.state().badge).toBe(''); // a void hero gets nothing
    }
    expect(calls[1]).toContain('strokePoints'); // scorch cracks
    expect(calls[1]).not.toContain('strokeEllipse');
    expect(calls[2]).toContain('strokeEllipse'); // ripples
    expect(calls[2]).not.toContain('strokePoints');
    expect(calls[3]).toContain('lineBetween'); // facet edges and crystal glints of the rock props
    expect(calls[3]).toContain('fillPoints'); // crystal faces
    expect(calls[4]).toContain('strokePath'); // the swirl rune
    expect(calls[3]).not.toContain('strokePath'); // props are polygons and lines, not paths
  });

  it('the badge needs the stage element and the hero centre inside a patch; it follows the hero', () => {
    const m = mount({ x: 400, y: 100 });
    m.frame();
    expect(m.state().badge).toBe('');
    m.hero.x = 120 - 40;
    m.hero.y = 340 - 40;
    m.frame();
    expect(m.state().badge).toBe('FIRE x2');
    m.hero.element = 'water';
    m.frame();
    expect(m.state().badge).toBe('');
    m.hero.flags = EntityFlag.benched;
    m.hero.element = 'fire';
    m.frame();
    expect(m.state().badge).toBe('');
  });

  it('draws particles from a pool; reduced motion draws none and keeps patterns, words, badge and a steady glow', () => {
    const m = mount();
    m.frame();
    expect(m.state().particles).toBe(8);
    const before = m.arena.made.length + m.hud.made.length;
    for (let t = 101; t < 140; t++) {
      m.feed(t);
      m.frame();
    }
    expect(m.arena.made.length + m.hud.made.length).toBe(before); // nothing allocated per frame
    const r = mount({ reduceMotion: true });
    r.frame();
    expect(r.state()).toMatchObject({ particles: 0, labels: ['FIRE x2', 'FIRE x2'], badge: 'FIRE x2', glow: 1 });
  });

  it('a pending swap fades the old patches and fades the next backdrop in; the landing fades the new layout in', () => {
    const m = mount();
    m.frame();
    m.feed(101, [ev(SimEventKind.terrainSwap, 101, { stage: 2, ticks: 30 })]);
    m.arcade.swapLeft = 15;
    m.arcade.swapTo = 2;
    m.frame();
    expect(m.state().alpha).toBeCloseTo(1 - (1 - SWAP_FLOOR) / 2);
    expect(m.state().nextBackdrop).toBe(0.5);
    expect(m.lines.at(-1)?.text).toBe('The stage will turn to water.');
    // Lands: a new stage and layout.
    m.arcade.swapLeft = 0;
    m.arcade.stage = 2;
    m.arcade.patches[0] = 300;
    m.feed(131, [ev(SimEventKind.terrainChanged, 131, { stage: 2, count: 2 })]);
    m.frame();
    expect(m.state()).toMatchObject({ stage: 2, backdrop: 'water', nextBackdrop: 0 });
    expect(m.state().alpha).toBeCloseTo(SWAP_FLOOR, 1);
    expect(m.lines.at(-1)?.text).toBe('The stage turns to water.');
    m.feed(161);
    m.frame(0);
    expect(m.state().alpha).toBe(1);
    expect(m.state().rects[0]).toBe(300);
    // Reduced motion: held at half during the telegraph, no backdrop crossfade.
    const r = mount({ reduceMotion: true });
    r.arcade.swapLeft = 10;
    r.arcade.swapTo = 3;
    r.frame();
    expect(r.state()).toMatchObject({ alpha: 0.5, nextBackdrop: 0 });
  });

  it('earth rocks draw as props with no on-canvas text, but the labels stay in the state', () => {
    const m = mount({ stage: 3, element: 'void' });
    m.frame();
    expect(m.state().labels).toEqual(['ROCK', 'ROCK']);
    expect(m.arena.made.filter((o) => o.kind === 'text').every((o) => !o.visible)).toBe(true);
  });

  it('a blocked shot sparks (static with reduced motion) for SPARK_TICKS and says "Rock blocks the shot."', () => {
    for (const reduceMotion of [false, true]) {
      const m = mount({ stage: 3, reduceMotion });
      m.feed(110, [ev(SimEventKind.projectileBlocked, 110, { x: 300, y: 300 })]);
      m.frame();
      expect(m.state().sparks).toBe(1);
      expect(m.lines.at(-1)?.text).toBe('Rock blocks the shot.');
      m.feed(110 + SPARK_TICKS + 1);
      m.frame(0);
      expect(m.state().sparks).toBe(0);
    }
    // The ring of spark slots overwrites the oldest.
    const m = mount({ stage: 3 });
    for (let i = 0; i < MAX_SPARKS + 3; i++) m.feed(110, [ev(SimEventKind.projectileBlocked, 110, { x: i, y: i })]);
    m.frame();
    expect(m.state().sparks).toBe(MAX_SPARKS);
  });

  it('a water heal pulses the badge; a stage swap landing on a new layout and a same-stage redraw both keep it up', () => {
    const m = mount({ stage: 2, element: 'water' });
    m.frame();
    expect(m.state().badge).toBe('HEAL');
    m.feed(105, [ev(SimEventKind.patchHeal, 105, { amount: 1 })]);
    m.frame();
    const badge = m.hud.made.find((o) => o.kind === 'text');
    expect(badge?.scale).toBeGreaterThan(1);
    m.feed(140, [ev(SimEventKind.patchEntered, 140, { team: 0, stage: 2 }), ev(SimEventKind.patchLeft, 140, { team: 1, stage: 2 })]);
    m.feed(141, [ev(SimEventKind.terrainChanged, 141, { stage: 2, count: 2 })]);
    m.frame(0);
    expect(m.state().alpha).toBe(1);
  });

  it('waits for the Hud, skips a missing backdrop texture, and tears everything down with no listeners left', () => {
    const m = mount();
    m.hud.setActive(false);
    m.frame();
    expect(terrainState(m.arena.scene)?.stage).toBe(0); // nothing drawn before the Hud runs
    m.hud.setActive(true);
    m.arena.scene.textures.exists = () => false;
    m.frame();
    expect(m.state().backdrop).toBe('');
    expect(m.arena.events.count).toBeGreaterThan(0);
    m.arena.events.emit('shutdown');
    expect(terrainState(m.arena.scene)).toBeUndefined();
    expect(m.arena.events.count).toBe(0);
    expect(m.hud.events.count).toBe(0);
    expect([...m.arena.made, ...m.hud.made].every((o) => o.destroyed)).toBe(true);
    // Teardown through the Hud, and a destroy event, work too.
    const n = mount();
    n.frame();
    n.hud.events.emit('destroy');
    expect(n.arena.events.count).toBe(0);
  });

  it('refreshes the motion pref once a second', () => {
    const m = mount();
    m.frame();
    m.prefs.reduceMotion = true;
    m.feed(150);
    m.frame();
    expect(m.state().particles).toBe(0);
  });
});
