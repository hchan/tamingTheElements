import { describe, expect, it } from 'vitest';
import fixture from '../../../../tests/fixtures/legacy/abilities-range.json';
import { CHARACTERS } from '../../data/characters';
import { allocEntity } from '../alloc';
import { Cmd } from '../commands';
import { SimEventKind } from '../events';
import { step } from '../step';
import { EntityFlag, EntityKind, MAX_ENTITIES, TEAM_ACTIVE_COUNTS, TEAM_COOLDOWNS, TEAM_STRIDE, World as W } from '../state';
import { createWorld, type SimWorld } from '../world';
import { ABILITY_DEFS } from './projectile';

interface Num { v: number }
interface Bullet { direction: string; x: number; y: number; w: Num; h: Num }
interface Entry {
  maxActive: number; cooldown: number; speed: number; damage: Num;
  bullets: Bullet[]; afterTwoFrames: Bullet[];
  canFireAtCooldown: Record<string, boolean>;
}
const abilities = fixture.abilities as unknown as Record<string, Entry>;
const slugOf = (name: string): string => name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function owner(slug: string): { char: number; slot: number } | undefined {
  for (const [i, c] of CHARACTERS.entries()) {
    const slot = c.abilities.findIndex((a) => a === slug);
    if (slot >= 0) return { char: i, slot };
  }
  return undefined;
}

/** Fixture scene: attacker (100,200,80x80) facing east, target (400,200) of the same element. */
function scene(char: number, targetChar: number): SimWorld {
  const world = createWorld(1, { x: 0, y: 0, w: 1280, h: 720 });
  const s = world.state;
  for (const [team, def, x] of [[0, char, 100], [1, targetChar, 400]] as const) {
    const id = allocEntity(s);
    s.kind[id] = EntityKind.character;
    s.defId[id] = def;
    s.team[id] = team;
    s.owner[id] = id;
    s.dir[id] = team === 0 ? 0 : 4;
    s.x[id] = x;
    s.y[id] = 200;
    s.w[id] = 80;
    s.h[id] = 80;
    s.hp[id] = 1000;
    s.maxHp[id] = 1000;
    s.dmgMult[id] = 1;
    s.flags[id] = EntityFlag.alive;
  }
  return world;
}

const bulletIds = (world: SimWorld): number[] =>
  Array.from({ length: MAX_ENTITIES }, (_, i) => i).filter(
    (i) => world.state.kind[i] === EntityKind.projectile && ((world.state.flags[i] ?? 0) & EntityFlag.alive) !== 0,
  );

const fixtureTarget = CHARACTERS.findIndex((c) => c.id === 'lavax'); // fire, like the fixture target

describe('projectile system vs abilities-range.json', () => {
  for (const [name, a] of Object.entries(abilities)) {
    const slug = slugOf(name);
    const def = ABILITY_DEFS.find((d) => d.id === slug);
    const own = owner(slug);
    if (def === undefined || own === undefined || (def.kind !== 'range' && def.kind !== 'omni')) continue;
    const fire = own.slot === 0 ? Cmd.primary : Cmd.secondary;

    describe(name, () => {
      it('spawns at the legacy offset with legacy size', () => {
        const world = scene(own.char, fixtureTarget);
        step(world, [fire, 0]);
        const ids = bulletIds(world);
        expect(ids).toHaveLength(a.bullets.length);
        const s = world.state;
        a.bullets.forEach((b, i) => {
          const id = ids[i] as number;
          expect([s.x[id], s.y[id], s.w[id], s.h[id]]).toEqual([b.x, b.y, b.w.v, b.h.v]);
        });
      });

      it('moves along its direction by speed each tick', () => {
        const world = scene(own.char, fixtureTarget);
        step(world, [fire, 0]);
        step(world, [0, 0]);
        const s = world.state;
        bulletIds(world).forEach((id, i) => {
          const b = a.afterTwoFrames[i] as Bullet;
          expect([s.x[id], s.y[id]]).toEqual([b.x, b.y]);
        });
      });

      it(def.kind === 'omni' ? 'sets no cooldown (KNOWN-BUG:omni-no-cooldown)' : 'sets a strict cooldown', () => {
        const world = scene(own.char, fixtureTarget);
        step(world, [fire, 0]);
        const until = world.state.teams[TEAM_COOLDOWNS + own.slot];
        expect(until).toBe(def.kind === 'omni' ? 0 : a.cooldown / 20 + 1);
      });
    });
  }

  it('fires again exactly one tick after the cooldown elapses', () => {
    const o = owner('wind-cone');
    const world = scene(o?.char ?? 0, fixtureTarget);
    world.state.x[1] = 5000;
    step(world, [Cmd.secondary, 0]);
    const cd = (abilities['Wind Cone'] as Entry).cooldown / 20;
    for (let t = 1; t < cd; t++) step(world, [0, 0]);
    step(world, [Cmd.secondary, 0]); // tick == cd: strict >, still cooling down
    expect(bulletIds(world)).toHaveLength(1);
    step(world, [Cmd.secondary, 0]);
    expect(bulletIds(world)).toHaveLength(2);
  });

  it('omni abilities have no cooldown and fire the 8-way fan (KNOWN-BUG:omni-no-cooldown)', () => {
    const o = owner('shards-of-ice');
    const world = scene(o?.char ?? 0, fixtureTarget);
    step(world, [Cmd.secondary, 0]);
    step(world, [Cmd.secondary, 0]);
    expect(bulletIds(world)).toHaveLength(16);
  });
});

describe('projectile hits and despawn', () => {
  it('damages the opponent, emits Damage and despawns', () => {
    const own = owner('stick');
    const world = scene(own?.char ?? 0, fixtureTarget);
    const s = world.state;
    s.x[1] = 140;
    const ev = step(world, [Cmd.primary, 0]);
    expect(ev.some((e) => e.kind === SimEventKind.damage)).toBe(false);
    const events = step(world, [0, 0]);
    const dmg = events.find((e) => e.kind === SimEventKind.damage);
    expect(dmg?.['amount']).toBe(10);
    expect(s.hp[1]).toBe(990);
    expect(bulletIds(world)).toHaveLength(0);
    expect(s.teams[TEAM_STRIDE * 0 + TEAM_ACTIVE_COUNTS + ABILITY_DEFS.findIndex((d) => d.id === 'stick')]).toBe(0);
  });

  it('passes through translucent opponents and despawns outside the arena', () => {
    const own = owner('stick');
    const world = scene(own?.char ?? 0, fixtureTarget);
    const s = world.state;
    s.flags[1] = EntityFlag.alive | EntityFlag.translucent;
    s.x[1] = 140;
    step(world, [Cmd.primary, 0]);
    step(world, [0, 0]);
    expect(s.hp[1]).toBe(1000);
    expect(bulletIds(world)).toHaveLength(1);
    for (let t = 0; t < 200; t++) step(world, [0, 0]);
    expect(bulletIds(world)).toHaveLength(0);
    expect(s.world[W.tick]).toBe(202);
  });

  it('blocks firing while frozen', () => {
    const own = owner('stick');
    const world = scene(own?.char ?? 0, fixtureTarget);
    world.state.flags[0] = EntityFlag.alive | EntityFlag.frozen;
    step(world, [Cmd.primary, 0]);
    expect(bulletIds(world)).toHaveLength(0);
  });
});

describe('Sonar Blast and Fireball shrink', () => {
  const steps = fixture.shrink as unknown as Record<string, { steps: { step: number; damage: Num; w: Num; h: Num }[] }>;
  for (const [name, slug] of [['Sonar Blast', 'sonar-blast'], ['Fireball', 'fireball']] as const) {
    it(`${name} decays per tick like the fixture`, () => {
      const o = owner(slug);
      const world = scene(o?.char ?? 0, fixtureTarget);
      world.state.x[1] = 5000; // out of the way
      world.state.w[1] = 1;
      step(world, [o?.slot === 0 ? Cmd.primary : Cmd.secondary, 0]);
      const id = bulletIds(world)[0] as number;
      const s = world.state;
      const fx = steps[name]?.steps ?? [];
      expect([s.hp[id], s.w[id], s.h[id]]).toEqual([fx[0]?.damage.v, fx[0]?.w.v, fx[0]?.h.v]);
      for (let i = 1; i <= 5; i++) {
        step(world, [0, 0]);
        const f = fx[i];
        expect(s.hp[id]).toBeCloseTo(f?.damage.v ?? NaN, 9);
        expect(s.h[id]).toBeCloseTo(f?.h.v ?? NaN, 9);
        expect(s.w[id]).toBe(f?.w.v);
      }
    });
  }
});
