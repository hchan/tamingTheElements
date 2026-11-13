import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import {
  EntityFlag, GUARD_MAX, SimEventKind, SnagEvent, type RenderArcade, type RenderCharacter, type RenderProjectile, type RenderView, type SimEvent,
} from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { AFTERIMAGE_FADE, BREAK_WORD, FREED_WORD, LINES, PARRY_WORD, POP_TICKS, ROOTED_WORD } from './defence-fx';
import { defenceState, mountDefenceView, type Fighters } from './defence-view';

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
  x: number;
  y: number;
  destroyed: boolean;
  calls: string[];
}

/** A game object whose every setter chains; the ones the view reads back are recorded. */
function fakeObject(kind: string, made: Fake[]): Fake {
  const o: Fake = { kind, visible: true, text: '', alpha: 1, x: 0, y: 0, destroyed: false, calls: [] };
  const record: Record<string, (...a: never[]) => void> = {
    setVisible: (v: boolean) => { o.visible = v; },
    setText: (t: string) => { o.text = t; },
    setAlpha: (a: number) => { o.alpha = a; },
    setPosition: (x: number, y: number) => { o.x = x; o.y = y; },
    clear: () => { o.calls = []; },
  };
  const proxy: Fake = new Proxy(o, {
    get(target, key: string) {
      if (key in target) return target[key as keyof Fake];
      if (key === 'destroy') return () => { o.destroyed = true; };
      return (...a: never[]) => {
        record[key]?.(...a);
        if (kind === 'graphics' && key !== 'setDepth') o.calls.push(key);
        return proxy;
      };
    },
  });
  made.push(proxy);
  return proxy;
}

function fakeScene(): { scene: Phaser.Scene; events: Emitter; made: Fake[] } {
  const events = new Emitter();
  const made: Fake[] = [];
  const scene = {
    events,
    scale: { width: 1280 },
    add: { graphics: () => fakeObject('graphics', made), image: () => fakeObject('image', made), text: () => fakeObject('text', made) },
  } as unknown as Phaser.Scene;
  return { scene, events, made };
}

const fighter = (id: number, team: number, x: number): RenderCharacter => ({
  id, team, sprite: 'pax', dir: 0, flags: EntityFlag.alive, x, y: 300, px: x, py: 300, w: 80, h: 80, hp: 100, maxHp: 100, restCap: 100,
  element: team === 0 ? 'earth' : 'fire',
});

/** Two fighters (ids 0 and 1), a list of projectiles, and the guard read-outs the test sets. */
function world(): {
  view: RenderView; fighters: Fighters; chars: RenderCharacter[]; projs: RenderProjectile[]; guard: number[]; guarding: boolean[];
  rooted: boolean[]; setTick: (t: number) => void;
} {
  let tick = 100;
  const chars = [fighter(0, 0, 200), fighter(1, 1, 800)];
  const projs: RenderProjectile[] = [];
  const guard = [GUARD_MAX, GUARD_MAX];
  const guarding = [false, false];
  const rooted = [false, false];
  const arcade = {
    guard: (id: number) => guard[id] ?? 0, guarding: (id: number) => guarding[id] ?? false, rooted: (id: number) => rooted[id] ?? false,
  } as unknown as RenderArcade;
  const view = {
    get tick() { return tick; },
    arcade: () => arcade,
    forEachCharacter: (visit: (c: RenderCharacter) => void) => { for (const c of chars) visit(c); },
    forEachProjectile: (visit: (p: RenderProjectile) => void) => { for (const p of projs) visit(p); },
  } as unknown as RenderView;
  const images = chars.map((c) => ({
    x: c.x, y: c.y, displayWidth: c.w, displayHeight: c.h, visible: true, texture: { key: 'map:pax' }, frame: { name: 'right0' }, flipX: false,
  }));
  const fighters: Fighters = { peek: (id) => (images[id] ? { image: images[id] as unknown as Phaser.GameObjects.Image } : undefined) };
  return { view, fighters, chars, projs, guard, guarding, rooted, setTick: (t) => { tick = t; } };
}

/** Events with a fresh seq each (the sim numbers a tick's events from 0; the view skips repeats by tick and seq). */
let seq = 0;
const ev = (kind: number, tick: number, sourceId: number, payload: Record<string, number> = {}): SimEvent =>
  ({ tick, sourceId, kind: kind as SimEvent['kind'], seq: seq++, ...payload });

function mount(reduceMotion = false): ReturnType<typeof world> & ReturnType<typeof fakeScene> & {
  feed: (tick: number, events?: SimEvent[]) => void; frame: () => void; lines: Announcement[];
} {
  const w = world();
  const s = fakeScene();
  const lines: Announcement[] = [];
  const consume = mountDefenceView(s.scene, w.view, (l) => lines.push(l), () => ({ reduceMotion, highContrast: false }), w.fighters);
  return {
    ...w, ...s, lines,
    feed: (tick, events = []) => { w.setTick(tick); consume(events); },
    frame: () => { s.events.emit('postupdate', 0, 16); },
  };
}

const state = (scene: Phaser.Scene): NonNullable<ReturnType<typeof defenceState>> => {
  const st = defenceState(scene);
  if (!st) throw new Error('not mounted');
  return st;
};

describe('defence view: guard shield and guard bar', () => {
  it('draws nothing at a full meter, the bar while it refills, and the shield with the bar while guarding', () => {
    const m = mount();
    m.frame();
    expect(state(m.scene)).toMatchObject({ shields: 0, bars: [] });
    m.guard[1] = 400;
    m.frame();
    expect(state(m.scene)).toMatchObject({ shields: 0, bars: [400] });
    m.guarding[0] = true;
    m.frame();
    expect(state(m.scene)).toMatchObject({ shields: 1, bars: [GUARD_MAX, 400] });
    // A benched or dead fighter (or one with no drawn sprite) has neither.
    m.chars[0] = { ...fighter(0, 0, 200), flags: EntityFlag.alive | EntityFlag.benched };
    m.frame();
    expect(state(m.scene)).toMatchObject({ shields: 0, bars: [400] });
  });
});

describe('defence view: dash afterimages and projectile trails', () => {
  it('samples the dasher every 2 ticks into three reused images, then fades them out after the dash', () => {
    const m = mount();
    m.feed(100, [ev(SimEventKind.dashed, 100, 0, { dir: 0 })]);
    m.frame();
    expect(state(m.scene).ghosts).toBe(1);
    for (let t = 101; t <= 112; t++) {
      m.chars[0] = { ...fighter(0, 0, 200 + (t - 100) * 15) };
      m.feed(t);
    }
    m.frame();
    expect(state(m.scene).ghosts).toBe(3);
    const images = m.made.filter((o) => o.kind === 'image');
    expect(images).toHaveLength(3);
    // The newest afterimage sits where the dasher was on the last sampling tick.
    expect(images.map((o) => o.x)).toContain(200 + 12 * 15 - 40); // grown 2x about the feet centre
    m.feed(112 + AFTERIMAGE_FADE);
    m.frame();
    expect(state(m.scene).ghosts).toBe(0);
    // A second dash reuses the same three images.
    m.feed(200, [ev(SimEventKind.dashed, 200, 0, { dir: 0 })]);
    m.frame();
    expect(m.made.filter((o) => o.kind === 'image')).toHaveLength(3);
  });
  it('trails a projectile with three dots 2, 4 and 6 ticks back, restarts a new one, and draws none with reduced motion', () => {
    for (const reduced of [false, true]) {
      const m = mount(reduced);
      m.projs.push({ id: 5, team: 1, sprite: 'fire', dir: 4, x: 700, y: 320, px: 700, py: 320, w: 30, h: 20 });
      for (let t = 101; t <= 108; t++) {
        const p = m.projs[0];
        if (p) p.x -= 20;
        m.feed(t);
        if (t === 103) {
          m.frame();
          expect(state(m.scene).trails).toBe(reduced ? 0 : 1);
        }
      }
      m.frame();
      expect(state(m.scene)).toMatchObject({ trails: reduced ? 0 : 3, projectiles: 1 });
      // The slot is reused by a new projectile after a gap: its trail starts empty.
      m.feed(110);
      m.frame();
      expect(state(m.scene).trails).toBe(0);
    }
  });
});

describe('defence view: parry and guard-break effects', () => {
  it('a parry flashes, pings and pops over the parrier, sparks the reflected projectile and speaks; all expire', () => {
    const m = mount();
    m.projs.push({ id: 7, team: 0, sprite: 'fire', dir: 0, x: 260, y: 320, px: 260, py: 320, w: 30, h: 20 });
    m.feed(100, [ev(SimEventKind.parried, 100, 7, { target: 0, attacker: 1, reflected: 1 })]);
    m.frame();
    expect(state(m.scene)).toMatchObject({ rings: 2, sparks: 8, pops: [PARRY_WORD] });
    expect(m.lines).toEqual([LINES.parryMine]);
    m.feed(100 + POP_TICKS);
    m.frame();
    expect(state(m.scene)).toMatchObject({ rings: 0, sparks: 0, pops: [] });
  });
  it('a guard break shatters into shards, rings and pops GUARD BREAK; a vanished target gets no effect', () => {
    const m = mount();
    m.feed(100, [ev(SimEventKind.guardBroken, 100, 9, { target: 1 }), ev(SimEventKind.guarded, 100, 9, { target: 42 })]);
    m.frame();
    expect(state(m.scene)).toMatchObject({ rings: 1, sparks: 14, pops: [BREAK_WORD] });
    expect(m.lines).toEqual([LINES.breakFoe]);
  });
  it('pools stay bounded: many events reuse four texts, at most 64 sparks and 8 rings', () => {
    const m = mount();
    for (let t = 100; t < 140; t++) {
      m.feed(t, [ev(SimEventKind.guardBroken, t, 9, { target: t % 2 }), ev(SimEventKind.perfectDodge, t, t % 2)]);
    }
    m.frame();
    const st = state(m.scene);
    expect(st.sparks).toBeLessThanOrEqual(64);
    expect(st.rings).toBeLessThanOrEqual(8);
    expect(m.made.filter((o) => o.kind === 'text')).toHaveLength(4);
    expect(m.made.filter((o) => o.kind === 'graphics')).toHaveLength(2);
  });
});

describe('defence view: Snag root (FUN-DESIGN 2.20)', () => {
  it('a rooted fighter gets rope loops while rooted; the rooted event rings and pops ROOTED, freed pops FREE', () => {
    const m = mount();
    m.rooted[1] = true;
    m.feed(100, [ev(SimEventKind.snag, 100, 0, { id: 1, reason: SnagEvent.rooted })]);
    m.frame();
    expect(state(m.scene)).toMatchObject({ roots: 1, rings: 1, pops: [ROOTED_WORD] });
    expect(m.lines.map((l) => l.text)).toEqual(['Enemy rooted.']);
    m.rooted[1] = false;
    m.feed(100 + POP_TICKS, [ev(SimEventKind.snag, 100 + POP_TICKS, 4, { id: 1, reason: SnagEvent.freed })]);
    m.frame();
    expect(state(m.scene)).toMatchObject({ roots: 0, pops: [FREED_WORD] });
    expect(state(m.scene).sparks).toBeGreaterThan(0);
  });
  it('a guarded throw only sparks; an expiry draws nothing', () => {
    const m = mount();
    m.feed(100, [ev(SimEventKind.snag, 100, 1, { id: 0, reason: SnagEvent.guarded }), ev(SimEventKind.snag, 100, 1, { id: 1, reason: SnagEvent.expired })]);
    m.frame();
    expect(state(m.scene)).toMatchObject({ roots: 0, rings: 0, pops: [] });
    expect(state(m.scene).sparks).toBeGreaterThan(0);
    expect(m.lines).toEqual([]);
  });
});

describe('defence view: teardown', () => {
  for (const how of ['shutdown', 'destroy']) {
    it(`leaves no listener and no object after the Arena's ${how}`, () => {
      const m = mount();
      m.feed(100, [ev(SimEventKind.dashed, 100, 0), ev(SimEventKind.parried, 100, 0, { target: 1, reflected: 0 })]);
      m.frame();
      // Its own postupdate, shutdown and destroy, and the same three of the clash burst it mounts (clash-view.ts).
      expect(m.events.count).toBe(6);
      m.events.emit(how);
      expect(m.events.count).toBe(0);
      expect(m.made.every((o) => o.destroyed)).toBe(true);
      expect(defenceState(m.scene)).toBeUndefined();
    });
  }
});
