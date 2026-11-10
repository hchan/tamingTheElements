import { describe, expect, it } from 'vitest';
import fixture from '../../../../tests/fixtures/legacy/abilities-range.json';
import { CHARACTERS } from '../../data/characters';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { DIR8_X, DIR8_Y } from '../../math/dir8';
import { allocEntity } from '../alloc';
import { Cmd } from '../commands';
import { step } from '../step';
import { EntityFlag, EntityKind, MAX_ENTITIES, TEAM_ACTIVE_COUNTS, TEAM_STRIDE } from '../state';
import { createWorld, type SimWorld } from '../world';
import { ABILITY_DEFS } from './projectile';

interface Num { v: number }
interface Bullet { direction: string; x: number; y: number; w: Num; h: Num }
interface Entry { speed: number; bullets: Bullet[]; afterTwoFrames: Bullet[] }
const abilities = fixture.abilities as unknown as Record<string, Entry>;

const LEGACY_ORDER = ['n', 's', 'e', 'w', 'nw', 'ne', 'sw', 'se'];

function scene(slug: string): { world: SimWorld; slot: number } {
  const char = CHARACTERS.findIndex((c) => (c.abilities as readonly string[]).includes(slug));
  const slot = (CHARACTERS[char]?.abilities as readonly string[] | undefined)?.indexOf(slug) ?? 0;
  const world = createWorld(1, { x: 0, y: 0, w: 1280, h: 720 });
  const s = world.state;
  for (const [team, def, x] of [[0, char, 100], [1, 0, 5000]] as const) {
    const id = allocEntity(s);
    s.kind[id] = EntityKind.character;
    s.defId[id] = def;
    s.team[id] = team;
    s.owner[id] = id;
    s.x[id] = x;
    s.y[id] = 200;
    s.w[id] = 80;
    s.h[id] = 80;
    s.hp[id] = 1000;
    s.dmgMult[id] = 1;
    s.flags[id] = EntityFlag.alive;
  }
  return { world, slot };
}

const bullets = (world: SimWorld): number[] =>
  Array.from({ length: MAX_ENTITIES }, (_, i) => i).filter(
    (i) => world.state.kind[i] === EntityKind.projectile && ((world.state.flags[i] ?? 0) & EntityFlag.alive) !== 0,
  );

describe('omni abilities vs abilities-range.json', () => {
  for (const [name, slug] of [['Shards of Ice', 'shards-of-ice'], ['Circus of Slime', 'circus-of-slime']] as const) {
    it(`${name} fires 8 bullets in legacy direction order and geometry`, () => {
      const { world, slot } = scene(slug);
      step(world, [slot === 0 ? Cmd.primary : Cmd.secondary, 0]);
      const ids = bullets(world);
      const fx = abilities[name] as Entry;
      expect(ids).toHaveLength(8);
      expect(fx.bullets.map((b) => b.direction)).toEqual(LEGACY_ORDER);
      const s = world.state;
      ids.forEach((id, i) => {
        const b = fx.bullets[i] as Bullet;
        expect([s.x[id], s.y[id], s.w[id], s.h[id]]).toEqual([b.x, b.y, b.w.v, b.h.v]);
        const dir = s.dir[id] as number;
        expect(s.vx[id]).toBe((DIR8_X[dir] ?? 0) * fx.speed);
        expect(s.vy[id]).toBe((DIR8_Y[dir] ?? 0) * fx.speed);
      });
    });

    it(`${name} ignores maxActive and leaves the active count negative once bullets leave (KNOWN-BUG:omni-no-cooldown, curCount only)`, () => {
      const { world, slot } = scene(slug);
      const cmd = slot === 0 ? Cmd.primary : Cmd.secondary;
      const cd = ABILITY_DEFS.find((d) => d.id === slug)?.cooldownTicks ?? 0;
      // curCount stays at or below 0, so maxActive never blocks; only the doAbility cooldown spaces the fans.
      for (let i = 0; i < 3; i++) {
        step(world, [cmd, 0]);
        expect(bullets(world)).toHaveLength(8);
        for (let t = 0; t < cd; t++) step(world, [0, 0]);
      }
      for (let t = 0; t < 400; t++) step(world, [0, 0]);
      expect(bullets(world)).toHaveLength(0);
      const idx = ABILITY_DEFS.findIndex((d) => d.id === slug);
      expect(world.state.teams[TEAM_STRIDE * 0 + TEAM_ACTIVE_COUNTS + idx]).toBe(-24);
    });
  }
});

describe('Chaos Orb', () => {
  it('spawns one slow, large bullet with legacy geometry', () => {
    const { world, slot } = scene('chaos-orb');
    step(world, [slot === 0 ? Cmd.primary : Cmd.secondary, 0]);
    const ids = bullets(world);
    const b = (abilities['Chaos Orb'] as Entry).bullets[0] as Bullet;
    const id = ids[0] as number;
    expect(ids).toHaveLength(1);
    expect([world.state.x[id], world.state.y[id], world.state.w[id], world.state.h[id]]).toEqual([b.x, b.y, b.w.v, b.h.v]);
    expect(world.state.speed[id]).toBe(2);
  });
});

describe('Elemental Advantage', () => {
  it('is data-only: flag defaults off and no character owns the ability', () => {
    expect(DEFAULT_SIM_FLAGS.elementalAdvantage).toBe(false);
    expect(ABILITY_DEFS.some((d) => d.id === 'elemental-advantage-fire-cone')).toBe(true);
    expect(CHARACTERS.some((c) => c.abilities.some((a) => a.startsWith('elemental-advantage')))).toBe(false);
  });
});
