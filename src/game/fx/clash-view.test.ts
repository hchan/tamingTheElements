import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { SimEventKind, type RenderView, type SimEvent } from '@core/index';
import { BURST_TICKS } from './clash-fx';
import { BURST_POOL, mountClashView } from './clash-view';

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

interface FakeGraphics {
  destroyed: boolean;
  /** strokeCircle and fillCircle calls since the last `clear`. */
  rings: number[][];
  fills: number;
}

function mount(reduceMotion = false) {
  const events = new Emitter();
  const made: FakeGraphics[] = [];
  const graphics = (): unknown => {
    const o: FakeGraphics = { destroyed: false, rings: [], fills: 0 };
    made.push(o);
    const proxy: unknown = new Proxy(o, {
      get(target, key: string) {
        if (key in target) return target[key as keyof FakeGraphics];
        return (...a: number[]) => {
          if (key === 'destroy') o.destroyed = true;
          if (key === 'clear') { o.rings = []; o.fills = 0; }
          if (key === 'strokeCircle') o.rings.push(a);
          if (key === 'fillCircle') o.fills++;
          return proxy;
        };
      },
    });
    return proxy;
  };
  const scene = { events, add: { graphics } } as unknown as Phaser.Scene;
  let tick = 100;
  const view = { get tick() { return tick; } } as unknown as RenderView;
  const prefs = { reduceMotion };
  const consume = mountClashView(scene, view, () => prefs);
  let seq = 0;
  return {
    events, made, prefs,
    feed(t: number, evs: SimEvent[] = []) { tick = t; consume(evs); },
    clash: (t: number, winner = 2): SimEvent =>
      ({ tick: t, sourceId: 2, kind: SimEventKind.clash, seq: seq++, a: 2, b: 3, winner, x: 500, y: 200, ea: 0, eb: 1 }),
    frame: (delta = 16) => { events.emit('postupdate', 0, delta); },
  };
}

describe('clash view (Phaser side, fake scene)', () => {
  it('makes nothing until the first clash, then one Graphics, reused', () => {
    const m = mount();
    m.feed(100);
    m.frame();
    expect(m.made).toHaveLength(0);
    m.feed(101, [m.clash(101)]);
    m.frame();
    m.feed(102, [m.clash(102)]);
    m.frame();
    expect(m.made).toHaveLength(1);
  });

  it('draws a dark rim and two coloured rings per burst at the event point; a cancel adds the core', () => {
    const m = mount();
    m.feed(101, [m.clash(101), m.clash(101, -1)]);
    m.frame();
    const g = m.made[0];
    expect(g?.rings).toHaveLength(6);
    expect(g?.rings.every((r) => r[0] === 500 && r[1] === 200)).toBe(true);
    expect(g?.fills).toBe(1);
  });

  it('a burst grows, then ends after BURST_TICKS view ticks and the Graphics is cleared', () => {
    const m = mount();
    m.feed(101, [m.clash(101)]);
    m.frame();
    const g = m.made[0];
    const r0 = g?.rings[0]?.[2] ?? 0;
    m.feed(101 + BURST_TICKS / 2);
    m.frame();
    expect(g?.rings[0]?.[2] ?? 0).toBeGreaterThan(r0);
    m.feed(101 + BURST_TICKS);
    m.frame();
    expect(g?.rings).toHaveLength(0);
  });

  it('holds while paused (no new tick): frame time alone never ends a burst', () => {
    const m = mount();
    m.feed(101, [m.clash(101)]);
    for (let i = 0; i < 200; i++) m.frame(16);
    expect(m.made[0]?.rings).toHaveLength(3);
  });

  it('reduced motion: the ring does not grow', () => {
    const m = mount(true);
    m.feed(101, [m.clash(101)]);
    m.frame();
    const g = m.made[0];
    const r0 = g?.rings[0]?.[2];
    m.feed(101 + BURST_TICKS / 2);
    m.frame();
    expect(g?.rings[0]?.[2]).toBe(r0);
  });

  it('the pool is bounded: more clashes than slots replace the oldest', () => {
    const m = mount();
    const evs = Array.from({ length: BURST_POOL + 5 }, () => m.clash(101));
    m.feed(101, evs);
    m.frame();
    expect(m.made[0]?.rings).toHaveLength(BURST_POOL * 3);
  });

  it('leaves 0 listeners and destroys its Graphics on shutdown (and on destroy)', () => {
    for (const end of ['shutdown', 'destroy']) {
      const m = mount();
      m.feed(101, [m.clash(101)]);
      m.frame();
      expect(m.events.count).toBe(3);
      m.events.emit(end);
      expect(m.events.count).toBe(0);
      expect(m.made[0]?.destroyed).toBe(true);
    }
  });
});
