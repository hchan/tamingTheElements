import { describe, expect, it } from 'vitest';
import { allocEntity } from '../alloc';
import { NO_COMMAND } from '../commands';
import { EntityFlag, EntityKind, World as W } from '../state';
import { step } from '../step';
import { createWorld, type SimWorld } from '../world';
import { applyBuff, applyHeal, damageDecreasePct, isTranslucent, listStatuses, reduceDamage } from './status';

function rig(speed = 5) {
  const world = createWorld(1);
  const s = world.state;
  const id = allocEntity(s);
  s.kind[id] = EntityKind.character;
  s.speed[id] = speed;
  s.hp[id] = 100;
  s.maxHp[id] = 150;
  s.healMult[id] = 1;
  return { world, id, s };
}
const run = (w: SimWorld, n: number) => {
  for (let i = 0; i < n; i++) step(w, [NO_COMMAND, NO_COMMAND]);
};

describe('status buffs (abilities-effects fixture)', () => {
  it('adrenaline: +5 speed, 25% decrease, restored 150 ticks after the cast tick', () => {
    const { world, id, s } = rig();
    applyBuff(world, id, 'adrenaline');
    expect([s.speed[id], damageDecreasePct(s, id)]).toEqual([10, 25]);
    run(world, 150);
    expect(s.speed[id]).toBe(10);
    run(world, 1);
    expect([s.speed[id], damageDecreasePct(s, id)]).toEqual([5, 0]);
  });

  it('adrenaline stacks and unwinds one at a time', () => {
    const { world, id, s } = rig();
    applyBuff(world, id, 'adrenaline');
    run(world, 10);
    applyBuff(world, id, 'adrenaline');
    expect([s.speed[id], damageDecreasePct(s, id)]).toEqual([15, 50]);
    run(world, 141);
    expect(s.speed[id]).toBe(10);
    run(world, 10);
    expect(s.speed[id]).toBe(5);
  });

  it('fire dance: +2 speed for 5000 ms, still on at 4980 ms', () => {
    const { world, id, s } = rig(6);
    applyBuff(world, id, 'fire-dance');
    run(world, 250);
    expect(s.speed[id]).toBe(8);
    run(world, 1);
    expect(s.speed[id]).toBe(6);
  });

  it('rock armour: 75% decrease', () => {
    const { world, id, s } = rig();
    applyBuff(world, id, 'rock-armour');
    expect([8, 32, 112].map((d) => reduceDamage(s, id, d))).toEqual([2, 8, 28]);
    run(world, 151);
    expect(reduceDamage(s, id, 8)).toBe(8);
  });

  it('translucency lasts 1500 ms (flame) / 3000 ms (fade)', () => {
    for (const [slug, ticks] of [['translucent-flame', 75], ['fade', 150]] as const) {
      const { world, id, s } = rig();
      applyBuff(world, id, slug);
      expect(isTranslucent(s, id)).toBe(true);
      run(world, ticks);
      expect(isTranslucent(s, id)).toBe(true);
      run(world, 1);
      expect(isTranslucent(s, id)).toBe(false);
    }
  });

  it('a dead entity stays translucent', () => {
    const { world, id, s } = rig();
    applyBuff(world, id, 'fade');
    s.flags[id] = (s.flags[id] ?? 0) & ~EntityFlag.alive;
    run(world, 151);
    expect(isTranslucent(s, id)).toBe(true);
  });

  it('fire heal: 10 x healMult, capped at maxHp', () => {
    const { world, id, s } = rig();
    const cases: [number, number, number][] = [[1, 10, 20], [1.1, 95, 106], [2, 100, 120], [0, 10, 10], [2, 140, 150]];
    for (const [mult, hp, want] of cases) {
      s.healMult[id] = mult;
      s.hp[id] = hp;
      applyHeal(world, id, 'fire-heal');
      expect(s.hp[id]).toBeCloseTo(want, 10);
    }
  });

  it('lists statuses in slot order, refuses past capacity, draws no RNG', () => {
    const { world, id, s } = rig();
    const rng = s.rng.slice();
    for (let i = 0; i < 8; i++) expect(applyBuff(world, id, 'fire-dance')).toBe(true);
    expect(applyBuff(world, id, 'fire-dance')).toBe(false);
    expect(listStatuses(s, id)).toHaveLength(8);
    expect(listStatuses(s, id)[0]).toMatchObject({ startTick: s.world[W.tick], magnitude: 2 });
    expect(s.rng).toEqual(rng);
  });
});
