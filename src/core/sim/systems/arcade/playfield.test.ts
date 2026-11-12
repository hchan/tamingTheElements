import { describe, expect, it } from 'vitest';
import { ARCADE_START_Y, PLAYFIELD_INSET_BOTTOM, PLAYFIELD_INSET_TOP, SUPER_COST, arcadePlayfield } from '../../../data/arcade';
import { ARENA_HEIGHT, ARENA_WIDTH, CHARACTER_HEIGHT, CHARACTER_WIDTH } from '../../../data/chapters';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { Cmd, type Command } from '../../commands';
import { createMatch, START_Y, type MatchSetup } from '../../match';
import { ARCADE_TEAM_BASE, ArcadeT, EntityFlag, EntityKind, MAX_ENTITIES } from '../../state';
import { step } from '../../step';
import { DEFAULT_ARENA, type SimWorld } from '../../world';
import { setKnockback } from './knockback';
import { skipIntro } from './round-testkit';

// WP-arcade-playfield-bounds: every Arcade clamp site uses the one playfield rectangle (y 200..640), Classic the legacy one.
const PF = arcadePlayfield();
const BOTTOM = PF.y + PF.h - CHARACTER_HEIGHT;
const RIGHT = PF.x + PF.w - CHARACTER_WIDTH;

function match(arcade: boolean, two = false): SimWorld {
  const roster = (c: string): MatchSetup['p1'] => (two ? [c, 'cyclonius'] : [c]).map((x) => ({ character: characterId(x), xp: 1 }));
  const setup: MatchSetup = {
    simVersion: 19, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: roster('sindarosa'), p2: roster('pax'),
  };
  return skipIntro(createMatch(setup));
}

/** Player 0 at (x, y), the foe parked far away inside the field. */
function duel(x: number, y: number): SimWorld {
  const w = match(true);
  const s = w.state;
  [s.x[0], s.y[0], s.x[1], s.y[1]] = [x, y, 1100, 300];
  s.hp[1] = 100_000;
  return w;
}

function hold(w: SimWorld, n: number, cmd: Command): void {
  for (let i = 0; i < n; i++) step(w, [cmd, 0]);
}

const inside = (w: SimWorld, id: number): boolean => {
  const s = w.state;
  const [x, y] = [s.x[id] ?? 0, s.y[id] ?? 0];
  return x >= PF.x && y >= PF.y && x + (s.w[id] ?? 0) <= PF.x + PF.w && y + (s.h[id] ?? 0) <= PF.y + PF.h;
};

describe('playfield rectangle', () => {
  it('is integer, 1280 wide, between the HUD (200) and the action bar (640), and one shared object', () => {
    expect(PF).toEqual({ x: 0, y: 200, w: ARENA_WIDTH, h: 440 });
    expect([PLAYFIELD_INSET_TOP, PLAYFIELD_INSET_BOTTOM]).toEqual([200, 80]);
    expect(PF.y + PF.h).toBe(ARENA_HEIGHT - PLAYFIELD_INSET_BOTTOM);
    expect(arcadePlayfield()).toBe(PF);
    expect(Number.isInteger(ARCADE_START_Y)).toBe(true);
  });

  it('Arcade worlds use it, Classic keeps the legacy arena and start row', () => {
    expect(match(true).arena).toBe(PF);
    expect(match(false).arena).toBe(DEFAULT_ARENA);
    expect(match(false).state.y[0]).toBe(START_Y);
  });

  it('spawns are inside, vertically centred and mirrored, for every roster member', () => {
    const s = match(true, true).state;
    for (let id = 0; id < 4; id++) expect(s.y[id]).toBe(ARCADE_START_Y);
    expect(ARCADE_START_Y - PF.y).toBe(PF.y + PF.h - ARCADE_START_Y - CHARACTER_HEIGHT);
    expect((s.x[0] ?? 0) - PF.x).toBe(PF.x + PF.w - (s.x[2] ?? 0) - CHARACTER_WIDTH);
  });
});

describe('every Arcade clamp site respects it', () => {
  it('input movement: walking up and down stops at the playfield edges (a blocked step, no overlap)', () => {
    const w = duel(500, 300);
    hold(w, 100, Cmd.up);
    expect(w.state.y[0]).toBeGreaterThanOrEqual(PF.y);
    expect(w.state.y[0]).toBeLessThan(PF.y + 8);
    hold(w, 200, Cmd.down);
    expect(w.state.y[0]).toBeLessThanOrEqual(BOTTOM);
    expect(w.state.y[0]).toBeGreaterThan(BOTTOM - 8);
  });

  it('knockback clamps to the playfield and the first wall contact bounces it back', () => {
    const w = duel(500, BOTTOM - 10);
    setKnockback(w.state, 0, 224, 6);
    step(w, [0, 0]);
    expect(w.state.y[0]).toBe(BOTTOM);
    step(w, [0, 0]);
    expect(w.state.y[0]).toBeLessThan(BOTTOM);
    const top = duel(500, PF.y + 10);
    setKnockback(top.state, 0, 224, 2);
    step(top, [0, 0]);
    expect(top.state.y[0]).toBe(PF.y);
  });

  it('dash stops at the bottom and top edges', () => {
    const w = duel(500, BOTTOM - 20);
    hold(w, 1, Cmd.down | Cmd.dash);
    hold(w, 20, Cmd.down);
    expect(w.state.y[0]).toBe(BOTTOM);
    const t = duel(500, PF.y + 20);
    hold(t, 1, Cmd.up | Cmd.dash);
    hold(t, 20, Cmd.up);
    expect(t.state.y[0]).toBe(PF.y);
  });

  it('a projectile that leaves through the top edge expires', () => {
    const w = duel(500, PF.y + 10);
    step(w, [Cmd.up | Cmd.right | Cmd.primary, 0]);
    const live = (): number[] => {
      const out: number[] = [];
      for (let id = 0; id < MAX_ENTITIES; id++) {
        if (w.state.kind[id] === EntityKind.projectile && ((w.state.flags[id] ?? 0) & EntityFlag.alive) !== 0) out.push(id);
      }
      return out;
    };
    expect(live()).toHaveLength(1);
    for (let t = 0; t < 30; t++) {
      for (const id of live()) expect(w.state.y[id] ?? 0).toBeGreaterThanOrEqual(PF.y);
      step(w, [0, 0]);
    }
    expect(live()).toHaveLength(0);
  });

  it('the super band stops at the playfield edge (facing up or down)', () => {
    for (const dir of [2, 6]) {
      const w = duel(500, 300);
      w.state.arcade[ARCADE_TEAM_BASE + ArcadeT.meter] = SUPER_COST;
      // Auto-face: the band follows the foe, so put the foe above (dir 2) or below (dir 6) the caster.
      [w.state.x[1], w.state.y[1]] = [500, dir === 2 ? 0 : 600];
      step(w, [Cmd.super, 0]);
      const fx = (w.state.arcade[ARCADE_TEAM_BASE + ArcadeT.superState] ?? 0) - 1;
      const [fy, fh] = [w.state.y[fx] ?? 0, w.state.h[fx] ?? 0];
      if (dir === 2) expect(fy).toBe(PF.y);
      else expect(fy + fh).toBe(PF.y + PF.h);
    }
  });

  it('a tag entrance at the outgoing spot (bottom-right corner) stays inside', () => {
    const w = match(true, true);
    const s = w.state;
    [s.x[0], s.y[0]] = [RIGHT, BOTTOM];
    step(w, [Cmd.swap1, 0]);
    expect(inside(w, 1)).toBe(true);
    expect([s.x[1], s.y[1]]).toEqual([RIGHT, BOTTOM]);
  });

  it('the left and right edges still clamp (x is unchanged by the insets)', () => {
    const w = duel(2, 300);
    hold(w, 20, Cmd.left);
    expect(w.state.x[0]).toBeGreaterThanOrEqual(0);
    expect(inside(w, 0)).toBe(true);
  });
});

describe('Classic is untouched', () => {
  it('a Classic character can still walk below the Arcade bottom edge (to the legacy y 720)', () => {
    const w = match(false);
    w.state.y[0] = 600;
    hold(w, 100, Cmd.down);
    expect(w.state.y[0] + CHARACTER_HEIGHT).toBeGreaterThan(ARENA_HEIGHT - 20);
  });
});
