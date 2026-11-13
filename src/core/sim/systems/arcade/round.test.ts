import { describe, expect, it } from 'vitest';
import {
  HitStopCause, KO_HIT_STOP_TICKS, KO_PHASE_TICKS, KO_SLOWMO_TICKS, METER_BAR, ROUNDS_TO_WIN, ROUND_END_TICKS, SUDDEN_HP_PM, SUDDEN_TIMER_TICKS,
  ROUND_INTRO_TICKS, ROUND_TIMER_TICKS, RoundPhase, ARCADE_P1_START_X, ARCADE_P2_START_X, ARCADE_START_Y,
} from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { clockHeld, inFight, isFrozen, isSlowMoHold, now, roundPhase } from '../../clock';
import { Cmd, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, P1_START_X, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, EntityFlag, EntityKind,
  MAX_ENTITIES, STATUS_STRIDE, TEAM_STRIDE, TeamField, World, cooldownIdx, countIdx,
} from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { hasEnded, matchWinner } from '../end';
import { StatusId } from '../status';
import { canAct, isInvulnerable } from './stun';
import { roundsWon, teamHpPm } from './round';
import { skipIntro } from './round-testkit';

const IDLE: readonly [Command, Command] = [0, 0];
const AW = (f: number): number => ARCADE_WORLD_BASE + f;
const METER = (team: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + ArcadeT.meter;
/** First tick of round 1's fight: the intro runs ROUND_INTRO_TICKS after the roundStarted tick (0). */
const FIRST_FIGHT_TICK = ROUND_INTRO_TICKS + 1;

function setupOf(p1: readonly string[], p2: readonly string[], arcade = true): MatchSetup {
  return {
    simVersion: 11, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: p1.map((c) => ({ character: characterId(c), xp: 1 })),
    p2: p2.map((c) => ({ character: characterId(c), xp: 1 })),
  };
}

const duel = (p1: readonly string[] = ['sindarosa'], p2: readonly string[] = ['pax'], arcade = true): SimWorld =>
  createMatch(setupOf(p1, p2, arcade));

const tickOf = (w: SimWorld): number => w.state.world[World.tick] ?? 0;

function run(world: SimWorld, n: number, cmds: readonly [Command, Command] = IDLE): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...step(world, cmds));
  return out;
}

const of = (ev: readonly SimEvent[], kind: number): SimEvent[] => ev.filter((e) => e.kind === kind);
const kindsOf = (ev: readonly SimEvent[]): number[] => ev.filter((e) => e.kind >= 53 && e.kind <= 57 || e.kind === 30).map((e) => e.kind);

/** Steps until the next `fight` event (inclusive), so the following step is the first fight tick. */
function toFight(world: SimWorld): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < 1000; i++) {
    const ev = step(world, IDLE);
    out.push(...ev);
    if (ev.some((e) => e.kind === SimEventKind.fight)) return out;
  }
  throw new Error('no fight in 1000 ticks');
}

/** Empties team `team`'s controlled character outside any hit (the round system's own KO stop) and steps once. */
function koByHp(world: SimWorld, team: number): readonly SimEvent[] {
  const s = world.state;
  for (let id = 0; id < MAX_ENTITIES; id++) {
    const f = s.flags[id] ?? 0;
    if (s.kind[id] === EntityKind.character && s.team[id] === team && (f & (EntityFlag.benched | EntityFlag.dead)) === 0 && (f & EntityFlag.alive) !== 0) s.hp[id] = 0;
  }
  return step(world, IDLE);
}

/** Steps until `kind` is emitted (inclusive). */
function until(world: SimWorld, kind: number, max = 10_000): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < max; i++) {
    const ev = step(world, IDLE);
    out.push(...ev);
    if (ev.some((e) => e.kind === kind)) return out;
  }
  throw new Error(`no event ${String(kind)} in ${String(max)} ticks`);
}

describe('round table (FUN-DESIGN 2.10)', () => {
  it('has the design numbers', () => {
    expect([ROUND_INTRO_TICKS, KO_PHASE_TICKS, KO_SLOWMO_TICKS, ROUND_END_TICKS]).toEqual([90, 120, 60, 60]);
    expect([ROUND_TIMER_TICKS, ROUNDS_TO_WIN, KO_HIT_STOP_TICKS]).toEqual([4500, 2, 30]);
    expect(RoundPhase).toEqual({ intro: 0, fight: 1, ko: 2, roundEnd: 3, over: 4 });
    expect([SimEventKind.roundStarted, SimEventKind.fight, SimEventKind.ko, SimEventKind.timeOver, SimEventKind.roundEnded]).toEqual([53, 54, 55, 56, 57]);
  });
});

describe('intro', () => {
  it('round 1 starts on tick 0; `fight` comes 90 ticks later and nobody can act or be hit before it', () => {
    const w = duel();
    const s = w.state;
    const first = step(w, IDLE);
    expect(of(first, SimEventKind.roundStarted)).toEqual([expect.objectContaining({ round: 1, tick: 0, sourceId: 0 })]);
    expect(s.arcade[AW(ArcadeW.roundTimer)]).toBe(ROUND_TIMER_TICKS);
    // Holding right and both abilities through the intro: no move, no cast, no swap; both sides are untouchable.
    const intro = run(w, ROUND_INTRO_TICKS - 1, [Cmd.right | Cmd.primary | Cmd.secondary | Cmd.super, Cmd.left | Cmd.primary]);
    expect(intro).toEqual([]);
    expect(s.x[0]).toBe(ARCADE_P1_START_X);
    expect(s.abil[cooldownIdx(0, 0)]).toBe(0);
    expect([canAct(w, 0), isInvulnerable(s, 0), isInvulnerable(s, 1), roundPhase(s)]).toEqual([false, true, true, RoundPhase.intro]);
    const go = step(w, IDLE);
    expect(of(go, SimEventKind.fight)).toEqual([expect.objectContaining({ tick: ROUND_INTRO_TICKS })]);
    expect([inFight(s), canAct(w, 0), isInvulnerable(s, 1)]).toEqual([true, true, false]);
    expect(tickOf(w)).toBe(FIRST_FIGHT_TICK);
    step(w, [Cmd.right, 0]);
    expect(s.x[0]).toBeGreaterThan(ARCADE_P1_START_X);
  });

  it('a press in the last 8 game ticks of the intro is buffered into the first fight tick (FUN-DESIGN 2.12); an older one is not', () => {
    for (const [at, casts] of [[FIRST_FIGHT_TICK - 8, true], [FIRST_FIGHT_TICK - 9, false]] as const) {
      const w = duel();
      run(w, at);
      step(w, [Cmd.primary, 0]);
      run(w, FIRST_FIGHT_TICK - at - 1);
      expect(w.state.abil[cooldownIdx(0, 0)]).toBe(0);
      step(w, IDLE);
      expect((w.state.abil[cooldownIdx(0, 0)] ?? 0) > 0).toBe(casts);
    }
  });

  it('blocks a manual swap until the fight', () => {
    const w = duel(['sindarosa', 'lavax']);
    expect(of(run(w, ROUND_INTRO_TICKS + 1, [Cmd.swap1, 0]), SimEventKind.swapped)).toEqual([]);
    expect(of(step(w, [Cmd.swap1, 0]), SimEventKind.swapped)).toHaveLength(1);
  });
});

describe('KO', () => {
  it('a hit KO: `ko` after the death, the 30-tick KO stop, then 60 ticks of half-speed game time, then the KO phase ends 120 ticks after the stop', () => {
    const w = duel();
    const s = w.state;
    toFight(w);
    s.x[0] = 400; s.x[1] = 480; s.y[1] = s.y[0] ?? 0; s.dir[0] = 0;
    s.hp[1] = 1;
    let ev: readonly SimEvent[] = [];
    for (let i = 0; i < 60 && of(ev, SimEventKind.ko).length === 0; i++) ev = step(w, [Cmd.primary, 0]);
    const t = tickOf(w) - 1;
    const tail = ev.slice(ev.findIndex((e) => e.kind === SimEventKind.hitConfirmed)).map((e) => e.kind);
    expect(tail.filter((k) => k !== SimEventKind.meterLevel && k !== SimEventKind.damage)).toEqual([
      SimEventKind.hitConfirmed, SimEventKind.hitStop, SimEventKind.died, SimEventKind.ko,
    ]);
    // The hit path's KO stop is the one; the round adds none.
    expect(of(ev, SimEventKind.hitStop)).toEqual([expect.objectContaining({ ticks: KO_HIT_STOP_TICKS, cause: HitStopCause.ko })]);
    expect(of(ev, SimEventKind.ko)[0]).toMatchObject({ team: 1, perfect: 1 });
    expect(roundPhase(s)).toBe(RoundPhase.ko);
    const g = now(s);
    // The KO stop: 30 silent ticks, the game clock still.
    for (let i = 0; i < KO_HIT_STOP_TICKS; i++) {
      expect(isFrozen(s)).toBe(true);
      expect(step(w, IDLE)).toEqual([]);
    }
    expect(now(s)).toBe(g);
    // Slow motion: the clock runs on every second tick (the first of the window runs), 30 game ticks in 60.
    const held: boolean[] = [];
    for (let i = 0; i < KO_SLOWMO_TICKS; i++) {
      held.push(isSlowMoHold(s));
      expect(clockHeld(s)).toBe(held[i]);
      step(w, IDLE);
    }
    expect(held.slice(0, 4)).toEqual([false, true, false, true]);
    expect(now(s)).toBe(g + KO_SLOWMO_TICKS / 2);
    expect(isSlowMoHold(s)).toBe(false);
    // The rest of the KO phase runs at full speed; `roundEnded` on its last tick.
    const rest = run(w, KO_PHASE_TICKS - KO_SLOWMO_TICKS);
    expect(now(s)).toBe(g + KO_SLOWMO_TICKS / 2 + KO_PHASE_TICKS - KO_SLOWMO_TICKS);
    expect(of(rest, SimEventKind.roundEnded)).toEqual([
      expect.objectContaining({ winner: 0, won0: 1, won1: 0, tick: t + KO_HIT_STOP_TICKS + KO_PHASE_TICKS }),
    ]);
    expect(roundPhase(s)).toBe(RoundPhase.roundEnd);
  });

  it('a KO outside a hit gets the KO stop from the round; `ko.team` is the KO\'d team; damage taken means no perfect', () => {
    const w = duel();
    const s = w.state;
    toFight(w);
    s.hp[1] = (s.maxHp[1] ?? 0) - 1;
    const ev = koByHp(w, 0);
    expect(kindsOf(ev)).toEqual([SimEventKind.ko]);
    expect(of(ev, SimEventKind.hitStop)).toEqual([expect.objectContaining({ ticks: KO_HIT_STOP_TICKS, cause: HitStopCause.ko })]);
    expect(of(ev, SimEventKind.ko)[0]).toMatchObject({ team: 0, perfect: 0 });
    expect(s.arcade[AW(ArcadeW.freezeUntil)]).toBe(tickOf(w) + KO_HIT_STOP_TICKS);
    expect(of(until(w, SimEventKind.roundEnded), SimEventKind.roundEnded)[0]).toMatchObject({ winner: 1, won0: 0, won1: 1 });
  });

  it('a double KO is a draw round: both score, `ko.team` -1, no perfect', () => {
    const w = duel();
    const s = w.state;
    toFight(w);
    s.hp[0] = 0;
    const ev = koByHp(w, 1);
    expect(of(ev, SimEventKind.ko)[0]).toMatchObject({ team: -1, perfect: 0 });
    expect(of(until(w, SimEventKind.roundEnded), SimEventKind.roundEnded)[0]).toMatchObject({ winner: -1, won0: 1, won1: 1 });
    expect([roundsWon(s, 0), roundsWon(s, 1)]).toEqual([1, 1]);
  });

  it('a round ends only when the whole team is KO\'d: the partner comes in and the fight goes on', () => {
    const w = duel(['sindarosa'], ['pax', 'lavax']);
    toFight(w);
    const ev = koByHp(w, 1);
    expect(of(ev, SimEventKind.swapped)).toHaveLength(1);
    expect(kindsOf(ev)).toEqual([]);
    expect(roundPhase(w.state)).toBe(RoundPhase.fight);
    expect(kindsOf(koByHp(w, 1))).toEqual([SimEventKind.ko]);
  });

  it('nobody is hit outside the fight: a shot in flight at the KO passes through the winner', () => {
    const w = duel(['sindarosa'], ['pax']);
    const s = w.state;
    toFight(w);
    s.x[0] = 400; s.x[1] = 1000; s.y[1] = s.y[0] ?? 0; s.dir[1] = 4;
    run(w, 2, [0, Cmd.primary]); // Pax's shot flies west at Sindarosa
    s.hp[1] = 0;
    const ev = until(w, SimEventKind.roundEnded);
    expect(of(ev, SimEventKind.hitConfirmed)).toEqual([]);
    expect(s.hp[0]).toBe(s.maxHp[0]);
  });
});

describe('time over', () => {
  it('the timer counts fight game ticks (a freeze pauses it); the higher roster HP per mille wins', () => {
    const w = duel();
    const s = w.state;
    toFight(w);
    s.hp[0] = (s.maxHp[0] ?? 0) / 2;
    s.hp[1] = (s.maxHp[1] ?? 0) / 2 - 0.5;
    run(w, 100);
    expect(s.arcade[AW(ArcadeW.roundTimer)]).toBe(ROUND_TIMER_TICKS - 100);
    s.arcade[AW(ArcadeW.freezeUntil)] = tickOf(w) + 7;
    run(w, 7);
    expect(s.arcade[AW(ArcadeW.roundTimer)]).toBe(ROUND_TIMER_TICKS - 100);
    const before = run(w, ROUND_TIMER_TICKS - 101);
    expect(kindsOf(before)).toEqual([]);
    expect(teamHpPm(s, 0)).toEqual({ score: 500, full: 1000 });
    expect(teamHpPm(s, 1).score).toBeLessThan(500);
    const ev = step(w, IDLE);
    expect(kindsOf(ev)).toEqual([SimEventKind.timeOver, SimEventKind.roundEnded]);
    expect(of(ev, SimEventKind.roundEnded)[0]).toMatchObject({ winner: 0, won0: 1, won1: 0 });
    expect(tickOf(w) - 1).toBe(FIRST_FIGHT_TICK + 7 + ROUND_TIMER_TICKS - 1);
    expect([roundPhase(s), s.arcade[AW(ArcadeW.roundTimer)]]).toEqual([RoundPhase.roundEnd, 0]);
  });

  it('equal roster HP per mille is a draw round that scores for both; dead members count 0', () => {
    const w = duel(['sindarosa', 'lavax'], ['pax', 'curomo']);
    const s = w.state;
    toFight(w);
    s.y[2] = 0; // off Lavax's line, so its entrance attack (FUN-DESIGN 2.6) misses
    koByHp(w, 0); // Sindarosa down, Lavax in: team 0 is 0 + 1000
    s.hp[2] = (s.maxHp[2] ?? 0) / 2;
    s.hp[3] = (s.maxHp[3] ?? 0) / 2; // team 1 is 500 + 500
    expect([teamHpPm(s, 0), teamHpPm(s, 1)]).toEqual([{ score: 1000, full: 2000 }, { score: 1000, full: 2000 }]);
    const ev = until(w, SimEventKind.roundEnded);
    expect(of(ev, SimEventKind.timeOver)).toHaveLength(1);
    expect(of(ev, SimEventKind.roundEnded)[0]).toMatchObject({ winner: -1, won0: 1, won1: 1 });
  });
});

describe('between rounds', () => {
  it('after 60 ticks of round end the next round resets everyone to full HP and the start; meters carry over', () => {
    const w = duel(['sindarosa', 'lavax'], ['pax']);
    const s = w.state;
    toFight(w);
    // Mess everything up: positions, a swap, a live shot, cooldowns, a status, stun, a live combo, meter.
    run(w, 3, [Cmd.primary | Cmd.down, Cmd.secondary | Cmd.up]);
    step(w, [Cmd.swap1, 0]);
    s.hp[2] = (s.maxHp[2] ?? 0) / 3;
    s.speed[1] = 1;
    s.status[(0 * 8) * STATUS_STRIDE] = StatusId.tornado;
    s.status[(0 * 8) * STATUS_STRIDE + 3] = 1_000_000;
    s.arcade[METER(0)] = 1234;
    s.arcade[ARCADE_TEAM_BASE + ArcadeT.pressTick] = now(s);
    s.arcade[ARCADE_TEAM_BASE + ArcadeT.pressUsed] = 3;
    s.arcade[ARCADE_TEAM_BASE + ArcadeT.comboHits] = 2;
    s.arcade[2 * ARCADE_E + ArcadeE.stunUntil] = 1_000_000;
    s.arcade[2 * ARCADE_E + ArcadeE.comboStunTotal] = 20;
    s.hp[0] = 0; // the benched Sindarosa too: the whole team is KO'd
    koByHp(w, 0);
    const toEnd = until(w, SimEventKind.roundEnded);
    expect(of(toEnd, SimEventKind.roundEnded)[0]).toMatchObject({ winner: 1, won0: 0, won1: 1 });
    const endTick = tickOf(w) - 1;
    const ev = until(w, SimEventKind.roundStarted);
    expect(tickOf(w) - 1).toBe(endTick + ROUND_END_TICKS);
    // The live combo ends (exactly once) before the next round starts.
    expect(ev.filter((e) => e.kind === SimEventKind.comboEnded || e.kind === SimEventKind.roundStarted).map((e) => e.kind)).toEqual([
      SimEventKind.comboEnded, SimEventKind.roundStarted,
    ]);
    expect(of(ev, SimEventKind.roundStarted)[0]).toMatchObject({ round: 2 });
    expect([roundPhase(s), s.arcade[AW(ArcadeW.roundTimer)], s.arcade[METER(0)]]).toEqual([RoundPhase.intro, ROUND_TIMER_TICKS, 1234]);
    for (const id of [0, 1, 2]) {
      expect(s.hp[id]).toBe(s.maxHp[id]);
      expect(s.restCap[id]).toBe(s.maxHp[id]);
      expect(s.speed[id]).toBe(s.baseSpeed[id]);
      expect([s.x[id], s.px[id], s.y[id], s.w[id], s.h[id]]).toEqual([
        id === 2 ? ARCADE_P2_START_X : ARCADE_P1_START_X, id === 2 ? ARCADE_P2_START_X : ARCADE_P1_START_X, ARCADE_START_Y, 80, 80,
      ]);
      expect(s.dir[id]).toBe(id === 2 ? 4 : 0);
      for (let k = 0; k < 4; k++) expect([s.abil[cooldownIdx(id, k)], s.abil[countIdx(id, k)]]).toEqual([0, 0]);
    }
    // Sindarosa (roster first) is active again, Lavax benched with a fresh rest timer; the KO kept the multiplier.
    expect([s.flags[0], s.flags[1], s.flags[2]]).toEqual([EntityFlag.alive, EntityFlag.alive | EntityFlag.benched, EntityFlag.alive]);
    expect(s.expireTick[1]).toBeGreaterThan(now(s));
    expect(s.dmgMult[0]).toBeGreaterThan(0);
    expect(s.teams[TeamField.activeSlot]).toBe(0);
    expect(s.teams[TeamField.swapCooldownUntil]).toBe(0);
    expect(s.teams[TEAM_STRIDE + TeamField.activeSlot]).toBe(0);
    for (let id = 3; id < MAX_ENTITIES; id++) expect(s.flags[id]).toBe(0);
    expect(s.status.every((v) => v === 0)).toBe(true);
    expect(s.arcade.subarray(0, ARCADE_TEAM_BASE).every((v) => v === 0)).toBe(true);
    expect(s.arcade[ARCADE_TEAM_BASE + ArcadeT.comboHits]).toBe(0);
    // The input buffer forgets the old round's presses.
    expect(Array.from(s.arcade.subarray(ARCADE_TEAM_BASE + ArcadeT.pressTick, ARCADE_TEAM_BASE + ArcadeT.lastDir + 1))).toEqual([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(s.arcade[ARCADE_TEAM_BASE + ArcadeT.pressUsed]).toBe(0);
    // Round 2 plays like round 1: a full intro first.
    const intro = toFight(w);
    expect(intro.filter((e) => e.kind === SimEventKind.fight)).toEqual([expect.objectContaining({ tick: endTick + ROUND_END_TICKS + ROUND_INTRO_TICKS })]);
  });

  it('a live super ends with `superEnded` before the next round', () => {
    const w = duel();
    const s = w.state;
    toFight(w);
    s.arcade[METER(0)] = METER_BAR;
    s.y[1] = 600; // out of the band
    step(w, [Cmd.super, 0]);
    expect(s.arcade[ARCADE_TEAM_BASE + ArcadeT.superState]).not.toBe(0);
    // Time over during the super's freeze would be odd; jump the timer instead and let the round end now.
    s.arcade[AW(ArcadeW.roundTimer)] = 1;
    const ev = until(w, SimEventKind.roundStarted);
    expect(of(ev, SimEventKind.superEnded)).toHaveLength(1);
    expect(s.arcade[ARCADE_TEAM_BASE + ArcadeT.superState]).toBe(0);
  });
});

describe('best of 3', () => {
  it('`matchEnded` once a team has 2 round wins, after that round end; won0/won1 ride on it', () => {
    const w = duel();
    const s = w.state;
    const rounds: number[] = [];
    for (const loser of [1, 0, 1]) {
      toFight(w);
      koByHp(w, loser);
      const ev = until(w, SimEventKind.roundEnded);
      rounds.push(of(ev, SimEventKind.roundEnded)[0]?.['winner'] ?? -9);
      if (rounds.length < 3) expect(hasEnded(s)).toBe(false);
    }
    expect(rounds).toEqual([0, 1, 0]);
    expect(matchWinner(s)).toBeNull();
    const endTick = tickOf(w) - 1;
    const ev = until(w, SimEventKind.matchEnded);
    expect(tickOf(w) - 1).toBe(endTick + ROUND_END_TICKS);
    expect(of(ev, SimEventKind.roundStarted)).toEqual([]);
    expect(of(ev, SimEventKind.matchEnded)).toEqual([expect.objectContaining({ winner: 0, won0: 2, won1: 1, captured: 0, survivors: 1 })]);
    expect([roundPhase(s), matchWinner(s), hasEnded(s)]).toEqual([RoundPhase.over, 0, true]);
    // After the end: no more rounds or match ends, and nobody acts.
    expect(kindsOf(run(w, 300, [Cmd.right | Cmd.primary, Cmd.left]))).toEqual([]);
    expect(canAct(w, 0)).toBe(false);
  });

  it('2-0 ends after round 2; two draws are a 2-2 draw match (winner -1)', () => {
    const w = duel();
    for (let r = 0; r < 2; r++) {
      toFight(w);
      koByHp(w, 1);
    }
    expect(of(until(w, SimEventKind.matchEnded), SimEventKind.matchEnded)[0]).toMatchObject({ winner: 0, won0: 2, won1: 0 });
    const d = duel();
    for (let r = 0; r < 2; r++) {
      toFight(d);
      d.state.hp[0] = 0;
      koByHp(d, 1);
    }
    // 2-2 does not end the match: a sudden-death round (3rd) is played; a double KO there leaves the draw standing.
    toFight(d);
    expect(d.state.arcade[AW(ArcadeW.sudden)]).toBe(1);
    d.state.hp[0] = 0;
    koByHp(d, 1);
    expect(of(until(d, SimEventKind.matchEnded), SimEventKind.matchEnded)[0]).toMatchObject({ winner: -1, won0: 3, won1: 3, survivors: 0 });
    expect(roundsWon(d.state, 0)).toBe(3);
  });

  it('a draw that levels the score starts a sudden-death round (10% life, 1500-tick timer); its winner takes the match', () => {
    const w = duel();
    const s = w.state;
    toFight(w);
    koByHp(w, 1); // 1-0
    toFight(w);
    s.hp[0] = (s.maxHp[0] ?? 0) / 2;
    s.hp[1] = (s.maxHp[1] ?? 0) / 2;
    s.arcade[AW(ArcadeW.roundTimer)] = 1;
    expect(of(until(w, SimEventKind.roundEnded), SimEventKind.roundEnded)[0]).toMatchObject({ winner: -1, won0: 2, won1: 1 });
    // 2-1 after a draw: team 0 already won, no sudden death.
    expect(of(until(w, SimEventKind.matchEnded), SimEventKind.matchEnded)[0]).toMatchObject({ winner: 0, won0: 2, won1: 1 });

    const d = duel();
    const t = d.state;
    toFight(d);
    t.arcade[AW(ArcadeW.roundTimer)] = 1;
    until(d, SimEventKind.roundEnded); // draw 1-1
    toFight(d);
    t.arcade[AW(ArcadeW.roundTimer)] = 1;
    until(d, SimEventKind.roundEnded); // draw 2-2
    expect(t.arcade[AW(ArcadeW.sudden)]).toBe(0);
    const ev = until(d, SimEventKind.roundStarted);
    expect(of(ev, SimEventKind.roundStarted)[0]).toMatchObject({ round: 3 });
    expect([t.arcade[AW(ArcadeW.sudden)], t.arcade[AW(ArcadeW.roundTimer)], t.hp[0], t.hp[1]]).toEqual([
      1, SUDDEN_TIMER_TICKS, Math.floor(((t.maxHp[0] ?? 0) * SUDDEN_HP_PM) / 1000), Math.floor(((t.maxHp[1] ?? 0) * SUDDEN_HP_PM) / 1000),
    ]);
    toFight(d);
    koByHp(d, 1);
    expect(of(until(d, SimEventKind.matchEnded), SimEventKind.matchEnded)[0]).toMatchObject({ winner: 0, won0: 3, won1: 2 });
    expect(matchWinner(t)).toBe(0);
  });
});

describe('Classic is untouched', () => {
  it('no round events, no phase gate: acts on tick 0 and a wipe ends the match at once', () => {
    const w = duel(['sindarosa'], ['pax'], false);
    const s = w.state;
    expect(s.arcade.length).toBe(0);
    step(w, [Cmd.right, 0]);
    expect(s.x[0]).toBeGreaterThan(P1_START_X);
    expect([roundPhase(s), inFight(s), roundsWon(s, 0), isSlowMoHold(s)]).toEqual([RoundPhase.fight, true, 0, false]);
    const ev = koByHp(w, 1);
    expect(ev.filter((e) => e.kind >= 40)).toEqual([]);
    expect(of(ev, SimEventKind.matchEnded)).toEqual([{ winner: 0, captured: 0, survivors: 1, tick: 1, sourceId: 0, kind: 30, seq: 1 }]);
    expect(s.dmgMult[1]).toBe(0);
  });
});

describe('round determinism', () => {
  const script = (i: number): readonly [Command, Command] => [
    i % 9 === 0 ? Cmd.primary | Cmd.right : i % 4 === 0 ? Cmd.secondary : Cmd.down, i % 7 === 0 ? Cmd.primary | Cmd.left : Cmd.up,
  ];
  /** Steps the script; KOs a side every 400 ticks so the run crosses KOs, slow motion and resets. */
  const play = (w: SimWorld, from: number, to: number, hashes: number[]): void => {
    for (let i = from; i < to; i++) {
      if (i % 400 === 399 && inFight(w.state)) koByHp(w, (i / 400) & 1);
      else step(w, script(i));
      hashes.push(hash(w.state));
    }
  };

  it('replays to the same hashes across rounds, and a snapshot taken in the KO slow motion restores to the same future', () => {
    const a = duel(['fiara'], ['wispera']);
    const b = duel(['fiara'], ['wispera']);
    const ha: number[] = [];
    const hb: number[] = [];
    play(a, 0, 1600, ha);
    play(b, 0, 1600, hb);
    expect(ha).toEqual(hb);
    expect(roundsWon(a.state, 0) + roundsWon(a.state, 1)).toBeGreaterThanOrEqual(2);

    const c = duel(['fiara'], ['wispera']);
    const hc: number[] = [];
    let i = 0;
    for (; i < 1600 && !isSlowMoHold(c.state); i++) play(c, i, i + 1, hc);
    expect(i).toBeLessThan(1600);
    const buf = createSnapshotBuf(c.state);
    snapshot(c.state, buf);
    const first: number[] = [];
    play(c, i, i + 400, first);
    restore(c.state, buf);
    const again: number[] = [];
    play(c, i, i + 400, again);
    expect(again).toEqual(first);
    expect(first).toEqual(ha.slice(i, i + 400));
  });

  it('skipIntro (test support) only edits the round fields of an Arcade world', () => {
    const w = skipIntro(duel());
    expect([roundPhase(w.state), w.state.arcade[AW(ArcadeW.round)], canAct(w, 0)]).toEqual([RoundPhase.fight, 1, true]);
    expect(skipIntro(duel(['sindarosa'], ['pax'], false)).state.arcade.length).toBe(0);
  });
});
