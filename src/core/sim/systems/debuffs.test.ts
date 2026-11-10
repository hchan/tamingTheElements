import { describe, expect, it } from 'vitest';
import fx from '../../../../tests/fixtures/legacy/abilities-effects.json';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { allocEntity } from '../alloc';
import { NO_COMMAND } from '../commands';
import { Cmd } from '../commands';
import { createMatch } from '../match';
import { EntityFlag, EntityKind } from '../state';
import { step } from '../step';
import { createWorld, type SimWorld } from '../world';
import { onProjectileHit } from './debuffs';
import { listStatuses } from './status';

const run = (w: SimWorld, n: number) => {
  for (let i = 0; i < n; i++) step(w, [NO_COMMAND, NO_COMMAND]);
};

/** Entity 0 = caster, entity 1 = victim. */
function rig(speed: number, baseSpeed = speed) {
  const world = createWorld(1);
  const s = world.state;
  for (let i = 0; i < 2; i++) {
    const id = allocEntity(s);
    s.kind[id] = EntityKind.character;
    s.team[id] = i;
    s.hp[id] = 100;
    s.maxHp[id] = 100;
  }
  s.speed[1] = speed;
  s.baseSpeed[1] = baseSpeed;
  return { world, s };
}

const frozen = (s: SimWorld['state'], id: number) => ((s.flags[id] ?? 0) & EntityFlag.frozen) !== 0;
const kill = (s: SimWorld['state'], id: number) => {
  s.flags[id] = (s.flags[id] ?? 0) & ~EntityFlag.alive;
};

describe('Tornado', () => {
  it('freezes for 150 ticks then unfreezes', () => {
    const { world, s } = rig(5);
    expect(onProjectileHit(world, 'tornado', 1, 0)).toBe(true);
    expect(frozen(s, 1)).toBe(true);
    run(world, 150);
    expect(frozen(s, 1)).toBe(true);
    run(world, 1);
    expect(frozen(s, 1)).toBe(false);
    expect(listStatuses(s, 1)).toEqual([]);
  });

  it('translucent victims are immune', () => {
    const { world, s } = rig(5);
    s.flags[1] = (s.flags[1] ?? 0) | EntityFlag.translucent;
    expect(onProjectileHit(world, 'tornado', 1, 0)).toBe(false);
    expect(frozen(s, 1)).toBe(false);
  });

  it('never unfreezes if the caster is dead', () => {
    const { world, s } = rig(5);
    onProjectileHit(world, 'tornado', 1, 0);
    kill(s, 0);
    run(world, 200);
    expect(frozen(s, 1)).toBe(true);
  });

  it('the first expiry unfreezes even while a second Tornado runs (stacking quirk)', () => {
    const { world, s } = rig(5);
    onProjectileHit(world, 'tornado', 1, 0);
    run(world, 10);
    onProjectileHit(world, 'tornado', 1, 0);
    run(world, 141);
    expect(frozen(s, 1)).toBe(false);
    expect(listStatuses(s, 1).length).toBe(1);
  });
});

describe('Ice Blast clamps (abilities-effects fixture)', () => {
  const cases = fx['iceBlast:clamps'] as unknown as Record<
    string,
    { start: { v: number }; hit: { v: number }; expired: { v: number } }
  >;
  for (const [name, c] of Object.entries(cases)) {
    it(name, () => {
      const base = name.startsWith('dummy') ? 0.2 : 7;
      const { world, s } = rig(c.start.v, base);
      onProjectileHit(world, 'ice-blast', 1, 0);
      expect(s.speed[1]).toBeCloseTo(c.hit.v, 12);
      run(world, 150);
      expect(s.speed[1]).toBeCloseTo(c.hit.v, 12);
      run(world, 1);
      expect(s.speed[1]).toBeCloseTo(c.expired.v, 12);
    });
  }

  it('stacks additively and unwinds one at a time', () => {
    const { world, s } = rig(7);
    onProjectileHit(world, 'ice-blast', 1, 0);
    onProjectileHit(world, 'ice-blast', 1, 0);
    expect(s.speed[1]).toBe(3);
    run(world, 151);
    expect(s.speed[1]).toBe(7);
  });

  it('translucent victims are immune', () => {
    const { world, s } = rig(5);
    s.flags[1] = (s.flags[1] ?? 0) | EntityFlag.translucent;
    expect(onProjectileHit(world, 'ice-blast', 1, 0)).toBe(false);
    expect(s.speed[1]).toBe(5);
  });

  it('keeps the slow if the caster is dead', () => {
    const { world, s } = rig(5);
    onProjectileHit(world, 'ice-blast', 1, 0);
    kill(s, 0);
    run(world, 200);
    expect(s.speed[1]).toBe(3);
  });
});

describe('Entangling Vines expiry', () => {
  function vinesDuel() {
    const world = createMatch({
      simVersion: 1, seed: 1, flags: DEFAULT_SIM_FLAGS, chapter: 1, difficulty: 1,
      p1: [{ character: characterId('treenoc'), xp: 1 }],
      p2: [{ character: characterId('pax'), xp: 1 }],
    });
    const s = world.state;
    s.x[0] = 500; s.y[0] = 300; s.x[1] = 580; s.y[1] = 300;
    s.dir[0] = 0;
    step(world, [Cmd.primary, 0]);
    step(world, [0, 0]);
    return { world, s };
  }

  // KNOWN-BUG:vines-stacking
  it.fails('vines expiry always unfreezes', () => {
    const { world, s } = vinesDuel();
    expect(frozen(s, 1)).toBe(true);
    kill(s, 0);
    run(world, 200);
    expect(frozen(s, 1)).toBe(false);
  });

  it('legacy: a dead caster leaves the target frozen forever', () => {
    const { world, s } = vinesDuel();
    kill(s, 0);
    run(world, 200);
    expect(frozen(s, 1)).toBe(true);
  });
});
