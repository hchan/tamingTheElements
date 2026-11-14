import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SimEventKind, WEATHER_CHARGE_FULL, WEATHER_TICKS, Weather, type RenderArcade, type RenderView, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { CALL_TICKS, PARTICLE_COUNTS, SKY_TINTS, TINT_RAMP_TICKS } from './weather-fx';
import { mountWeatherView, weatherState } from './weather-view';

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
  width: number;
  height: number;
  scale: number;
  destroyed: boolean;
  calls: string[];
  alpha: number;
}

/** A game object whose every setter chains; graphics record their draw calls (cleared by `clear`). */
function fakeObject(kind: string, made: Fake[]): Fake {
  const o: Fake = { kind, visible: true, text: '', width: 0, height: 34, scale: 1, destroyed: false, calls: [], alpha: 1 };
  const record: Record<string, (...a: never[]) => void> = {
    setVisible: (v: boolean) => { o.visible = v; },
    setText: (t: string) => { o.text = t; o.width = t.length * 17; },
    setScale: (s: number) => { o.scale = s; },
    clear: () => { o.calls = []; },
    setAlpha: (a: number) => { o.alpha = a; },
  };
  const proxy: Fake = new Proxy(o, {
    get(target, key: string) {
      if (key in target) return target[key as keyof Fake];
      if (key === 'destroy') return () => { o.destroyed = true; };
      return (...a: never[]) => {
        record[key]?.(...a);
        if (kind === 'graphics' && key !== 'setDepth' && key !== 'clear') o.calls.push(key);
        return proxy;
      };
    },
  });
  made.push(proxy);
  return proxy;
}

const reg = new Map<string, unknown>();

function fakeScene(): { scene: Phaser.Scene; events: Emitter; made: Fake[] } {
  const events = new Emitter();
  const made: Fake[] = [];
  const scene = {
    events,
    registry: { get: (k: string) => reg.get(k) },
    scale: { width: 1280, displaySize: { width: 1280 } },
    sys: { isActive: () => true },
    textures: { exists: () => true },
    // Particle emitters are not counted with the Graphics and Texts (see weather-particles.test.ts for their rules).
    add: { graphics: () => fakeObject('graphics', made), text: () => fakeObject('text', made), particles: () => fakeObject('particles', []) },
  } as unknown as Phaser.Scene;
  return { scene, events, made };
}

let seq = 0;
const changed = (tick: number, weather: number, prev: number, team: number): SimEvent =>
  ({ tick, sourceId: 0, kind: SimEventKind.weatherChanged, seq: seq++, weather, prev, team });
const ended = (tick: number, weather: number): SimEvent => ({ tick, sourceId: -1, kind: SimEventKind.weatherEnded, seq: seq++, weather });

function mount(opts: { reduceMotion?: boolean; highContrast?: boolean; weather?: number } = {}) {
  let tick = 100;
  const arcade = { weather: opts.weather ?? 0, weatherLeft: opts.weather ? WEATHER_TICKS : 0, weatherCharge: [0, 0] } as RenderArcade;
  const view = { get tick() { return tick; }, arcade: () => arcade, forEachCharacter: () => undefined } as unknown as RenderView;
  const arena = fakeScene();
  const hud = fakeScene();
  const lines: Announcement[] = [];
  const prefs = { reduceMotion: opts.reduceMotion ?? false, highContrast: opts.highContrast ?? false };
  const consume = mountWeatherView(arena.scene, hud.scene, view, (l) => lines.push(l), () => prefs);
  const state = (): NonNullable<ReturnType<typeof weatherState>> => {
    const st = weatherState(arena.scene);
    if (!st) throw new Error('not mounted');
    return st;
  };
  return {
    arena, hud, arcade, lines, prefs, state,
    /** Sim tick `t`: the read-outs as set, then the tick's events. */
    feed: (t: number, events: SimEvent[] = []) => { tick = t; consume(events); },
    frame: (delta = 16) => { arena.events.emit('postupdate', 0, delta); },
    /** Casts weather `kind` at tick `t` (the read-out and the event, as the sim would). */
    cast(t: number, kind: number, team = 0) {
      const prev = arcade.weather;
      arcade.weather = kind;
      arcade.weatherLeft = WEATHER_TICKS;
      tick = t;
      consume([changed(t, kind, prev, team)]);
    },
  };
}

describe('weather charge chip (WP-arcade-weather-charge)', () => {
  it('shows team 0 charge as "WEATHER n%" with a proportional bar, and "WEATHER READY" when full', () => {
    const m = mount();
    m.frame();
    expect(m.state()).toMatchObject({ charge: 0, chargeText: 'WEATHER 0%', chargeFill: 0 });
    m.arcade.weatherCharge[0] = 600;
    m.arcade.weatherCharge[1] = 900;
    m.frame();
    expect(m.state()).toMatchObject({ charge: 600, chargeText: 'WEATHER 60%', chargeFill: 78 });
    m.arcade.weatherCharge[0] = 999;
    m.frame();
    expect(m.state().chargeText).toBe('WEATHER 99%');
    m.arcade.weatherCharge[0] = WEATHER_CHARGE_FULL;
    m.frame();
    expect(m.state()).toMatchObject({ chargeText: 'WEATHER READY', chargeFill: 130 });
    m.arcade.weatherCharge[0] = 0;
    m.frame();
    expect(m.state().chargeText).toBe('WEATHER 0%');
  });

  it('draws with no weather up and with reduced motion (nothing animates but the READY blink, which goes steady)', () => {
    for (const reduceMotion of [false, true]) {
      const m = mount({ reduceMotion });
      m.arcade.weatherCharge[0] = WEATHER_CHARGE_FULL;
      m.frame();
      for (let t = 100; t < 160; t += 5) {
        m.feed(t);
        m.frame();
        expect(m.state().chargeText).toBe('WEATHER READY');
      }
    }
  });
});

describe('weather view: objects, badge, tint and particles', () => {
  it('makes two Arena Graphics and, in the Hud, two Graphics and three Texts on the first frame (the charge chip), then reuses them', () => {
    const m = mount();
    expect(m.arena.made.length + m.hud.made.length).toBe(0);
    m.frame();
    expect(m.arena.made.map((o) => o.kind)).toEqual(['graphics', 'graphics']);
    expect(m.hud.made.map((o) => o.kind)).toEqual(['graphics', 'text', 'text', 'graphics', 'text']);
    expect(m.state()).toMatchObject({ kind: 0, label: '', fill: 0, tint: 0, particles: 0, call: '' });
    m.cast(100, Weather.rain);
    m.frame();
    expect(m.state()).toMatchObject({ kind: Weather.rain, label: 'RAIN 10', call: 'Rain!', particles: PARTICLE_COUNTS[1] });
    expect(m.state().fill).toBeGreaterThan(0);
    // Every other weather reuses the same five objects.
    for (const kind of [Weather.sun, Weather.sandstorm, Weather.gale, Weather.eclipse]) {
      m.cast(200 + kind, kind, 1);
      m.frame();
      expect(m.state()).toMatchObject({ kind, particles: PARTICLE_COUNTS[kind - 1] });
    }
    expect(m.arena.made.length + m.hud.made.length).toBe(7);
  });
  it('fades the tint in after the cast, counts the badge down with its bar, and fades out near the end', () => {
    const m = mount();
    m.cast(100, Weather.sandstorm);
    m.frame(0);
    expect(m.state().tint).toBe(0);
    m.feed(100 + TINT_RAMP_TICKS);
    m.arcade.weatherLeft = WEATHER_TICKS - TINT_RAMP_TICKS;
    m.frame();
    const full = SKY_TINTS[2][1];
    expect(m.state().tint).toBe(full);
    const fill = m.state().fill;
    expect(m.state().label).toBe('SAND 10');
    m.feed(400);
    m.arcade.weatherLeft = 10;
    m.frame();
    expect(m.state()).toMatchObject({ label: 'SAND 1' });
    expect(m.state().fill).toBeLessThan(fill);
    expect(m.state().tint).toBeCloseTo((full * 10) / TINT_RAMP_TICKS, 9);
    // The sky Graphics is one full-arena rectangle; the particles draw into the other.
    const [sky, fall] = m.arena.made;
    expect(sky?.calls).toEqual(['fillStyle', 'fillRect']);
    expect(fall?.calls.filter((c) => c === 'fillCircle')).toHaveLength(2 * PARTICLE_COUNTS[2]);
  });
  it('draws each weather with its own glyph and particle shape (rays, streaks, grains, motes)', () => {
    const shapes: Record<number, string> = {};
    for (const kind of [Weather.sun, Weather.rain, Weather.sandstorm, Weather.gale, Weather.eclipse]) {
      const m = mount({ highContrast: kind === Weather.eclipse });
      m.cast(100, kind);
      m.frame();
      const [, fall] = m.arena.made;
      const [badge] = m.hud.made;
      shapes[kind] = [...new Set(fall?.calls.filter((c) => c.startsWith('fill') && c !== 'fillStyle'))].join() + ' / '
        + [...new Set(fall?.calls.filter((c) => c === 'lineBetween'))].join();
      expect(badge?.calls).toContain('fillRect');
      expect(badge?.calls).toContain('strokeRect');
    }
    expect(shapes).toEqual({
      1: 'fillTriangle / ', 2: ' / lineBetween', 3: 'fillCircle / ', 4: ' / lineBetween', 5: 'fillCircle / ',
    });
  });
  it('the called line scales in, fades and hides after CALL_TICKS; the badge stays', () => {
    const m = mount();
    m.cast(100, Weather.gale);
    m.frame();
    expect(m.state().callScale).toBeGreaterThan(1);
    m.feed(130);
    m.frame();
    expect(m.state()).toMatchObject({ call: 'Gale!', callScale: 1 });
    m.feed(100 + CALL_TICKS);
    m.frame();
    expect(m.state()).toMatchObject({ call: '', kind: Weather.gale, label: 'GALE 10' });
  });
  it('a weather that ends clears the tint, particles and badge, and the line says so', () => {
    const m = mount();
    m.cast(100, Weather.eclipse, 1);
    m.frame();
    m.arcade.weather = 0;
    m.arcade.weatherLeft = 0;
    m.feed(600, [ended(600, Weather.eclipse)]);
    m.frame();
    expect(m.state()).toMatchObject({ kind: 0, label: '', tint: 0, particles: 0, call: '' });
    expect(m.lines.map((l) => l.text)).toEqual(['The enemy called Eclipse: void hits harder.', 'The Eclipse is over.']);
    const [sky, fall] = m.arena.made;
    expect(sky?.calls).toEqual([]);
    expect(fall?.calls).toEqual([]);
    expect(m.hud.made[1]?.visible).toBe(false);
  });
  it('a weather already up at mount shows at once (no called line, full tint), as in a replay that seeks', () => {
    const m = mount({ weather: Weather.sun });
    m.frame();
    expect(m.state()).toMatchObject({ kind: Weather.sun, label: 'SUN 10', call: '', tint: SKY_TINTS[0][1] });
  });
});

describe('weather view: reduced motion', () => {
  it('keeps the badge, the line (full size) and a steady tint, and draws no particles', () => {
    const m = mount({ reduceMotion: true });
    m.cast(100, Weather.rain);
    m.frame();
    expect(m.state()).toMatchObject({ kind: Weather.rain, label: 'RAIN 10', call: 'Rain!', callScale: 1, particles: 0, tint: SKY_TINTS[1][1] });
    expect(m.arena.made[1]?.calls).toEqual([]);
  });
  it('picks up a change of the setting within a second', () => {
    const m = mount();
    m.cast(100, Weather.rain);
    m.frame();
    expect(m.state().particles).toBe(PARTICLE_COUNTS[1]);
    m.prefs.reduceMotion = true;
    m.feed(150);
    m.frame();
    expect(m.state().particles).toBe(0);
  });
});

describe('weather view: view time', () => {
  it('runs on between ticks by frame time, capped under one tick, so effects hold while the sim is paused', () => {
    const m = mount();
    m.cast(100, Weather.gale);
    const base = SKY_TINTS[3][1];
    m.frame(0);
    expect(m.state().tint).toBe(0);
    m.frame(10);
    expect(m.state().tint).toBeCloseTo((base * 0.5) / TINT_RAMP_TICKS, 9);
    for (let i = 0; i < 10; i++) m.frame(30);
    expect(m.state().tint).toBeCloseTo((base * 19) / 20 / TINT_RAMP_TICKS, 9);
    // The next tick restarts the frame time.
    m.feed(101);
    m.frame(16);
    expect(m.state().tint).toBeCloseTo(base / TINT_RAMP_TICKS, 9);
  });
});

describe('weather view: teardown', () => {
  for (const [scene, how] of [['arena', 'shutdown'], ['arena', 'destroy'], ['hud', 'shutdown'], ['hud', 'destroy']] as const) {
    it(`leaves no listener and no object after the ${scene}'s ${how}`, () => {
      const m = mount();
      m.cast(100, Weather.sun);
      m.frame();
      expect(m.arena.events.count).toBe(3);
      expect(m.hud.events.count).toBe(2);
      m[scene].events.emit(how);
      expect(m.arena.events.count + m.hud.events.count).toBe(0);
      expect([...m.arena.made, ...m.hud.made].every((o) => o.destroyed)).toBe(true);
      expect(weatherState(m.arena.scene)).toBeUndefined();
    });
  }
  it('a view torn down before any weather holds no listener and destroys what it made', () => {
    const m = mount();
    m.arena.events.emit('destroy');
    expect(m.arena.events.count + m.hud.events.count).toBe(0);
    expect(weatherState(m.arena.scene)).toBeUndefined();
  });
});

describe('super banner overlap', () => {
  it('hides the badge, chip and called line while the high super band is up, then shows them again', () => {
    const m = mount({ weather: 2 });
    const alphas = (): number[] => m.hud.made.map((f) => f.alpha);
    m.frame();
    expect(m.hud.made.length).toBeGreaterThan(0);
    reg.set('tte.band', true);
    m.frame();
    expect(alphas().filter((a) => a !== 0)).toEqual([]);
    reg.set('tte.band', false);
    m.frame();
    expect(alphas()).toContain(1);
    expect(alphas().filter((a) => a === 0)).toEqual([]);
  });
});
