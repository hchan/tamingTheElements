import { describe, expect, it } from 'vitest';
import { HitStrength, KNOCKBACK_Q4, SUPER_BAND_PX, SUPER_COST } from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { DIR8_X, DIR8_Y } from '../../../math/dir8';
import { Cmd, type Command } from '../../commands';
import { SimEventKind } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { skipIntro } from './round-testkit';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import { ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, EntityKind, MAX_ENTITIES, countIdx } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { directionalBox } from '../melee';
import { facingFor } from '../movement';
import { castDir } from './aim';

const { up, down, left, right, primary } = Cmd;
const E = (id: number, f: number): number => id * ARCADE_E + f;
/** Held input per dir8 index (DIR8_X/Y: 0 east, then counter-clockwise on screen). */
const HELD: readonly Command[] = [right, right | up, up, left | up, left, left | down, down, right | down];
const FIRE_BLAST_SPEED = 8;

/** Caster (id 0) at (500, 400) and a far victim (id 1) out of every line from it. */
function duel(caster = 'sindarosa', arcade = true, victim = 'pax'): SimWorld {
  const setup: MatchSetup = {
    simVersion: 10, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(caster), xp: 1 }],
    p2: [{ character: characterId(victim), xp: 1 }],
  };
  const world = skipIntro(createMatch(setup));
  const s = world.state;
  s.x[0] = 500; s.y[0] = 400; s.x[1] = 1100; s.y[1] = 130;
  s.hp[1] = 10_000;
  return world;
}

function bullets(world: SimWorld): number[] {
  const out: number[] = [];
  const s = world.state;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (s.kind[id] === EntityKind.projectile && ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0) out.push(id);
  }
  return out;
}

describe('Arcade 8-way aim (FUN-DESIGN 2.12)', () => {
  it('fires along the held dir8: diagonals move exactly +-speed on both axes (DIR8 table, no normalisation)', () => {
    HELD.forEach((held, d) => {
      const world = duel();
      const s = world.state;
      step(world, [held | primary, 0]);
      const [b] = bullets(world);
      expect(b).toBeDefined();
      const id = b ?? 0;
      expect([s.dir[id], s.vx[id], s.vy[id]]).toEqual([d, (DIR8_X[d] ?? 0) * FIRE_BLAST_SPEED, (DIR8_Y[d] ?? 0) * FIRE_BLAST_SPEED]);
      const [x, y] = [s.x[id] ?? 0, s.y[id] ?? 0];
      step(world, [0, 0]);
      expect([(s.x[id] ?? 0) - x, (s.y[id] ?? 0) - y]).toEqual([(DIR8_X[d] ?? 0) * 8, (DIR8_Y[d] ?? 0) * 8]);
      // The reel facing stays 4-way: x wins, as in Classic.
      expect(s.dir[0]).toBe(facingFor(DIR8_X[d] ?? 0, DIR8_Y[d] ?? 0, -1));
    });
  });

  it('keeps the last held aim after the input is released; before any input it is the 4-way facing', () => {
    const world = duel();
    const s = world.state;
    expect([castDir(s, 0), castDir(s, 1)]).toEqual([0, 4]);
    expect(s.arcade[E(0, ArcadeE.aim)]).toBe(0);
    step(world, [left | down, 0]);
    expect([s.arcade[E(0, ArcadeE.aim)], castDir(s, 0), s.dir[0]]).toEqual([6, 5, 4]);
    step(world, [primary, 0]);
    const [b] = bullets(world);
    expect(s.dir[b ?? 0]).toBe(5);
  });

  it('Classic keeps the 4-way facing: a diagonal input fires along x, and there is no aim slot', () => {
    const world = duel('sindarosa', false);
    const s = world.state;
    step(world, [right | up | primary, 0]);
    const [b] = bullets(world);
    expect([s.dir[b ?? 0], s.vx[b ?? 0], s.vy[b ?? 0]]).toEqual([0, 8, 0]);
    expect(s.arcade.length).toBe(0);
    expect(castDir(s, 0)).toBe(s.dir[0]);
  });

  it('a diagonal shot leaves at whichever wall it reaches first and releases its active count', () => {
    const world = duel();
    const s = world.state;
    s.y[0] = 110;
    step(world, [right | up | primary, 0]);
    const [b] = bullets(world);
    const id = b ?? 0;
    expect(s.y[0]).toBe(103);
    expect(s.abil[countIdx(0, 0)]).toBe(1);
    // Top-left y starts at 103 + (80 - 15) / 2 = 135.5 and drops 8 a tick: out (< arena y 100) on the 5th move.
    for (let t = 0; t < 4; t++) step(world, [0, 0]);
    expect(bullets(world)).toEqual([id]);
    expect(s.x[id] ?? 0).toBeLessThan(world.arena.x + world.arena.w);
    step(world, [0, 0]);
    expect(bullets(world)).toEqual([]);
    expect(s.abil[countIdx(0, 0)]).toBe(0);
  });

  it('a diagonal projectile hit knocks back along its dir8', () => {
    const world = duel();
    const s = world.state;
    s.x[1] = 700; s.y[1] = 200;
    let hit = false;
    for (let t = 0; t < 60 && !hit; t++) {
      // Hold still after the first tick so the line from (500, 400) stays exact.
      hit = step(world, [t === 0 ? right | up | primary : 0, 0]).some((e) => e.kind === SimEventKind.hitConfirmed);
    }
    expect(hit).toBe(true);
    // Fire Blast (base 40) is a heavy hit: 224 Q4 on each axis, the DIR8 signs of north-east.
    const kb = KNOCKBACK_Q4[HitStrength.heavy];
    expect([s.arcade[E(1, ArcadeE.kbVx)], s.arcade[E(1, ArcadeE.kbVy)]]).toEqual([kb, -kb]);
  });

  it('diagonal melee boxes are (w + h) / 2 squares off the caster corner on the aim side', () => {
    // Ice Shock 240 x 40 -> 140; caster box (500, 400, 80, 80).
    expect(directionalBox(1, 500, 400, 80, 80, 240, 40)).toEqual({ x: 580, y: 260, w: 140, h: 140 });
    expect(directionalBox(3, 500, 400, 80, 80, 240, 40)).toEqual({ x: 360, y: 260, w: 140, h: 140 });
    expect(directionalBox(5, 500, 400, 80, 80, 240, 40)).toEqual({ x: 360, y: 480, w: 140, h: 140 });
    expect(directionalBox(7, 500, 400, 80, 80, 240, 40)).toEqual({ x: 580, y: 480, w: 140, h: 140 });
    // Cardinals are the legacy boxes.
    expect(directionalBox(0, 500, 400, 80, 80, 240, 40)).toEqual({ x: 580, y: 420, w: 240, h: 40 });
    expect(directionalBox(2, 500, 400, 80, 80, 240, 40)).toEqual({ x: 520, y: 160, w: 40, h: 240 });
  });

  it('an aimed diagonal melee spawns that box, hits a victim on the diagonal and knocks it back along it', () => {
    const world = duel('curomo');
    const s = world.state;
    step(world, [right | up, 0]);
    const [cx, cy] = [s.x[0] ?? 0, s.y[0] ?? 0];
    s.x[1] = cx + 120; s.y[1] = cy - 120;
    const ev = step(world, [primary, 0]);
    let melee = -1;
    for (let id = 0; id < MAX_ENTITIES; id++) if (s.kind[id] === EntityKind.melee && ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0) melee = id;
    expect(melee).toBeGreaterThanOrEqual(0);
    expect([s.dir[melee], s.x[melee], s.y[melee], s.w[melee], s.h[melee]]).toEqual([1, cx + 80, cy - 140, 140, 140]);
    expect(ev.some((e) => e.kind === SimEventKind.hitConfirmed)).toBe(false);
    const hit = step(world, [0, 0]).find((e) => e.kind === SimEventKind.hitConfirmed);
    expect(hit).toMatchObject({ target: 1, dir: 1 });
    expect(Math.sign(s.arcade[E(1, ArcadeE.kbVx)] ?? 0)).toBe(1);
    expect(Math.sign(s.arcade[E(1, ArcadeE.kbVy)] ?? 0)).toBe(-1);
  });

  it('the super band keeps the 4-way facing: aimed north-east it runs east, 160 px tall', () => {
    const world = duel();
    const s = world.state;
    s.arcade[ARCADE_TEAM_BASE + ArcadeT.meter] = SUPER_COST;
    step(world, [right | up, 0]);
    step(world, [Cmd.super, 0]);
    const fx = (s.arcade[ARCADE_TEAM_BASE + 0 * ARCADE_T + ArcadeT.superState] ?? 0) - 1;
    expect(fx).toBeGreaterThanOrEqual(0);
    expect([s.dir[fx], s.h[fx], s.x[fx]]).toEqual([0, SUPER_BAND_PX, (s.x[0] ?? 0) + 40]);
  });

  it('the aim is hashed and survives a snapshot round trip', () => {
    const a = duel();
    const b = duel();
    step(a, [right | up, 0]);
    step(b, [right, 0]);
    for (const w of [a, b]) {
      const s = w.state;
      s.x[0] = 500; s.px[0] = 500; s.y[0] = 400; s.py[0] = 400; s.vx[0] = 0; s.vy[0] = 0;
    }
    expect(a.state.dir[0]).toBe(b.state.dir[0]);
    expect(hash(a.state)).not.toBe(hash(b.state));
    const buf = createSnapshotBuf(a.state);
    snapshot(a.state, buf);
    const c = duel();
    restore(c.state, buf);
    expect(hash(c.state)).toBe(hash(a.state));
    for (let t = 0; t < 20; t++) {
      const cmds: [Command, Command] = [t === 0 ? primary : 0, 0];
      step(a, cmds);
      step(c, cmds);
      expect(hash(c.state)).toBe(hash(a.state));
    }
    expect(c.state.dir[bullets(c)[0] ?? 0]).toBe(1);
  });
});
