import { describe, expect, it } from 'vitest';
import { createCraftyStub, type CraftyEntity } from './crafty-stub';
import { createDomStub } from './dom-stub';
import { FakeClock } from './fake-clock';
import { createJQueryStub } from './jquery-stub';
import { createSeededRandom } from './seeded-random';

const setup = () => {
  const clock = new FakeClock();
  return { clock, crafty: createCraftyStub(clock) };
};

describe('crafty stub components', () => {
  it('mixes in props by own-property copy and runs init in order', () => {
    const { crafty } = setup();
    const order: string[] = [];
    const shared = { n: 1 };
    crafty.c('A', { shared, hello: () => 'a', init: () => order.push('A') });
    crafty.c('B', {
      init(this: CraftyEntity) {
        order.push('B');
        this.requires('A');
      },
    });
    const e = crafty.e('B');
    expect(order).toEqual(['B', 'A']);
    expect(e.has('A') && e.has('B')).toBe(true);
    expect(e['shared']).toBe(shared);
    expect((e['hello'] as () => string)()).toBe('a');
    e.removeComponent('A');
    expect(e.has('A')).toBe(false);
  });

  it('attr, geometry aliases and events', () => {
    const { crafty } = setup();
    const e = crafty.e('2D');
    e.attr({ x: 3, y: 4, w: 5 });
    expect([e._x, e._y, e.w, e.attr('y')]).toEqual([3, 4, 5, 4]);
    const seen: unknown[] = [];
    e.bind('Ping', (d) => seen.push(d));
    e.trigger('Ping', 1);
    e.unbind('Ping');
    e.trigger('Ping', 2);
    expect(seen).toEqual([1]);
    e.destroy();
    expect(crafty('obj').length).toBe(0);
  });

  it('records scenes, audio and hits', () => {
    const { crafty } = setup();
    let ran = 0;
    crafty.scene('S', () => ran++);
    crafty.scene('S');
    crafty.audio.play('boom');
    const e = crafty.e('2D').onHit('Enemy', () => undefined);
    expect([ran, crafty.currentScene, crafty.calls.at(-1)?.method]).toEqual([1, 'S', 'play']);
    expect(e.hitHandlers).toHaveLength(1);
    expect(e.hit('Enemy')).toBe(false);
    expect(crafty.keys['P']).toBe(80);
  });
});

describe('Delay on the fake clock', () => {
  it('fires after the delay on the next frame and repeats n+1 times', () => {
    const { clock, crafty } = setup();
    const e = crafty.e('Delay');
    const fired: number[] = [];
    const t0 = clock.now;
    (e['delay'] as (f: () => void, ms: number, r: number) => void)(
      () => fired.push(clock.now - t0), 100, 1,
    );
    clock.advance(500);
    expect(fired).toEqual([120, 240]);
  });

  it('does not fire while paused and shifts by the paused time', () => {
    const { clock, crafty } = setup();
    const e = crafty.e('Delay');
    let fired = 0;
    (e['delay'] as (f: () => void, ms: number, r: number) => void)(() => fired++, 100, 0);
    clock.advance(40);
    crafty.pause();
    clock.advance(1000);
    expect(fired).toBe(0);
    crafty.pause();
    clock.advance(20);
    expect(fired).toBe(0);
    clock.advance(100);
    expect(fired).toBe(1);
  });

  it('fires timers in time order', () => {
    const { clock } = setup();
    const order: number[] = [];
    clock.setTimeout(() => order.push(2), 50);
    clock.setTimeout(() => order.push(1), 10);
    clock.advance(100);
    expect(order).toEqual([1, 2]);
  });
});

describe('jquery stub', () => {
  it('is chainable and configurable per selector', () => {
    const $ = createJQueryStub({ vals: { '#a': '1.5' } });
    const chain = $('#a') as { addClass: () => unknown; val: () => unknown };
    expect(chain.addClass()).toBe(chain);
    expect(chain.val()).toBe('1.5');
    expect(($('#b') as { val: () => unknown }).val()).toBeUndefined();
    const seen: unknown[] = [];
    $.each({ a: 1, b: 2 }, (k, v) => seen.push([k, v]));
    expect(seen).toEqual([['a', 1], ['b', 2]]);
    expect($.grep([1, 2, 3], (v) => (v as number) > 1)).toEqual([2, 3]);
    expect($.extend(true, { a: { x: 1 } }, { a: { y: 2 } })).toEqual({ a: { x: 1, y: 2 } });
  });
});

describe('dom stub and seeded random', () => {
  it('localStorage round trips strings', () => {
    const { localStorage: ls } = createDomStub(new FakeClock());
    expect(ls.getItem('k')).toBeNull();
    ls.setItem('k', 12);
    expect(ls.getItem('k')).toBe('12');
    ls.removeItem('k');
    expect(ls.getItem('k')).toBeNull();
  });

  it('window defaults', () => {
    const { window } = createDomStub(new FakeClock());
    expect([window.innerWidth, window.innerHeight]).toEqual([1300, 740]);
  });

  it('is deterministic per seed and within [0,1)', () => {
    const a = createSeededRandom(7);
    const b = createSeededRandom(7);
    const xs = Array.from({ length: 50 }, a);
    expect(xs).toEqual(Array.from({ length: 50 }, b));
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(createSeededRandom(8)()).not.toBe(xs[0]);
  });
});
