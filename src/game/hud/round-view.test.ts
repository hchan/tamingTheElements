import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { RoundPhase, SimEventKind, type RenderArcade, type RenderView, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { defenceState } from '../fx/defence-view';
import { weatherState } from '../fx/weather-view';
import { mountRoundView, roundState } from './round-view';

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

interface FakeObject {
  text: string;
  visible: boolean;
  scale: number;
  color: string;
  destroyed: boolean;
}

function fakeScene(active: boolean): { scene: Phaser.Scene; events: Emitter; made: FakeObject[]; setActive: (a: boolean) => void } {
  const events = new Emitter();
  const made: FakeObject[] = [];
  let isActive = active;
  const obj = (): FakeObject & Record<string, unknown> => {
    const o: FakeObject & Record<string, unknown> = { text: '', visible: true, scale: 1, color: '', destroyed: false };
    const chain = (f?: (...a: never[]) => void) => (...a: never[]) => { f?.(...a); return o; };
    Object.assign(o, {
      setOrigin: chain(), setDepth: chain(), clear: chain(), fillStyle: chain(), fillCircle: chain(), lineStyle: chain(),
      strokeCircle: chain(),
      setText: chain((t: string) => { o.text = t; }),
      setVisible: chain((v: boolean) => { o.visible = v; }),
      setScale: chain((s: number) => { o.scale = s; }),
      setColor: chain((c: string) => { o.color = c; }),
      destroy: () => { o.destroyed = true; },
    });
    made.push(o);
    return o;
  };
  const scene = {
    events,
    scale: { width: 1280, displaySize: { width: 1280 } },
    sys: { isActive: () => isActive },
    add: { text: obj, graphics: obj },
  } as unknown as Phaser.Scene;
  return { scene, events, made, setActive: (a) => { isActive = a; } };
}

function fakeView(): { view: RenderView; arcade: RenderArcade; setTick: (t: number) => void } {
  let tick = 0;
  const arcade = {
    frozen: false, comboHits: [0, 0], comboDamage: [0, 0], meter: [0, 0], round: 0, phase: RoundPhase.intro, timer: 0,
    roundsWon: [0, 0], stunned: () => false, invulnerable: () => false, aim: () => 0, guard: () => 1000, guarding: () => false, weather: 0, weatherLeft: 0,
  } as RenderArcade;
  const view = { get tick() { return tick; }, arcade: () => arcade } as unknown as RenderView;
  return { view, arcade, setTick: (t) => { tick = t; } };
}

const ev = (tick: number, kind: number, seq: number, payload: Record<string, number> = {}): SimEvent =>
  ({ ...payload, tick, sourceId: 0, kind, seq }) as SimEvent;

const prefs = (reduceMotion: boolean) => () => ({ reduceMotion, highContrast: false });

describe('round view (Phaser side, fake scenes)', () => {
  it('waits for the Hud create, draws the timer, pips and banner from pooled objects, and tears down to 0 listeners', () => {
    const arena = fakeScene(true);
    const hud = fakeScene(false);
    const v = fakeView();
    const lines: Announcement[] = [];
    const feed = mountRoundView(arena.scene, hud.scene, v.view, (l) => lines.push(l), prefs(false));
    expect(hud.made).toHaveLength(0);
    hud.setActive(true);
    hud.events.emit('create');
    expect(hud.made).toHaveLength(4);
    expect(roundState(hud.scene)).toMatchObject({ main: 'ROUND 1', visible: true, timer: '90', won: [0, 0], scale: 2 });

    // Round 0 (before the first tick) has no timer yet: the full one is shown.
    v.setTick(1);
    Object.assign(v.arcade, { round: 1, timer: 4500 });
    feed([ev(1, SimEventKind.roundStarted, 0, { round: 1 })]);
    v.setTick(31);
    hud.events.emit('update');
    expect(roundState(hud.scene)).toMatchObject({ main: 'ROUND 1', scale: 1 });
    v.setTick(91);
    v.arcade.phase = RoundPhase.fight;
    feed([ev(91, SimEventKind.fight, 0)]);
    v.arcade.timer = 450;
    hud.events.emit('update');
    expect(roundState(hud.scene)).toMatchObject({ main: 'FIGHT!', visible: true, timer: '09' });
    expect(hud.made[2]?.color).toBe('#ff8080');
    v.setTick(91 + 50);
    hud.events.emit('update');
    expect(roundState(hud.scene)?.visible).toBe(false);
    v.arcade.roundsWon[0] = 1;
    feed([ev(200, SimEventKind.ko, 0, { team: 1, perfect: 0 }), ev(350, SimEventKind.roundEnded, 0, { winner: 0, won0: 1, won1: 0 })]);
    v.setTick(350);
    hud.events.emit('update');
    expect(roundState(hud.scene)).toMatchObject({ main: 'K.O.', sub: 'YOU WIN ROUND 1', visible: true, won: [1, 0] });
    expect(hud.made[1]).toMatchObject({ text: 'YOU WIN ROUND 1', visible: true });
    expect(lines.map((l) => l.text)).toEqual(['Round 1.', 'Fight!', 'K.O. You knocked out the enemy.', 'You win round 1. Rounds 1 to 0.']);
    // Still the same four objects: nothing is made per frame or per banner.
    expect(hud.made).toHaveLength(4);

    arena.events.emit('shutdown');
    expect(arena.events.count).toBe(0);
    expect(hud.events.count).toBe(0);
    expect(hud.made.every((o) => o.destroyed)).toBe(true);
    expect(roundState(hud.scene)).toBeUndefined();
  });

  it('builds at once in a running Hud; reduced motion drops the scale-in and keeps the text; Hud destroy also tears down', () => {
    const arena = fakeScene(true);
    const hud = fakeScene(true);
    const v = fakeView();
    mountRoundView(arena.scene, hud.scene, v.view, () => undefined, prefs(true));
    expect(hud.made).toHaveLength(4);
    expect(roundState(hud.scene)).toMatchObject({ main: 'ROUND 1', visible: true, scale: 1 });
    hud.events.emit('destroy');
    expect(arena.events.count + hud.events.count).toBe(0);
  });

  it('with the Arena fighter pool it mounts the defence and weather views in the Arena, feeds them the same events, and all leave', () => {
    const arena = fakeScene(true);
    const hud = fakeScene(true);
    const v = fakeView();
    const view = Object.assign(Object.create(v.view) as RenderView, { forEachCharacter: () => undefined, forEachProjectile: () => undefined });
    const lines: Announcement[] = [];
    const feed = mountRoundView(arena.scene, hud.scene, view, (l) => lines.push(l), prefs(false), { peek: () => undefined });
    expect(defenceState(arena.scene)).toMatchObject({ shields: 0, pops: [] });
    expect(weatherState(arena.scene)).toMatchObject({ kind: 0, call: '' });
    // The defence view's two Graphics in the Arena (the weather view makes its objects on the first weather); the
    // round view's shutdown and destroy listeners, and the defence and weather views' postupdate, shutdown and destroy.
    expect(arena.made).toHaveLength(2);
    expect(arena.events.count).toBe(8);
    feed([ev(1, SimEventKind.roundStarted, 0, { round: 1 }), ev(2, SimEventKind.weatherChanged, 0, { weather: 2, prev: 0, team: 1 })]);
    expect(lines.map((l) => l.text)).toEqual(['Round 1.', 'The enemy called Rain: water hits harder, fire softer.']);
    expect(weatherState(arena.scene)?.call).toBe('Rain!');
    arena.events.emit('shutdown');
    expect(arena.events.count + hud.events.count).toBe(0);
    expect(weatherState(arena.scene)).toBeUndefined();
    expect(defenceState(arena.scene)).toBeUndefined();
  });

  it('a view torn down before the Hud ever ran makes nothing and holds no listener', () => {
    const arena = fakeScene(true);
    const hud = fakeScene(false);
    mountRoundView(arena.scene, hud.scene, fakeView().view, () => undefined, prefs(false));
    arena.events.emit('destroy');
    expect(arena.events.count + hud.events.count).toBe(0);
    hud.events.emit('create');
    expect(hud.made).toHaveLength(0);
  });
});
