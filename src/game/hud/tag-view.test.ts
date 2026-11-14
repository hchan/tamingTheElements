import type Phaser from 'phaser';
import { describe, expect, it } from 'vitest';
import { EntityFlag, SimEventKind, type RenderCharacter, type RenderView, type SimEvent } from '@core/index';
import type { Announcement } from '../a11y/announcer';
import { CALL_TICKS, FLASH_TICKS } from './tag-fx';
import { mountTagView, tagState } from './tag-view';

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
  scaleX: number;
  destroyed: boolean;
  calls: string[];
}

/** A game object whose every setter chains; graphics record their draw calls (cleared by `clear`). */
function fakeObject(kind: string, made: Fake[]): Fake {
  const o: Fake = { kind, visible: true, text: '', scaleX: 1, destroyed: false, calls: [] };
  const record: Record<string, (...a: never[]) => void> = {
    setVisible: (v: boolean) => { o.visible = v; },
    setText: (t: string) => { o.text = t; },
    setScale: (s: number) => { o.scaleX = s; },
    clear: () => { o.calls = []; },
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

function fakeScene(active = true): { scene: Phaser.Scene; events: Emitter; made: Fake[] } {
  const events = new Emitter();
  const made: Fake[] = [];
  const scene = {
    events,
    sys: { isActive: () => active },
    scale: { width: 1280, displaySize: { width: 1280 } },
    add: { graphics: () => fakeObject('graphics', made), text: () => fakeObject('text', made) },
  } as unknown as Phaser.Scene;
  return { scene, events, made };
}

const chr = (id: number, team: number, sprite: string, o: Partial<RenderCharacter> = {}): RenderCharacter => ({
  id, team, sprite, dir: 0, flags: EntityFlag.alive, x: 100, y: 300, px: 100, py: 300, w: 80, h: 80, hp: 1000, maxHp: 1000,
  restCap: 1000, element: 'fire', ...o,
});

function setup(o: { size?: 1 | 2 | 3; hudActive?: boolean; reduceMotion?: boolean } = {}) {
  let tick = 100;
  let swapReady = [0, 0];
  const bench = { flags: EntityFlag.alive | EntityFlag.benched };
  const chars = o.size === 3
    ? [chr(0, 0, 'sindarosa'), chr(1, 0, 'pax', bench), chr(2, 0, 'curomo', bench), chr(3, 1, 'fiara', { x: 900 }), chr(4, 1, 'lavax', bench), chr(5, 1, 'echo', bench)]
    : [chr(0, 0, 'sindarosa'), ...(o.size === 1 ? [] : [chr(1, 0, 'pax', bench)]),
      chr(o.size === 1 ? 1 : 2, 1, 'fiara', { x: 900 }), ...(o.size === 1 ? [] : [chr(3, 1, 'lavax', bench)])];
  const view = {
    get tick() { return tick; },
    forEachCharacter: (visit: (c: RenderCharacter) => void) => { for (const c of chars) visit(c); },
    actionBar: (team: number) => ({ tick, swapReadyTick: swapReady[team] ?? 0 }),
  } as unknown as RenderView;
  const arena = fakeScene();
  const hud = fakeScene(o.hudActive ?? true);
  const said: Announcement[] = [];
  const passed: number[] = [];
  const consume = mountTagView(arena.scene, hud.scene, view, (l) => said.push(l), () => ({ reduceMotion: o.reduceMotion ?? false, highContrast: false }), (e) => passed.push(e.length));
  const frame = (): void => { arena.events.emit('postupdate'); };
  const tagIn = (from: number, to: number, team: number): SimEvent =>
    ({ tick, sourceId: to, kind: SimEventKind.tagIn, seq: 0, from, to, team, entrance: 1 });
  return {
    arena, hud, said, passed, consume, frame, tagIn, chars,
    setTick: (t: number) => { tick = t; },
    setSwapReady: (r: number[]) => { swapReady = r; },
    state: () => tagState(arena.scene),
  };
}

describe('tag view (Phaser side, fake scenes)', () => {
  it('builds nothing in 1v1 and hands back the next consumer', () => {
    const s = setup({ size: 1 });
    expect(s.consume).toBeTypeOf('function');
    s.consume?.([]);
    expect(s.passed).toEqual([0]);
    expect(s.arena.made).toEqual([]);
    expect(s.hud.made).toEqual([]);
    expect(s.arena.events.count + s.hud.events.count).toBe(0);
    expect(s.state()).toBeUndefined();
  });

  it('draws no loose TAG word over the arena (the third slot already says Tag; qa-r18)', () => {
    const s = setup();
    s.setSwapReady([0, 0]);
    s.frame();
    expect(s.state()).not.toHaveProperty('caption');
    expect(s.hud.made.filter((m) => m.kind === 'text')).toHaveLength(7);
  });

  it('draws who is in, the bench with its red life, the tag cooldown', () => {
    const s = setup();
    const lead = s.chars[0] as RenderCharacter;
    lead.hp = 400;
    lead.restCap = 800;
    s.setSwapReady([175, 100]);
    s.frame();
    expect(s.state()).toMatchObject({
      lines: [['IN Sindarosa', 'BENCH Pax ▲ 100%', 'TAG 1.5s'], ['IN Fiara', 'BENCH Lavax ▲ 100%', 'TAG READY']],
      call: '', flashes: 0,
    });
    // The Hud graphics drew the red life (dashed lines), the active frame and the tag bars.
    const g = s.hud.made.find((m) => m.kind === 'graphics');
    expect(g?.calls).toEqual(expect.arrayContaining(['lineBetween', 'strokeRect', 'fillRect']));
  });

  it('a tag shows TAG!, flashes at the entrance and speaks; a KO entrance calls the name in gold and is marked', () => {
    const s = setup();
    s.frame();
    const [lead, pax] = s.chars as [RenderCharacter, RenderCharacter];
    lead.flags = EntityFlag.alive | EntityFlag.benched;
    pax.flags = EntityFlag.alive;
    s.setTick(101);
    s.consume?.([s.tagIn(0, 1, 0)]);
    s.frame();
    expect(s.state()).toMatchObject({ call: 'TAG!', flashes: 1, ko: false });
    expect(s.state()?.callScale).toBeGreaterThan(1);
    expect(s.state()?.lines[0]?.[0]).toBe('IN Pax');
    expect(s.said.map((l) => l.text)).toEqual(['Tag! Pax is in, Sindarosa rests.']);
    expect(s.passed).toEqual([1]);
    s.setTick(101 + FLASH_TICKS);
    s.frame();
    expect(s.state()).toMatchObject({ call: 'TAG!', flashes: 0, callScale: 1 });
    s.setTick(101 + CALL_TICKS);
    s.frame();
    expect(s.state()?.call).toBe('');
    // Pax is KO'd: the death auto-swap brings Sindarosa back with the KO entrance; no tag left.
    pax.flags = EntityFlag.alive | EntityFlag.dead;
    pax.hp = 0;
    lead.flags = EntityFlag.alive;
    s.setTick(200);
    s.consume?.([s.tagIn(1, 0, 0)]);
    s.frame();
    expect(s.state()).toMatchObject({ call: 'SINDAROSA IN!', ko: true });
    expect(s.state()?.lines[0]).toEqual(['IN Sindarosa', 'BENCH Pax ▲ K.O.', 'NO TAG']);
    expect(s.said.at(-1)?.text).toBe('Pax is down. Sindarosa steps in.');
  });

  it('3v3: a BENCH line per bench hero, red life on both bench bars, NO TAG only once both are down (WP-arcade-3v3)', () => {
    const s = setup({ size: 3 });
    const [, pax, curomo] = s.chars as [RenderCharacter, RenderCharacter, RenderCharacter];
    s.frame();
    expect(s.hud.made.filter((m) => m.kind === 'text')).toHaveLength(9); // 4 lines per side, the call
    expect(s.state()?.lines).toEqual([
      ['IN Sindarosa', 'BENCH Pax ▲ 100%', 'BENCH Curomo ▲ 100%', 'TAG READY'],
      ['IN Fiara', 'BENCH Lavax ▲ 100%', 'BENCH Echo ▲ 100%', 'TAG READY'],
    ]);
    // Red life on both bench heroes: two dashed spans more than with none.
    const g = s.hud.made.find((m) => m.kind === 'graphics');
    const dashesNow = (): number => g?.calls.filter((c) => c === 'lineBetween').length ?? 0;
    const plain = dashesNow();
    for (const h of [pax, curomo]) Object.assign(h, { hp: 500, restCap: 900 });
    s.setTick(101);
    s.frame();
    expect(dashesNow()).toBeGreaterThan(plain);
    expect(s.state()?.lines[0]?.slice(1, 3)).toEqual(['BENCH Pax ▲ 50% +40% red', 'BENCH Curomo ▲ 50% +40% red']);
    // Pax down: the tag still reaches Curomo; both down: NO TAG.
    Object.assign(pax, { hp: 0, flags: EntityFlag.alive | EntityFlag.benched | EntityFlag.dead });
    s.setTick(102);
    s.frame();
    expect(s.state()?.lines[0]).toEqual(['IN Sindarosa', 'BENCH Pax ▲ K.O.', 'BENCH Curomo ▲ 50% +40% red', 'TAG READY']);
    Object.assign(curomo, { hp: 0, flags: EntityFlag.alive | EntityFlag.benched | EntityFlag.dead });
    s.setTick(103);
    s.frame();
    expect(s.state()).toMatchObject({ lines: [['IN Sindarosa', 'BENCH Pax ▲ K.O.', 'BENCH Curomo ▲ K.O.', 'NO TAG'], expect.anything()] });
  });

  it('reduced motion keeps the call at full size and the flash', () => {
    const s = setup({ reduceMotion: true });
    s.consume?.([s.tagIn(2, 3, 1)]);
    s.frame();
    expect(s.state()).toMatchObject({ call: 'TAG!', callScale: 1, flashes: 1 });
    expect(s.said.at(-1)?.text).toBe('The enemy tagged in Lavax.');
  });

  it('waits for the Hud create, then tears down to 0 listeners and destroys every object (arena or hud, shutdown or destroy)', () => {
    for (const [who, ev] of [['arena', 'shutdown'], ['arena', 'destroy'], ['hud', 'shutdown'], ['hud', 'destroy']] as const) {
      const s = setup({ hudActive: false });
      s.frame();
      expect(s.hud.made).toEqual([]);
      s.hud.events.emit('create');
      s.frame();
      expect(s.hud.made.length).toBe(8); // one Graphics, 3 lines per side, the call
      s[who].events.emit(ev);
      expect(s.arena.events.count + s.hud.events.count).toBe(0);
      expect([...s.arena.made, ...s.hud.made].every((m) => m.destroyed)).toBe(true);
      expect(s.state()).toBeUndefined();
    }
  });
});
