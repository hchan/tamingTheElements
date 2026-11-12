import { describe, expect, it } from 'vitest';
import {
  KO_ENTRANCE_INVULN_TICKS, METER_CAST, REST_HEAL_EVERY, REST_HEAL_PM, RoundPhase, TAG_COOLDOWN_TICKS, TAG_INVULN_TICKS,
} from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now, roundPhase } from '../../clock';
import { Cmd, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, P1_START_X, START_Y, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ArcadeE, ArcadeT, EntityFlag, EntityKind, MAX_ENTITIES, TEAM_STRIDE, TeamField,
  cooldownIdx, countIdx,
} from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { SWAP_COOLDOWN_TICKS } from '../swap';
import { skipIntro } from './round-testkit';
import { isInvulnerable } from './stun';

const IDLE: readonly [Command, Command] = [0, 0];
const TAG: readonly [Command, Command] = [Cmd.swap1, 0];
const COOLDOWN = TeamField.swapCooldownUntil;
const E = (id: number, f: number): number => id * ARCADE_E + f;

/**
 * 2v2 in the fight phase: team 0 is Sindarosa (0, Fire Blast) and Cyclonius (1, Tornado; benched), team 1 Pax (2) and
 * Curomo (3; benched). Sindarosa stands at (300, 200) facing east; Pax at (`foeX`, `foeY`).
 */
function tagDuel(arcade = true, foeX = 900, foeY = 500, p1 = ['sindarosa', 'cyclonius']): SimWorld {
  const setup: MatchSetup = {
    simVersion: 18, seed: 4, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: p1.map((c) => ({ character: characterId(c), xp: 1 })),
    p2: ['pax', 'curomo'].map((c) => ({ character: characterId(c), xp: 1 })),
  };
  const w = skipIntro(createMatch(setup));
  const s = w.state;
  [s.x[0], s.y[0], s.x[2], s.y[2]] = [300, 200, foeX, foeY];
  return w;
}

function run(w: SimWorld, n: number, cmds: readonly [Command, Command] = IDLE): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...step(w, cmds));
  return out;
}

/** Steps (holding `cmds`) until an event of `kind` comes, and returns that step's events. */
function until(w: SimWorld, kind: number, cmds: readonly [Command, Command] = IDLE, max = 2000): readonly SimEvent[] {
  for (let i = 0; i < max; i++) {
    const ev = step(w, cmds);
    if (ev.some((e) => e.kind === kind)) return ev;
  }
  throw new Error(`no event ${String(kind)} in ${String(max)} ticks`);
}

const of = (ev: readonly SimEvent[], kind: number): SimEvent[] => ev.filter((e) => e.kind === kind);
const benched = (w: SimWorld, id: number): boolean => ((w.state.flags[id] ?? 0) & EntityFlag.benched) !== 0;
const owned = (w: SimWorld, owner: number, kind: number = EntityKind.projectile): number[] => {
  const s = w.state;
  const out: number[] = [];
  for (let i = 0; i < MAX_ENTITIES; i++) {
    if (((s.flags[i] ?? 0) & EntityFlag.alive) !== 0 && s.kind[i] === kind && s.owner[i] === owner) out.push(i);
  }
  return out;
};

describe('tag table (FUN-DESIGN 2.6)', () => {
  it('has the design numbers', () => {
    expect([TAG_COOLDOWN_TICKS, TAG_INVULN_TICKS, KO_ENTRANCE_INVULN_TICKS]).toEqual([150, 20, 60]);
    expect([REST_HEAL_EVERY, REST_HEAL_PM]).toEqual([10, 3]);
  });
});

describe('tag swap and entrance attack', () => {
  it("brings the partner in at the outgoing character's spot, facing and aim, with a free entrance attack", () => {
    const w = tagDuel();
    const s = w.state;
    // Auto-face (FUN-DESIGN 2.22): the foe is east-ish of the caster, so the aim is east (dir8 0, stored 1).
    const g = now(s);
    const ev = step(w, TAG);
    expect([benched(w, 0), benched(w, 1)]).toEqual([true, false]);
    expect([s.x[1], s.y[1], s.px[1], s.py[1], s.dir[1], s.arcade[E(1, ArcadeE.aim)]]).toEqual([300, 200, 300, 200, 0, 1]);
    expect(of(ev, SimEventKind.swapped)).toMatchObject([{ from: 0, to: 1, team: 0 }]);
    expect(of(ev, SimEventKind.tagIn)).toMatchObject([{ sourceId: 1, from: 0, to: 1, team: 0, entrance: 1 }]);
    expect(s.teams[COOLDOWN]).toBe(g + TAG_COOLDOWN_TICKS);
    // The entrance Tornado flies along the outgoing aim; the cast is free (no cooldown booked) but counts and pays meter.
    const [shot] = owned(w, 1);
    expect(shot === undefined ? -1 : s.dir[shot]).toBe(0);
    expect(s.abil[cooldownIdx(1, 0)]).toBe(0);
    expect(s.abil[countIdx(1, 0)]).toBe(1);
    expect(s.arcade[ARCADE_TEAM_BASE + ArcadeT.meter]).toBe(METER_CAST);
  });

  it('leaves a running primary cooldown as it was and fires anyway', () => {
    const w = tagDuel();
    const s = w.state;
    s.abil[cooldownIdx(1, 0)] = now(s) + 100;
    const ready = s.abil[cooldownIdx(1, 0)];
    expect(of(step(w, TAG), SimEventKind.tagIn)[0]?.entrance).toBe(1);
    expect(s.abil[cooldownIdx(1, 0)]).toBe(ready);
    expect(owned(w, 1)).toHaveLength(1);
  });

  it('casts a melee or self-cast primary through its own path (Curomo: Ice Shock; Pax: Adrenaline)', () => {
    const w = tagDuel(true, 900, 500, ['pax', 'curomo']);
    expect(of(step(w, TAG), SimEventKind.tagIn)[0]?.entrance).toBe(1);
    expect(owned(w, 1, EntityKind.melee)).toHaveLength(1);
    const w2 = tagDuel(true, 900, 500, ['curomo', 'pax']);
    expect(of(step(w2, TAG), SimEventKind.tagIn)[0]?.entrance).toBe(1);
    expect(w2.state.abil[cooldownIdx(1, 0)]).toBe(0);
  });

  it('reports no entrance attack when the partner cannot act (guard held)', () => {
    const w = tagDuel();
    const ev = step(w, [Cmd.swap1 | Cmd.guard, 0]);
    expect(of(ev, SimEventKind.tagIn)).toMatchObject([{ to: 1, entrance: 0 }]);
    expect(owned(w, 1)).toHaveLength(0);
  });

  it('makes the partner invulnerable for exactly TAG_INVULN_TICKS game ticks', () => {
    const w = tagDuel();
    const s = w.state;
    const g = now(s);
    step(w, TAG);
    expect(s.arcade[E(1, ArcadeE.invulnUntil)]).toBe(g + TAG_INVULN_TICKS);
    while (now(s) < g + TAG_INVULN_TICKS - 1) step(w, IDLE);
    expect(isInvulnerable(s, 1)).toBe(true);
    step(w, IDLE);
    expect(isInvulnerable(s, 1)).toBe(false);
  });

  it('allows the next tag TAG_COOLDOWN_TICKS game ticks later (Classic keeps 250 and the start spot)', () => {
    const w = tagDuel();
    const s = w.state;
    const at: number[] = [];
    for (let i = 0; i < 400 && at.length < 2; i++) {
      const g = now(s);
      if (of(step(w, TAG), SimEventKind.tagIn).length > 0) at.push(g);
    }
    expect((at[1] ?? 0) - (at[0] ?? 0)).toBe(TAG_COOLDOWN_TICKS);
    const c = tagDuel(false);
    const ev = step(c, TAG);
    expect(of(ev, SimEventKind.tagIn)).toHaveLength(0);
    expect([c.state.x[1], c.state.y[1]]).toEqual([P1_START_X, START_Y]);
    expect(c.state.teams[COOLDOWN]).toBe(SWAP_COOLDOWN_TICKS);
    expect(owned(c, 1)).toHaveLength(0);
  });

  it('needs the active character free: no tag while stunned, block-stunned, dashing or in cast recovery', () => {
    const blockers: ((w: SimWorld) => void)[] = [
      (w) => { w.state.arcade[E(0, ArcadeE.stunUntil)] = now(w.state) + 5; },
      (w) => { w.state.arcade[E(0, ArcadeE.blockUntil)] = now(w.state) + 5; },
      (w) => { w.state.arcade[E(0, ArcadeE.dashUntil)] = now(w.state) + 5; },
      (w) => { w.state.flags[0] = (w.state.flags[0] ?? 0) | EntityFlag.frozen; },
    ];
    for (const block of blockers) {
      const w = tagDuel();
      block(w);
      expect(of(step(w, TAG), SimEventKind.tagIn)).toHaveLength(0);
      expect(benched(w, 0)).toBe(false);
    }
    const free = tagDuel();
    expect(of(step(free, TAG), SimEventKind.tagIn)).toHaveLength(1);
  });

  it('releases a hit bullet on its shooter after a tag (KNOWN-BUG:bullet-count-on-active fixed in Arcade)', () => {
    const w = tagDuel(true, 700, 200);
    const s = w.state;
    step(w, [Cmd.primary, 0]); // Fire Blast toward Pax
    expect(s.abil[countIdx(0, 0)]).toBe(1);
    s.y[2] = 500; // out of the entrance Tornado's way
    step(w, TAG);
    s.y[2] = 200; // back on the blast's row
    until(w, SimEventKind.hitConfirmed);
    expect(s.abil[countIdx(0, 0)]).toBe(0);
  });
});

describe('tag combo (FUN-DESIGN 2.6)', () => {
  it('a tag while the opponent is stunned keeps the combo running: the entrance attack is hit 2', () => {
    const w = tagDuel(true, 520, 200);
    const s = w.state;
    const first = of(until(w, SimEventKind.hitConfirmed, [Cmd.primary, 0]), SimEventKind.hitConfirmed)[0];
    expect(first).toMatchObject({ attacker: 0, combo: 1 });
    expect(of(until(w, SimEventKind.tagIn, TAG), SimEventKind.tagIn)[0]?.entrance).toBe(1);
    expect(s.arcade[ARCADE_TEAM_BASE + ArcadeT.comboHits]).toBe(1);
    const ev = until(w, SimEventKind.hitConfirmed);
    expect(of(ev, SimEventKind.comboEnded)).toHaveLength(0);
    expect(of(ev, SimEventKind.hitConfirmed)[0]).toMatchObject({ attacker: 1, combo: 2 });
    expect(of(until(w, SimEventKind.comboEnded), SimEventKind.comboEnded)[0]).toMatchObject({ team: 0, hits: 2 });
  });
});

describe('KO entrance (FUN-DESIGN 2.6)', () => {
  it('brings the partner in with the entrance attack and 60 ticks of invulnerability; the round goes on', () => {
    const w = tagDuel();
    const s = w.state;
    s.x[0] = 420;
    const g = now(s);
    s.hp[0] = 0;
    const ev = step(w, IDLE);
    expect(of(ev, SimEventKind.died)).toHaveLength(1);
    expect(of(ev, SimEventKind.tagIn)).toMatchObject([{ from: 0, to: 1, team: 0, entrance: 1 }]);
    expect(s.arcade[E(1, ArcadeE.invulnUntil)]).toBe(g + KO_ENTRANCE_INVULN_TICKS);
    expect([s.x[1], s.y[1]]).toEqual([420, 200]);
    expect(of(ev, SimEventKind.ko)).toHaveLength(0);
    expect(roundPhase(s)).toBe(RoundPhase.fight);
  });

  it('ends the round only when both heroes of a side are down, and the next round resets both', () => {
    const w = tagDuel();
    const s = w.state;
    s.hp[2] = 0;
    expect(of(run(w, 1), SimEventKind.ko)).toHaveLength(0);
    expect(benched(w, 3)).toBe(false);
    s.hp[3] = 0;
    expect(of(run(w, 1), SimEventKind.ko)).toMatchObject([{ team: 1 }]);
    s.hp[0] = (s.maxHp[0] ?? 0) / 3;
    until(w, SimEventKind.roundStarted);
    for (let id = 0; id < 4; id++) {
      expect([s.hp[id], s.restCap[id], benched(w, id)]).toEqual([s.maxHp[id], s.maxHp[id], id % 2 === 1]);
    }
    expect(s.teams[COOLDOWN]).toBe(0);
    expect(s.teams[TEAM_STRIDE + COOLDOWN]).toBe(0);
  });
});

describe('benched recovery (FUN-DESIGN 2.6)', () => {
  it('heals a benched character REST_HEAL_PM of max HP every REST_HEAL_EVERY game ticks, up to its red life', () => {
    const w = tagDuel();
    const s = w.state;
    const max = s.maxHp[0] ?? 0;
    s.hp[0] = max / 2;
    step(w, TAG);
    expect(s.restCap[0]).toBe(max * 0.75);
    const g = now(s) - 1;
    const tick = (REST_HEAL_PM * max) / 1000;
    while (now(s) < g + REST_HEAL_EVERY) step(w, IDLE);
    expect(s.hp[0]).toBe(max / 2);
    step(w, IDLE);
    expect(s.hp[0]).toBe(max / 2 + tick);
    while (s.expireTick[0] !== 0 && now(s) < g + 1000) step(w, IDLE);
    expect(s.hp[0]).toBe(max * 0.75);
    // The heal that would pass the cap clamps to it and stops the timer (Classic semantics, Arcade rate).
    expect(now(s) - g).toBeLessThanOrEqual(REST_HEAL_EVERY * (Math.ceil((max * 0.25) / tick) + 1) + 1);
  });

  it('never heals a character in play, the enemy included (KNOWN-BUG:rest-heal-enemy-in-play fixed in Arcade)', () => {
    for (const arcade of [true, false]) {
      const w = tagDuel(arcade);
      const s = w.state;
      const half = (s.maxHp[2] ?? 0) / 2;
      s.hp[2] = half;
      s.expireTick[2] = now(s) + 1;
      run(w, 60);
      expect(s.hp[2] === half).toBe(arcade);
    }
  });
});

describe('tag determinism', () => {
  it('a snapshot taken before a tag restores to the same hashes', () => {
    const w = tagDuel(true, 520, 200);
    run(w, 3, [Cmd.primary, 0]);
    const buf = createSnapshotBuf(w.state);
    snapshot(w.state, buf);
    const script = (): number[] => {
      const out: number[] = [];
      for (let i = 0; i < 200; i++) {
        step(w, i % 37 === 5 ? TAG : [i % 11 === 0 ? Cmd.primary : 0, 0]);
        out.push(hash(w.state));
      }
      return out;
    };
    const a = script();
    restore(w.state, buf);
    expect(script()).toEqual(a);
  });

  it('team blocks stay per team: the cooldown lands on the tagging team only', () => {
    const w = tagDuel();
    step(w, [0, Cmd.swap1]);
    expect(w.state.teams[COOLDOWN]).toBe(0);
    expect(w.state.teams[TEAM_STRIDE + COOLDOWN]).toBeGreaterThan(0);
    expect(w.state.arcade[ARCADE_TEAM_BASE + ARCADE_T + ArcadeT.meter]).toBe(METER_CAST);
  });
});
