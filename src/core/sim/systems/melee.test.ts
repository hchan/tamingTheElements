import { describe, expect, it } from 'vitest';
import fx from '../../../../tests/fixtures/legacy/abilities-effects.json';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { computeDamage } from '../../rules/damage';
import { Cmd } from '../commands';
import { createMatch } from '../match';
import { cooldownIdx, countIdx, EntityFlag, EntityKind, MAX_ENTITIES } from '../state';
import { step } from '../step';
import type { SimWorld } from '../world';
import { directionalBox, isInRangeDirectional, isInRangeExplosion } from './melee';

const OFFSETS = fx['range:80x80'].offsets;
type Table = { helper: string; w: number; h: number; rows: string[] };

describe('melee range helpers match the legacy tables', () => {
  for (const key of ['range:80x80', 'range:40x120'] as const) {
    const target = key === 'range:80x80' ? { w: 80, h: 80 } : { w: 40, h: 120 };
    const tables = fx[key] as unknown as Record<string, Table | number[]>;
    for (const name of Object.keys(tables).filter((k) => k !== 'offsets')) {
      it(`${key} ${name}`, () => {
        const t = tables[name] as Table;
        const fn = t.helper === 'explosion' ? isInRangeExplosion : isInRangeDirectional;
        const rows = OFFSETS.map((dy) =>
          OFFSETS.map((dx) => (fn(500, 500, { x: 500 + dx, y: 500 + dy, ...target }, t.w, t.h) ? '1' : '0')).join(''),
        );
        expect(rows).toEqual(t.rows);
      });
    }
  }

  it('is symmetric in sign and bounded', () => {
    const probe = (ax: number, tx: number) => isInRangeDirectional(ax, 500, { x: tx, y: 500, w: 80, h: 80 }, 240, 40);
    expect([probe(500, 530), probe(530, 500), probe(500, 800)]).toEqual([
      fx['range:sign'].right,
      fx['range:sign'].left,
      fx['range:sign'].far,
    ]);
  });
});

function duel(a: string, b: string): { world: SimWorld; p: number; e: number } {
  const world = createMatch({
    simVersion: 1, seed: 1, flags: DEFAULT_SIM_FLAGS, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(a), xp: 1 }],
    p2: [{ character: characterId(b), xp: 1 }],
  });
  const s = world.state;
  s.x[0] = 500; s.y[0] = 300; s.x[1] = 580; s.y[1] = 300; // adjacent, east of caster
  s.dir[0] = 0;
  return { world, p: 0, e: 1 };
}

const meleeIds = (w: SimWorld) =>
  Array.from({ length: MAX_ENTITIES }, (_, i) => i).filter(
    (i) => ((w.state.flags[i] ?? 0) & EntityFlag.alive) !== 0 && w.state.kind[i] === EntityKind.melee,
  );

const frozen = (w: SimWorld, id: number) => ((w.state.flags[id] ?? 0) & EntityFlag.frozen) !== 0;

describe('melee system', () => {
  it('Ground Shock hits once (secondary slot), freezes the caster for 13 ticks, honours cooldown', () => {
    const { world, p, e } = duel('pax', 'wispera');
    const s = world.state;
    const hp0 = s.hp[e] ?? 0;
    step(world, [Cmd.secondary, 0]); // tick 0: spawn
    expect(meleeIds(world)).toHaveLength(1);
    expect(frozen(world, p)).toBe(true);
    expect(s.hp[e]).toBe(hp0);
    const want = hp0 - computeDamage({ base: 25, attackerMult: s.dmgMult[p] ?? 1, attEl: 'earth', defEl: 'air', defReductionPct: 0 });
    step(world, [Cmd.secondary, 0]); // tick 1: first hit; recast blocked
    expect(s.hp[e]).toBe(want);
    for (let i = 0; i < 20; i++) step(world, [0, 0]);
    expect(s.hp[e]).toBe(want);
    expect(meleeIds(world)).toHaveLength(0);
    expect(frozen(world, p)).toBe(false);
    expect(Array.from(s.abil.slice(countIdx(p, 0), countIdx(p, 0) + 4)).every((c) => c === 0)).toBe(true);
  });

  // Regression: cooldown and active count were once written to the per-entity `team` array.
  it('a melee cast books its cooldown and count on the caster (legacy abilitiesInfo), for both teams', () => {
    for (const casterTeam of [0, 1] as const) {
      const { world } = duel('pax', 'pax');
      const s = world.state;
      step(world, casterTeam === 0 ? [Cmd.secondary, 0] : [0, Cmd.secondary]);
      const caster = casterTeam;
      expect(s.abil[cooldownIdx(caster, 1)]).toBeGreaterThan(0);
      expect(s.abil[cooldownIdx(1 - caster, 1)]).toBe(0);
      expect(s.abil[countIdx(caster, 1)]).toBe(1);
      expect(Array.from(s.team.slice(0, 3))).toEqual([0, 1, casterTeam]);
      expect(Array.from(s.team.slice(3)).every((t) => t === 0)).toBe(true);
    }
  });

  it('cooldown uses strict >: recast allowed 3000/20 + 1 ticks after the cast', () => {
    const { world, e } = duel('pax', 'wispera');
    step(world, [Cmd.secondary, 0]);
    for (let i = 0; i < 150; i++) step(world, [Cmd.secondary, 0]);
    expect(meleeIds(world)).toHaveLength(0); // tick 150 still blocked
    world.state.hp[e] = 1000;
    step(world, [Cmd.secondary, 0]); // tick 151
    expect(meleeIds(world)).toHaveLength(1);
  });

  it('Steal Health heals the caster by damage dealt (capped by remaining hp)', () => {
    const { world, p, e } = duel('wispera', 'pax');
    const s = world.state;
    s.hp[p] = 50;
    s.hp[e] = 4;
    step(world, [Cmd.secondary, 0]);
    step(world, [0, 0]);
    step(world, [0, 0]);
    expect(s.hp[p]).toBe(50 + 4 * (s.healMult[p] ?? 1)); // dealt = min(4, dmg) = 4
    expect(s.hp[e]).toBeLessThanOrEqual(0); // legacy leaves it negative until the HUD kills; the sim death system clamps to 0
    expect((s.flags[e] ?? 0) & EntityFlag.dead).toBeTruthy();
  });

  it('writes cooldown and active count to the per-character block, never to the per-entity team field', () => {
    const { world, p, e } = duel('wispera', 'pax');
    const s = world.state;
    const teamsBefore = [s.team[p], s.team[e]];
    step(world, [Cmd.secondary, 0]);
    expect([s.team[p], s.team[e]]).toEqual(teamsBefore);
    expect(s.abil[cooldownIdx(p, 1)]).toBeGreaterThan(0);
  });

  // KNOWN-BUG:steal-health-translucent
  it('Steal Health ignores a translucent victim (legacy checks the caster)', () => {
    const { world, p, e } = duel('wispera', 'pax');
    const s = world.state;
    s.flags[e] = (s.flags[e] ?? 0) | EntityFlag.translucent;
    s.hp[p] = 50;
    step(world, [Cmd.secondary, 0]);
    step(world, [0, 0]);
    expect(s.hp[p]).toBeGreaterThan(50);
  });

  // KNOWN-BUG:steal-health-translucent
  it.fails('Steal Health should not hit a translucent victim', () => {
    const { world, p, e } = duel('wispera', 'pax');
    const s = world.state;
    s.flags[e] = (s.flags[e] ?? 0) | EntityFlag.translucent;
    s.hp[p] = 50;
    step(world, [Cmd.secondary, 0]);
    step(world, [0, 0]);
    expect(s.hp[p]).toBe(50);
  });

  it('Strangling Branches skips a translucent victim; out of reach misses', () => {
    const { world, e } = duel('treenoc', 'pax');
    const s = world.state;
    s.flags[e] = (s.flags[e] ?? 0) | EntityFlag.translucent;
    const hp0 = s.hp[e];
    step(world, [Cmd.secondary, 0]);
    step(world, [0, 0]);
    expect(s.hp[e]).toBe(hp0);
    const far = duel('treenoc', 'pax');
    far.world.state.x[1] = 900;
    step(far.world, [Cmd.secondary, 0]);
    step(far.world, [0, 0]);
    expect(far.world.state.hp[1]).toBe(hp0);
  });

  it('Entangling Vines freezes the target for 150 ticks and releases the caster after 13', () => {
    const { world, p, e } = duel('treenoc', 'pax');
    const s = world.state;
    step(world, [Cmd.primary, 0]); // tick 0 cast
    expect(frozen(world, p)).toBe(true);
    step(world, [0, 0]); // tick 1 hit
    expect(frozen(world, e)).toBe(true);
    expect(s.hp[e]).toBe(s.maxHp[e]);
    for (let t = 2; t <= 20; t++) step(world, [0, 0]);
    expect(frozen(world, p)).toBe(false);
    expect(frozen(world, e)).toBe(true);
    for (let t = 21; t < 151; t++) step(world, [0, 0]);
    expect(frozen(world, e)).toBe(true);
    step(world, [0, 0]); // tick 151 = hit tick 1 + 150
    expect(frozen(world, e)).toBe(false);
  });

  it('Hurricane follows the caster, hits every 26 ticks with halving damage and ends after 150', () => {
    const { world, p, e } = duel('echo', 'pax');
    const s = world.state;
    s.x[1] = 600;
    s.hp[e] = 1000;
    s.maxHp[e] = 1000;
    const losses: number[] = [];
    const hits: number[] = [];
    let last = 1000;
    step(world, [Cmd.secondary, 0]);
    expect(frozen(world, p)).toBe(false); // delayAfterAttack 0
    for (let t = 1; t < 160; t++) {
      step(world, [0, 0]);
      if (s.hp[e] !== last) {
        hits.push(t);
        losses.push(last - (s.hp[e] ?? 0));
        last = s.hp[e] ?? 0;
      }
    }
    expect(hits).toEqual([1, 27, 53, 79, 105, 131]);
    const first = computeDamage({ base: 13, attackerMult: s.dmgMult[p] ?? 1, attEl: 'air', defEl: 'earth', defReductionPct: 0 });
    expect(losses[0]).toBe(first);
    expect(losses[5]).toBe(first / 32);
    expect(meleeIds(world)).toHaveLength(0);
  });

  it('Hurricane ends immediately when its caster dies', () => {
    const { world, p } = duel('echo', 'pax');
    step(world, [Cmd.secondary, 0]);
    expect(meleeIds(world)).toHaveLength(1);
    world.state.flags[p] = 0;
    step(world, [0, 0]);
    expect(meleeIds(world)).toHaveLength(0);
  });

  // KNOWN-BUG:vines-stacking (C13): two overlapping hits; the first cast's expiry unfreezes while the second holds.
  it('Entangling Vines: the first expiry unfreezes the target while a second cast is still active', () => {
    const { world, e } = duel('treenoc', 'pax');
    const s = world.state;
    step(world, [Cmd.primary, 0]); // tick 0: first cast; first hit at tick 1 -> expiry tick 151
    for (let t = 1; t <= 60; t++) step(world, [0, 0]);
    s.abil[cooldownIdx(0, 0)] = 0; // skip the 5000 ms cooldown so the casts overlap
    step(world, [Cmd.primary, 0]); // tick 61: second cast; its hit at tick 62 -> would expire at tick 212
    for (let t = 62; t <= 150; t++) step(world, [0, 0]);
    expect(frozen(world, e)).toBe(true);
    step(world, [0, 0]); // tick 151: first expiry
    expect(frozen(world, e)).toBe(false); // legacy bug: the second hit (until 212) is cut short
    for (let t = 152; t <= 211; t++) step(world, [0, 0]);
    expect(frozen(world, e)).toBe(false);
    step(world, [0, 0]); // tick 212: second expiry changes nothing
    expect(frozen(world, e)).toBe(false);
  });

  // KNOWN-BUG:ice-shock-ignores-translucent (C21)
  it('Ice Shock hits a translucent victim (legacy has no translucency check)', () => {
    const { world, e } = duel('curomo', 'pax');
    const s = world.state;
    s.flags[e] = (s.flags[e] ?? 0) | EntityFlag.translucent;
    const hp0 = s.hp[e] ?? 0;
    step(world, [Cmd.primary, 0]);
    step(world, [0, 0]);
    expect(s.hp[e]).toBeLessThan(hp0);
  });

  it('Ground Shock skips a translucent victim (contrast with Ice Shock)', () => {
    const { world, e } = duel('pax', 'wispera');
    const s = world.state;
    s.flags[e] = (s.flags[e] ?? 0) | EntityFlag.translucent;
    const hp0 = s.hp[e];
    step(world, [Cmd.secondary, 0]);
    step(world, [0, 0]);
    expect(s.hp[e]).toBe(hp0);
  });

  // KNOWN-BUG:melee-dead-caster-lingers (C22)
  it('a melee whose caster died lingers past its expiry and still lands its hit', () => {
    const { world, p, e } = duel('pax', 'wispera');
    const s = world.state;
    const hp0 = s.hp[e] ?? 0;
    step(world, [Cmd.secondary, 0]); // tick 0: spawn, expiry at tick 13
    expect(meleeIds(world)).toHaveLength(1);
    s.flags[p] = (s.flags[p] ?? 0) & ~EntityFlag.alive; // caster dies before the hit lands
    for (let t = 1; t <= 40; t++) step(world, [0, 0]);
    expect(meleeIds(world)).toHaveLength(1); // still there long after tick 13
    expect(s.hp[e]).toBeLessThan(hp0);
  });

  // KNOWN-BUG:damage-uses-target-mult (C23)
  it('damage uses the attacker team current character (multiplier and element), not the casting entity', () => {
    const world = createMatch({
      simVersion: 1, seed: 1, flags: DEFAULT_SIM_FLAGS, chapter: 1, difficulty: 1,
      p1: [{ character: characterId('pax'), xp: 1 }, { character: characterId('curomo'), xp: 1 }],
      p2: [{ character: characterId('wispera'), xp: 1 }],
    });
    const s = world.state;
    const chars = (team: number) =>
      Array.from({ length: MAX_ENTITIES }, (_, i) => i).filter(
        (i) => ((s.flags[i] ?? 0) & EntityFlag.alive) !== 0 && s.kind[i] === EntityKind.character && s.team[i] === team,
      );
    const [caster, other] = chars(0) as [number, number];
    const [victim] = chars(1) as [number];
    s.x[caster] = 500; s.y[caster] = 300; s.x[victim] = 580; s.y[victim] = 300; s.dir[caster] = 0;
    s.dmgMult[caster] = 1;
    s.dmgMult[other] = 3; // the benched teammate becomes the team's current character
    const hp0 = s.hp[victim] ?? 0;
    step(world, [Cmd.secondary, 0]); // tick 0: pax casts Ground Shock (25)
    s.flags[caster] = (s.flags[caster] ?? 0) | EntityFlag.benched;
    s.flags[other] = (s.flags[other] ?? 0) & ~EntityFlag.benched;
    step(world, [0, 0]); // tick 1: the hit lands
    const viaCaster = computeDamage({ base: 25, attackerMult: 1, attEl: 'earth', defEl: 'air', defReductionPct: 0 });
    const viaCurrent = computeDamage({ base: 25, attackerMult: 3, attEl: 'water', defEl: 'air', defReductionPct: 0 });
    expect(viaCurrent).not.toBe(viaCaster);
    expect(hp0 - (s.hp[victim] ?? 0)).toBe(viaCurrent);
  });

  it('directionalBox mirrors legacy reposition for all four facings', () => {
    expect(directionalBox(0, 100, 100, 80, 80, 240, 40)).toEqual({ x: 180, y: 120, w: 240, h: 40 });
    expect(directionalBox(4, 100, 100, 80, 80, 240, 40)).toEqual({ x: -140, y: 120, w: 240, h: 40 });
    expect(directionalBox(6, 100, 100, 80, 80, 240, 40)).toEqual({ x: 120, y: 180, w: 40, h: 240 });
    expect(directionalBox(2, 100, 100, 80, 80, 240, 40)).toEqual({ x: 120, y: -140, w: 40, h: 240 });
  });
});
