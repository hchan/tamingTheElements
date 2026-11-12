import { describe, expect, it } from 'vitest';
import { arcadePlayfield, TrapKind } from '../../data/arcade';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd } from '../../sim/commands';
import { createMatch, type MatchSetup } from '../../sim/match';
import { ARCADE_WORLD_BASE, ArcadeW, TRAP_STRIDE, TRAP_TABLE, TrapF } from '../../sim/state';
import { createObservationView, type ArcadeView, type FighterView, type ObservationView, type TrapView } from '../agent';
import { ARCADE_AI_STALE_TICKS, ArcadeTactics } from './arcade';
import {
  AI_EASY, AI_HARD, AI_NORMAL, ARCADE_AI_TRAP_BAND, RUSHDOWN, TRAP_CORNER, TRAP_NONE, TRAP_ROOT, TRAP_ZONE, TURTLE, ZONER,
  centreDist, foeInOwnPuddle, trapDashable, trapNudge, trapOnStep, trapReason, trapSpotFree, trapToDouse,
} from './arcade-ai';

const SETUP: MatchSetup = {
  simVersion: 1, seed: 11, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
  p1: [{ character: characterId('sindarosa'), xp: 1 }],
  p2: [{ character: characterId('treenoc'), xp: 1 }],
};

function fighter(x: number, y: number): FighterView {
  return { id: 0, x, y, w: 80, h: 80, hp: 100, maxHp: 100, flags: 1, alive: true };
}

const FREE: ArcadeView = {
  meter: 0, oppMeter: 0, selfStun: 0, oppStun: 0, freeze: 0, combo: 0, oppCombo: 0, superActive: false, superId: 0, prevCmd: 0,
  primaryAge: -1, secondaryAge: -1, phase: 1, shots: [], dashIn: 0, weatherIn: 0, chargeIn: -1, weatherCharge: 0, tagIn: 0,
  partnerPm: -1, partner2Pm: -1, rocks: [], snagSlot: -1, oppGuarding: false, oppRooted: 0, oppRootImmune: 0,
  traps: [], trapIn: 0, trapCount: 0, fireShot: false,
};

function view(arcade: Partial<ArcadeView>, tick = 0, self = fighter(200, 300), opp = fighter(700, 300)): ObservationView {
  return { side: 0, tick, self, opponent: opp, cooldowns: [0, 0, 0, 0], matchSeed: 0, arcade: { ...FREE, ...arcade } };
}

const foe = (kind: number, x: number, y: number, armIn = 0): TrapView => ({ kind, x, y, own: false, armIn, left: 100 });
const PF = arcadePlayfield();
const ME = fighter(200, 300);
/** A foe trap just right of ME (its trigger square starts 6 px past ME's right edge): a step right enters it. */
const AHEAD = 310;

/** Walks the foe in from `from` to `to` px (centre to centre) by 4 px per tick; the first distance that drew a plant, or -1. */
function approach(level: typeof AI_EASY | typeof AI_NORMAL | typeof AI_HARD, style: typeof RUSHDOWN | typeof ZONER | typeof TURTLE, from: number, to: number, extra: Partial<ArcadeView> = {}): number {
  const t = new ArcadeTactics(level, style);
  for (let d = from, tick = 0; d >= to; d -= 4, tick++) {
    if ((t.apply(view(extra, tick, ME, fighter(200 + d, 300)), Cmd.right) & Cmd.trap) !== 0) return d;
  }
  return -1;
}

describe('ObservationView.arcade traps (WP 39c)', () => {
  it('lists every live trap with its owner, arm and life ticks left; the ready tick, team count and fire shot', () => {
    const world = createMatch(SETUP);
    const s = world.state;
    const g = s.arcade[ARCADE_WORLD_BASE + ArcadeW.gameTick] ?? 0;
    const b = ARCADE_WORLD_BASE + TRAP_TABLE + TRAP_STRIDE;
    s.arcade[b + TrapF.kind] = TrapKind.spike;
    s.arcade[b + TrapF.x] = 400;
    s.arcade[b + TrapF.y] = 320;
    s.arcade[b + TrapF.team] = 1;
    s.arcade[b + TrapF.armAt] = g + 10;
    s.arcade[b + TrapF.endAt] = g + 210;
    const v0 = createObservationView(world, 0).arcade;
    const v1 = createObservationView(world, 1).arcade;
    expect(v0?.traps).toEqual([{ kind: TrapKind.spike, x: 400, y: 320, own: false, armIn: 10, left: 210 }]);
    expect(v1?.traps[0]?.own).toBe(true);
    expect(v0?.trapCount).toBe(0);
    expect(v1?.trapCount).toBe(1);
    expect([v0?.trapIn, v0?.fireShot, v1?.fireShot]).toEqual([0, true, false]);
  });
});

describe('trap placement (WP 39c)', () => {
  it('trapReason: an approaching foe in the style band; Rushdown late, Zoner early; never under 96 px', () => {
    const at = (d: number): FighterView => fighter(200 + d, 300);
    const reason = (style: typeof RUSHDOWN | typeof ZONER | typeof TURTLE, d: number, prev: number, rooted = 0, level: typeof AI_NORMAL | typeof AI_HARD = AI_NORMAL): number =>
      trapReason(level, style, ME, at(d), centreDist(ME, at(d)), prev, rooted, PF);
    expect(reason(ZONER, 300, 304)).toBe(TRAP_ZONE);
    expect(reason(ZONER, 300, 300)).toBe(TRAP_NONE); // not closing
    expect(reason(ZONER, 300, -1)).toBe(TRAP_NONE); // first tick
    expect(reason(RUSHDOWN, 300, 304)).toBe(TRAP_NONE); // too early for Rushdown
    expect(reason(RUSHDOWN, 200, 204)).toBe(TRAP_ZONE);
    expect(reason(ZONER, 200, 204)).toBe(TRAP_NONE); // too late for a Zoner
    expect(reason(TURTLE, 250, 254)).toBe(TRAP_ZONE);
    expect(ARCADE_AI_TRAP_BAND[RUSHDOWN]?.[1]).toBeLessThan(ARCADE_AI_TRAP_BAND[ZONER]?.[0] ?? 0);
    expect(reason(TURTLE, 90, 94, 30, AI_HARD)).toBe(TRAP_NONE); // under 96 px, even rooted
  });

  it('trapReason: cornered (own back within 120 px of a side wall, the foe on the open side)', () => {
    const left = fighter(40, 300);
    const right = fighter(PF.w - 120, 300);
    expect(trapReason(AI_NORMAL, RUSHDOWN, left, fighter(300, 300), 260, 260, 0, PF)).toBe(TRAP_CORNER);
    expect(trapReason(AI_NORMAL, RUSHDOWN, right, fighter(PF.w - 380, 300), 260, 260, 0, PF)).toBe(TRAP_CORNER);
    expect(trapReason(AI_NORMAL, RUSHDOWN, right, fighter(PF.w - 1000, 300), 880, 880, 0, PF)).toBe(TRAP_NONE); // foe far
    expect(trapReason(AI_NORMAL, RUSHDOWN, ME, fighter(460, 300), 260, 260, 0, PF)).toBe(TRAP_NONE); // back 200 px
  });

  it('trapReason: Hard plants on a foe rooted by its Snag within 200 px; Normal does not', () => {
    expect(trapReason(AI_HARD, ZONER, ME, fighter(350, 300), 150, 150, 40, PF)).toBe(TRAP_ROOT);
    expect(trapReason(AI_NORMAL, ZONER, ME, fighter(350, 300), 150, 150, 40, PF)).toBe(TRAP_NONE);
    expect(trapReason(AI_HARD, ZONER, ME, fighter(450, 300), 250, 250, 40, PF)).toBe(TRAP_NONE); // rooted but too far
  });

  it('ArcadeTactics plants on an approaching foe inside its style band only (no movement, no attack)', () => {
    const zoner = approach(AI_HARD, ZONER, 400, 100);
    expect(zoner).toBeGreaterThanOrEqual(240);
    expect(zoner).toBeLessThanOrEqual(360);
    const rush = approach(AI_HARD, RUSHDOWN, 400, 100);
    expect(rush).toBeGreaterThanOrEqual(160);
    expect(rush).toBeLessThanOrEqual(220);
    const t = new ArcadeTactics(AI_HARD, ZONER);
    t.apply(view({}, 0, ME, fighter(504, 300)), Cmd.right);
    let cmd = 0;
    for (let tick = 1; tick < 200 && (cmd & Cmd.trap) === 0; tick++) cmd = t.apply(view({}, tick, ME, fighter(504 - tick % 2, 300)), Cmd.right | Cmd.primary);
    expect(cmd).toBe(Cmd.trap);
  });

  it('a stale fight (no HP change for ARCADE_AI_STALE_TICKS) presses: no zoning plant, a rooted foe still draws one', () => {
    // About 200 px: inside the Turtle band and the Rushdown one a stale fight plays.
    const plants = (from: number): number => {
      const t = new ArcadeTactics(AI_HARD, TURTLE);
      t.apply(view({}, 0, ME, fighter(404, 300)), Cmd.right);
      let any = 0;
      for (let tick = from; tick < from + 200; tick++) any |= t.apply(view({}, tick, ME, fighter(404 - tick % 2, 300)), Cmd.right | Cmd.primary) & Cmd.trap;
      return any;
    };
    expect(plants(1)).toBe(Cmd.trap);
    expect(plants(ARCADE_AI_STALE_TICKS)).toBe(0);
    const t = new ArcadeTactics(AI_HARD, TURTLE);
    t.apply(view({}, 0, ME, fighter(404, 300)), Cmd.right);
    expect(t.apply(view({ oppRooted: 40 }, ARCADE_AI_STALE_TICKS + 300, ME, fighter(350, 300)), Cmd.right)).toBe(Cmd.trap);
  });

  it('plants at a rate by level: Easy rarely, Hard at once', () => {
    const count = (level: typeof AI_EASY | typeof AI_NORMAL | typeof AI_HARD): number => {
      let n = 0;
      for (let seed = 0; seed < 40; seed++) {
        const t = new ArcadeTactics(level, ZONER);
        t.apply({ ...view({}, 0, ME, fighter(504, 300)), matchSeed: seed }, Cmd.right);
        if ((t.apply({ ...view({}, 1, ME, fighter(500, 300)), matchSeed: seed }, Cmd.right) & Cmd.trap) !== 0) n++;
      }
      return n;
    };
    expect(count(AI_EASY)).toBeLessThan(count(AI_NORMAL));
    expect(count(AI_NORMAL)).toBeLessThan(count(AI_HARD));
  });

  it('Hard plants at once on a rooted foe (no draw), before closing in', () => {
    const t = new ArcadeTactics(AI_HARD, ZONER);
    expect(t.apply(view({ oppRooted: 40 }, 0, ME, fighter(350, 300)), Cmd.right)).toBe(Cmd.trap);
    expect((t.save() as { rng: unknown }).rng).toBe(null);
    expect(new ArcadeTactics(AI_NORMAL, ZONER).apply(view({ oppRooted: 40 }, 0, ME, fighter(350, 300)), Cmd.right) & Cmd.trap).toBe(0);
  });

  it('never plants when stunned, threatened, on cooldown, at the team cap, holding the press, or on a blocked spot', () => {
    const plants = (a: Partial<ArcadeView>): boolean =>
      (new ArcadeTactics(AI_HARD, ZONER).apply(view({ oppRooted: 40, ...a }, 0, ME, fighter(350, 300)), Cmd.right) & Cmd.trap) !== 0;
    expect(plants({})).toBe(true);
    expect(plants({ selfStun: 5 })).toBe(false);
    expect(plants({ superActive: true })).toBe(false);
    expect(plants({ shots: [{ x: 300, y: 330, w: 20, h: 20, vx: -8, vy: 0 }] })).toBe(false);
    expect(plants({ trapIn: 1 })).toBe(false);
    expect(plants({ trapCount: 2 })).toBe(false);
    expect(plants({ prevCmd: Cmd.trap })).toBe(false);
    expect(plants({ traps: [{ ...foe(TrapKind.spike, 290, 320), own: true }] })).toBe(false);
  });

  it('trapSpotFree: the auto-faced spot 72 px ahead, clamped, against every trap within 64 px', () => {
    // ME's centre (240, 340): facing right the trap box lands at (284, 312).
    expect(trapSpotFree(ME, fighter(500, 300), [], PF)).toBe(true);
    expect(trapSpotFree(ME, fighter(500, 300), [foe(TrapKind.gust, 284 + 63, 312)], PF)).toBe(false);
    expect(trapSpotFree(ME, fighter(500, 300), [foe(TrapKind.gust, 284 + 64, 312)], PF)).toBe(true);
    expect(trapSpotFree(ME, fighter(0, 300), [foe(TrapKind.gust, 284, 312)], PF)).toBe(true); // facing left
  });
});

describe('trap avoidance (WP 39c)', () => {
  it('trapOnStep: a foe trap the next step enters; never an own trap, one already stood in, or no step', () => {
    const t = foe(TrapKind.spike, AHEAD, 312);
    expect(trapOnStep(ME, [t], Cmd.right)).toBe(t);
    expect(trapOnStep(ME, [t], Cmd.left)).toBeUndefined();
    expect(trapOnStep(ME, [t], 0)).toBeUndefined();
    expect(trapOnStep(ME, [{ ...t, own: true }], Cmd.right)).toBeUndefined();
    expect(trapOnStep(ME, [{ ...t, x: 260 }], Cmd.right)).toBeUndefined(); // inside: walks out as it is
  });

  it('trapNudge: sideways to the nearer edge, with the blocked move when that is free, else stands', () => {
    const t = foe(TrapKind.spike, AHEAD, 312);
    expect(trapNudge(ME, [t], t, Cmd.right, PF)).toBe(Cmd.down); // centred: down first; right + down still enters
    expect(trapNudge(ME, [t], { ...t, y: 330 }, Cmd.right, PF)).toBe(Cmd.up);
    const far = foe(TrapKind.spike, AHEAD, 400);
    expect(trapNudge(ME, [far], far, Cmd.right, PF)).toBe(Cmd.up | Cmd.right); // a low trap: up and on
    const boxed = [t, foe(TrapKind.gust, 200, 405), foe(TrapKind.gust, 200, 215)];
    expect(trapNudge(ME, boxed, t, Cmd.right, PF)).toBe(0);
  });

  it('ArcadeTactics steps round a foe trap on its path, keeping the attack; guard, dash and super pass', () => {
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    const traps = [foe(TrapKind.puddle, AHEAD, 312)];
    expect(t.apply(view({ traps }), Cmd.right | Cmd.primary)).toBe(Cmd.down | Cmd.primary);
    expect(t.apply(view({ traps: [{ ...traps[0] as TrapView, own: true }] }), Cmd.right)).toBe(Cmd.right);
    expect(t.apply(view({ traps }), Cmd.guard)).toBe(Cmd.guard);
  });

  it('Normal and Hard dash across a foe Fire Bomb or Spike that arms after the dash; an armed one, a Puddle or no dash: nudge', () => {
    expect(trapDashable(AI_NORMAL, foe(TrapKind.fireBomb, 0, 0, 20))).toBe(true);
    expect(trapDashable(AI_HARD, foe(TrapKind.spike, 0, 0, 13))).toBe(true);
    expect(trapDashable(AI_HARD, foe(TrapKind.spike, 0, 0, 12))).toBe(false);
    expect(trapDashable(AI_HARD, foe(TrapKind.puddle, 0, 0, 20))).toBe(false);
    expect(trapDashable(AI_EASY, foe(TrapKind.fireBomb, 0, 0, 20))).toBe(false);
    const go = (a: Partial<ArcadeView>): number => new ArcadeTactics(AI_HARD, ZONER).apply(view(a), Cmd.right);
    expect(go({ traps: [foe(TrapKind.fireBomb, AHEAD, 312, 25)] })).toBe(Cmd.dash | Cmd.right);
    expect(go({ traps: [foe(TrapKind.fireBomb, AHEAD, 312, 0)] })).toBe(Cmd.down);
    expect(go({ traps: [foe(TrapKind.fireBomb, AHEAD, 312, 25)], dashIn: 5 })).toBe(Cmd.down);
  });

  it('Easy avoids in the first half of every 256 ticks and walks into foe traps in the second half', () => {
    const traps = [foe(TrapKind.spike, AHEAD, 312)];
    const easy = new ArcadeTactics(AI_EASY, ZONER);
    expect(easy.apply(view({ traps }, 100), Cmd.right)).toBe(Cmd.down);
    expect(easy.apply(view({ traps }, 200), Cmd.right)).toBe(Cmd.right);
    expect(new ArcadeTactics(AI_NORMAL, ZONER).apply(view({ traps }, 200), Cmd.right)).toBe(Cmd.down);
  });

  it('a stale fight (no HP change for ARCADE_AI_STALE_TICKS) walks on through foe traps', () => {
    const traps = [foe(TrapKind.spike, AHEAD, 312)];
    const t = new ArcadeTactics(AI_HARD, ZONER);
    expect(t.apply(view({ traps }, 0), Cmd.right)).toBe(Cmd.down);
    expect(t.apply(view({ traps }, ARCADE_AI_STALE_TICKS - 1), Cmd.right)).toBe(Cmd.down);
    expect(t.apply(view({ traps }, ARCADE_AI_STALE_TICKS), Cmd.right) & (Cmd.up | Cmd.down | Cmd.left | Cmd.right)).toBe(Cmd.right);
  });
});

describe('stale ranged fight (WP 39c)', () => {
  it('an idle ranged hero walks at the foe once the fight is stale (Normal and Hard); before that, or at Easy, it stands', () => {
    const opp = fighter(700, 348); // off the horizontal line: no aligned shot
    const go = (level: typeof AI_EASY | typeof AI_NORMAL | typeof AI_HARD, tick: number, base = 0): number => {
      const t = new ArcadeTactics(level, ZONER);
      t.apply(view({}, 0, ME, opp), 0);
      return t.apply(view({}, tick, ME, opp), base);
    };
    expect(go(AI_NORMAL, ARCADE_AI_STALE_TICKS - 1)).toBe(0);
    expect(go(AI_NORMAL, ARCADE_AI_STALE_TICKS)).toBe(Cmd.right | Cmd.down);
    expect(go(AI_HARD, ARCADE_AI_STALE_TICKS)).toBe(Cmd.right | Cmd.down);
    expect(go(AI_EASY, ARCADE_AI_STALE_TICKS)).toBe(0);
    expect(go(AI_NORMAL, ARCADE_AI_STALE_TICKS, Cmd.up)).toBe(Cmd.up); // a move of its own stands
  });
});

describe('trap counter (WP 39c, Hard)', () => {
  it('trapToDouse: a foe Puddle or Gust nearer than the foe in its 8-way direction', () => {
    const opp = fighter(700, 300);
    expect(trapToDouse(ME, opp, [foe(TrapKind.puddle, 400, 312)])).toBe(true);
    expect(trapToDouse(ME, opp, [foe(TrapKind.gust, 400, 312)])).toBe(true);
    expect(trapToDouse(ME, opp, [foe(TrapKind.spike, 400, 312)])).toBe(false); // fire does not douse a Spike
    expect(trapToDouse(ME, opp, [{ ...foe(TrapKind.puddle, 400, 312), own: true }])).toBe(false);
    expect(trapToDouse(ME, opp, [foe(TrapKind.puddle, 900, 312)])).toBe(false); // behind the foe
    expect(trapToDouse(ME, opp, [foe(TrapKind.puddle, 400, 500)])).toBe(false); // another direction
  });

  it('a Hard fire hero shoots a foe Puddle between the two; Normal, a non-fire hero or no ready shot do not', () => {
    const traps = [foe(TrapKind.puddle, 400, 312)];
    expect(new ArcadeTactics(AI_HARD, ZONER).apply(view({ traps, fireShot: true }), Cmd.left, Cmd.primary)).toBe(Cmd.primary);
    expect(new ArcadeTactics(AI_NORMAL, ZONER).apply(view({ traps, fireShot: true }), Cmd.left, Cmd.primary)).toBe(Cmd.left);
    expect(new ArcadeTactics(AI_HARD, ZONER).apply(view({ traps }), Cmd.left, Cmd.primary)).toBe(Cmd.left);
    expect(new ArcadeTactics(AI_HARD, ZONER).apply(view({ traps, fireShot: true }), Cmd.left, 0)).toBe(Cmd.left);
  });
});

describe('Trap follow-up (WP 39f)', () => {
  const own = (kind: number, x: number, y: number, armIn = 0): TrapView => ({ kind, x, y, own: true, armIn, left: 100 });
  const far = fighter(450, 300);

  it('a melee hero presses a foe standing in its own armed Puddle, for the slow and its linger', () => {
    const t = new ArcadeTactics(AI_NORMAL, RUSHDOWN);
    const puddle = own(TrapKind.puddle, 400, 290);
    expect(foeInOwnPuddle(far, [puddle])).toBe(true);
    expect(foeInOwnPuddle(far, [own(TrapKind.puddle, 400, 290, 5)])).toBe(false);
    const cmd = t.apply(view({ chargeIn: 500, traps: [puddle], prevCmd: Cmd.trap }, 10, ME, far), 0);
    expect(cmd & Cmd.right).not.toBe(0);
    // Still pressing after the foe left the puddle (the slow lingers), not after the window ran out.
    const after = t.apply(view({ chargeIn: 500, traps: [] }, 40, ME, far), 0);
    expect(after & Cmd.right).not.toBe(0);
    expect(t.apply(view({ chargeIn: 500, traps: [] }, 100, ME, far), 0) & Cmd.right).toBe(0);
  });

  it('presses after an own Gust vanished (it shoved the foe, or dried up)', () => {
    const t = new ArcadeTactics(AI_NORMAL, RUSHDOWN);
    const gust = own(TrapKind.gust, 400, 290);
    expect(t.apply(view({ chargeIn: 500, traps: [gust] }, 10, ME, far), 0) & Cmd.right).toBe(0);
    expect(t.apply(view({ chargeIn: 500, traps: [] }, 11, ME, far), 0) & Cmd.right).not.toBe(0);
  });

  it('Easy never presses', () => {
    const t = new ArcadeTactics(AI_EASY, RUSHDOWN);
    expect(t.apply(view({ chargeIn: 500, traps: [own(TrapKind.puddle, 400, 290)] }, 10, ME, far), 0) & Cmd.right).toBe(0);
  });
});
