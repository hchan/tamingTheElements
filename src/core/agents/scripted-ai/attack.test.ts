import { describe, expect, it } from 'vitest';
import ai from '../../../../tests/fixtures/legacy/ai.json';
import { allocEntity } from '../../sim/alloc';
import { Cmd } from '../../sim/commands';
import { hash as hashState } from '../../sim/hash';
import { EntityFlag, EntityKind } from '../../sim/state';
import { createWorld } from '../../sim/world';
import { createObservationView, type FighterView, type ObservationView } from '../agent';
import {
  AttackAgent,
  type AttackAbility,
  type AttackProfile,
  type Facing,
  isInRangeAxis,
  primaryInRange,
  updateAttackDirection,
} from './attack';

/**
 * Tolerances versus the legacy fixture (tests/fixtures/legacy/ai.json):
 * - Decision tables are matched exactly (direction, in-range, fire / no fire).
 * - Legacy cooldowns used Date.now() and lastUsed timestamps; here a ready ability is "slot cooldown 0 and
 *   live count < maxActive". The fixture's `lastUsed !== 0` column is a Date artifact and is compared as
 *   "fired" only for the ready case.
 * - The fixture calls doPrimary/doSecondaryAttackIfNecessary directly, also for a frozen enemy; the agent
 *   mirrors the EnterFrame guard (frozen -> no AI at all), so frozen rows are checked through the pure
 *   range helpers for direction and through the agent for "never fires".
 * - The legacy attack path never called Math.random, so no ai.pN draws are expected (asserted below).
 */

const SELF = { x: 500, y: 300, w: 80, h: 80 };
const FIRE_BLAST: AttackAbility = { type: 'range', maxActive: 2 };
const GROUND_SHOCK: AttackAbility = { type: 'melee', w: 240, h: 240, reach: 'explosion', maxActive: 1 };
const STRANGLING: AttackAbility = { type: 'melee', w: 120, h: 40, reach: 'directional', maxActive: 2 };
const VINES: AttackAbility = { type: 'melee', w: 360, h: 40, reach: 'directional', maxActive: 2 };
const FIRE_HEAL: AttackAbility = { type: 'heal', maxActive: 100 };

interface Table {
  columns: string;
  rows: [number, number, string, string, boolean, string][];
}

function fighter(box: { x: number; y: number; w: number; h: number }, extra: Partial<FighterView> = {}): FighterView {
  return { id: 0, ...box, hp: 100, maxHp: 100, flags: EntityFlag.alive, alive: true, ...extra };
}

function view(self: FighterView, opponent: FighterView, cooldowns: number[] = [0, 0, 0, 0]): ObservationView & { draws: number } {
  const v = {
    side: 0 as const,
    tick: 0,
    self,
    opponent,
    cooldowns,
    draws: 0,
    aiInt(): number {
      v.draws++;
      return 0;
    },
  };
  return v;
}

describe('direction tables', () => {
  const tables: [string, Table, number, number][] = [
    ['direction.square80', ai['direction.square80'] as Table, 80, 80],
    ['direction.w60h100', ai['direction.w60h100'] as Table, 60, 100],
  ];
  for (const [name, table, w, h] of tables) {
    it(`${name}: updateAttackDirection and isInRangeAxis match legacy`, () => {
      expect(table.rows.length).toBeGreaterThan(100);
      for (const [dx, dy, start, viaUpdate, inAxis, after] of table.rows) {
        const target = { x: SELF.x + dx, y: SELF.y + dy, w, h };
        const label = `dx=${String(dx)} dy=${String(dy)} start=${start}`;
        expect(updateAttackDirection(SELF, target, start as Facing), label).toBe(viaUpdate);
        const r = isInRangeAxis(SELF, target, start as Facing);
        expect(r.inRange, label).toBe(inAxis);
        expect(r.facing, label).toBe(after);
      }
    });
  }
});

type PrimaryRow = [number, number, number, boolean, string];

describe('doPrimaryAttackIfNecessary preconditions', () => {
  const cases: [string, AttackAbility, string][] = [
    ['primary.range.fireBlast', FIRE_BLAST, 'ready'],
    ['primary.range.fireBlast.frozen', FIRE_BLAST, 'frozen'],
    ['primary.range.fireBlast.maxActive', FIRE_BLAST, 'maxActive'],
    ['primary.range.fireBlast.cooldown', FIRE_BLAST, 'cooldown'],
    ['primary.melee.groundShock', GROUND_SHOCK, 'ready'],
    ['primary.melee.stranglingBranches', STRANGLING, 'ready'],
    ['primary.melee.groundShock.frozen', GROUND_SHOCK, 'frozen'],
  ];
  for (const [name, ability, state] of cases) {
    it(`${name} (${state})`, () => {
      const rows = Object.values((ai as unknown as Record<string, Record<string, PrimaryRow>>)[name] ?? {});
      expect(rows).toHaveLength(81);
      for (const [dx, dy, , , dir] of rows) {
        const target = { x: SELF.x + dx, y: SELF.y + dy, w: 80, h: 80 };
        const label = `dx=${String(dx)} dy=${String(dy)}`;
        const rangeCheck = primaryInRange(ability, SELF, target, 'w');
        const flags = state === 'frozen' ? EntityFlag.alive | EntityFlag.frozen : EntityFlag.alive;
        const agent = new AttackAgent({ primary: ability }, { activeCount: () => (state === 'maxActive' ? 2 : 0) });
        const cmd = agent.observe(view(fighter(SELF, { flags }), fighter(target), [state === 'cooldown' ? 5 : 0, 0, 0, 0]));
        const fired = (cmd & Cmd.primary) !== 0;
        const expectFired = (rows.find((r) => r[0] === dx && r[1] === dy)?.[2] ?? 0) === 1;
        expect(fired, label).toBe(expectFired);
        // Range primaries turn via isInRangeAxis; melee primaries leave the direction to the frame's
        // updateAttackDirection (the fixture calls doPrimary directly, so it never sees that turn).
        if (state !== 'frozen') {
          const turned = updateAttackDirection(SELF, target, 'w');
          expect(agent.direction, label).toBe(ability.type === 'range' ? dir : turned);
        }
        // Direction written by the primary check itself (the frozen agent never reaches it).
        expect(rangeCheck.facing, label).toBe(dir);
        if (fired) expect((cmd & facingBit(agent.direction)) !== 0, label).toBe(true);
      }
    });
  }
});

function facingBit(f: Facing): number {
  return { n: Cmd.up, e: Cmd.right, s: Cmd.down, w: Cmd.left }[f];
}

interface SecondaryRow {
  returned: unknown;
  used: boolean;
  hp: number;
}

describe('doSecondaryAttackIfNecessary preconditions', () => {
  const abilities: Record<string, AttackAbility> = {
    'Entangling Vines': VINES,
    'Fire Heal': FIRE_HEAL,
    'Fire Blast': FIRE_BLAST,
  };
  const secondary = ai.secondary as unknown as Record<string, SecondaryRow>;
  for (const [key, row] of Object.entries(secondary)) {
    if (key === 'noSecondary') continue;
    it(key, () => {
      const m = /^(.+)@(-?\d+),(-?\d+)\/(\w+)$/.exec(key);
      if (m === null) throw new Error(`bad key ${key}`);
      const [, name = '', dx = '0', dy = '0', state = ''] = m;
      const profile: AttackProfile = { primary: { type: 'other', maxActive: 1 }, secondary: abilities[name] };
      const hp = row.hp;
      const agent = new AttackAgent(profile, { activeCount: (slot) => (slot === 1 && state === 'maxActive' ? 1000 : 0) });
      const self = fighter(SELF, {
        hp,
        flags: state === 'frozen' ? EntityFlag.alive | EntityFlag.frozen : EntityFlag.alive,
      });
      const target = { x: SELF.x + Number(dx), y: SELF.y + Number(dy), w: 80, h: 80 };
      const cmd = agent.observe(view(self, fighter(target), [0, state === 'cooldown' ? 3 : 0, 0, 0]));
      expect((cmd & Cmd.secondary) !== 0).toBe(row.used);
    });
  }

  it('a profile without a secondary never uses one', () => {
    const agent = new AttackAgent({ primary: FIRE_BLAST });
    expect(agent.observe(view(fighter(SELF), fighter({ x: 600, y: 300, w: 80, h: 80 }))) & Cmd.secondary).toBe(0);
  });
});

describe('determinism', () => {
  it('draws nothing from the ai stream and returns identical commands for identical worlds', () => {
    const v = view(fighter(SELF), fighter({ x: 560, y: 300, w: 80, h: 80 }));
    const a = new AttackAgent({ primary: FIRE_BLAST, secondary: VINES });
    a.observe(v);
    expect(v.draws).toBe(0);

    const build = (): ReturnType<typeof createWorld> => {
      const world = createWorld(9);
      for (const team of [0, 1]) {
        const id = allocEntity(world.state);
        world.state.kind[id] = EntityKind.character;
        world.state.team[id] = team;
        world.state.flags[id] = EntityFlag.alive;
        world.state.x[id] = 200 + team * 100;
        world.state.y[id] = 300;
        world.state.w[id] = 80;
        world.state.h[id] = 80;
        world.state.hp[id] = 100;
        world.state.maxHp[id] = 100;
      }
      return world;
    };
    const w1 = build();
    const before = hashState(w1.state);
    const cmd1 = new AttackAgent({ primary: FIRE_BLAST }).observe(createObservationView(w1, 0));
    const cmd2 = new AttackAgent({ primary: FIRE_BLAST }).observe(createObservationView(build(), 0));
    expect(cmd1).toBe(cmd2);
    expect(cmd1 & Cmd.primary).toBe(Cmd.primary);
    expect(hashState(w1.state)).toBe(before);
  });
});
