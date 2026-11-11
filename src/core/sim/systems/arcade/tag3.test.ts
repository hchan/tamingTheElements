import { describe, expect, it } from 'vitest';
import { TAG_COOLDOWN_TICKS } from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { Cmd, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { createMatch, type MatchSetup } from '../../match';
import { EntityFlag } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { tagTargets } from '../swap';
import { skipIntro } from './round-testkit';

// 3v3 tag team (WP-arcade-3v3): Tag N brings in the N-th living bench hero in roster order, a KO brings in the first
// living one, a benched hero recovers, and a round ends only when all three heroes of a side are down.

const IDLE: readonly [Command, Command] = [0, 0];

/** Team 0: Sindarosa (0), Cyclonius (1), Curomo (2); team 1: Pax (3), Fiara (4), Rokcore (5). Fight phase, far apart. */
function trio(arcade = true): SimWorld {
  const setup: MatchSetup = {
    simVersion: 18, seed: 5, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: ['sindarosa', 'cyclonius', 'curomo'].map((c) => ({ character: characterId(c), xp: 1 })),
    p2: ['pax', 'fiara', 'rokcore'].map((c) => ({ character: characterId(c), xp: 1 })),
  };
  const w = skipIntro(createMatch(setup));
  const s = w.state;
  [s.x[0], s.y[0], s.x[3], s.y[3]] = [300, 200, 900, 500];
  return w;
}

function run(w: SimWorld, n: number, cmds: readonly [Command, Command] = IDLE): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < n; i++) out.push(...step(w, cmds));
  return out;
}

const of = (ev: readonly SimEvent[], kind: number): SimEvent[] => ev.filter((e) => e.kind === kind);
const flagged = (w: SimWorld, id: number, f: number): boolean => ((w.state.flags[id] ?? 0) & f) !== 0;
/** The non-benched hero of `team` (0: ids 0..2, 1: ids 3..5). */
const active = (w: SimWorld, team: number): number => [0, 1, 2].map((k) => team * 3 + k).find((id) => !flagged(w, id, EntityFlag.benched)) ?? -1;
/** KOs the active hero of `team` (hp to 0; the death system acts on the next step) and returns that step's events. */
const knockOut = (w: SimWorld, team: number): SimEvent[] => {
  w.state.hp[active(w, team)] = 0;
  return run(w, 1);
};

describe('Arcade 3v3 tag', () => {
  it('Tag 2 brings the third hero in; Tag 1 then brings the first living bench hero in roster order', () => {
    const w = trio();
    expect(tagTargets(w, 0, 0)).toEqual([1, 2]);
    const ev = run(w, 1, [Cmd.swap2, 0]);
    expect(of(ev, SimEventKind.tagIn)).toMatchObject([{ team: 0, from: 0, to: 2 }]);
    expect(active(w, 0)).toBe(2);
    run(w, TAG_COOLDOWN_TICKS);
    expect(of(run(w, 1, [Cmd.swap1, 0]), SimEventKind.tagIn)).toMatchObject([{ from: 2, to: 0 }]);
    run(w, TAG_COOLDOWN_TICKS);
    expect(of(run(w, 1, [Cmd.swap2, 0]), SimEventKind.tagIn)).toMatchObject([{ from: 0, to: 2 }]);
    run(w, TAG_COOLDOWN_TICKS);
    expect(of(run(w, 1, [Cmd.swap2, 0]), SimEventKind.tagIn)).toMatchObject([{ from: 2, to: 1 }]);
  });

  it('a downed bench hero is skipped: Tag 1 reaches the living one, Tag 2 does nothing (Classic keeps the roster slot)', () => {
    for (const arcade of [true, false]) {
      const w = trio(arcade);
      w.state.hp[1] = 0;
      run(w, 1); // the benched hero dies
      expect(flagged(w, 1, EntityFlag.dead)).toBe(true);
      // Arcade: Tag 2 has no target; Classic: swap1 targets the downed roster slot and does nothing.
      expect(of(run(w, 1, [arcade ? Cmd.swap2 : Cmd.swap1, 0]), SimEventKind.swapped)).toHaveLength(0);
      expect(of(run(w, 1, [arcade ? Cmd.swap1 : Cmd.swap2, 0]), SimEventKind.swapped)).toMatchObject([{ from: 0, to: 2 }]);
    }
  });

  it('both bench heroes recover red life at once', () => {
    const w = trio();
    const s = w.state;
    const max = s.maxHp[0] ?? 0;
    s.hp[0] = max / 2;
    run(w, 1, [Cmd.swap2, 0]); // 0 to the bench, 2 in
    run(w, TAG_COOLDOWN_TICKS);
    s.hp[2] = (s.maxHp[2] ?? 0) / 2;
    run(w, 1, [Cmd.swap2, 0]); // 2 to the bench, 1 in
    expect(active(w, 0)).toBe(1);
    const h0 = s.hp[0];
    const h2 = s.hp[2];
    run(w, 300);
    expect(s.hp[0]).toBeGreaterThan(h0);
    expect(s.hp[2]).toBeGreaterThan(h2);
    expect(s.hp[0]).toBeLessThanOrEqual(max);
  });

  it('KO entrances bring the second and third heroes; the round ends at the third KO; two rounds win the match', () => {
    const w = trio();
    const s = w.state;
    let ev = knockOut(w, 1);
    expect(of(ev, SimEventKind.tagIn)).toMatchObject([{ team: 1, from: 3, to: 4, entrance: 1 }]);
    ev = knockOut(w, 1);
    expect(of(ev, SimEventKind.tagIn)).toMatchObject([{ team: 1, from: 4, to: 5 }]);
    expect(of(ev, SimEventKind.ko)).toHaveLength(0);
    ev = knockOut(w, 1);
    expect(of(ev, SimEventKind.tagIn)).toHaveLength(0);
    expect(of(ev, SimEventKind.ko)).toMatchObject([{ team: 1 }]);
    const started = run(w, 400);
    expect(of(started, SimEventKind.roundEnded)).toMatchObject([{ winner: 0 }]);
    expect(of(started, SimEventKind.roundStarted)).toMatchObject([{ round: 2 }]);
    // Round 2: every hero back at full HP, the first of each roster in play, the other two on the bench.
    for (let id = 0; id < 6; id++) {
      expect(flagged(w, id, EntityFlag.dead)).toBe(false);
      expect(flagged(w, id, EntityFlag.benched)).toBe(id % 3 !== 0);
      expect(s.hp[id]).toBe(s.maxHp[id]);
    }
    run(w, 200); // past the round intro
    for (let k = 0; k < 3; k++) ev = knockOut(w, 1);
    const end = [...ev, ...run(w, 400)];
    expect(of(end, SimEventKind.matchEnded)).toMatchObject([{ winner: 0 }]);
  });
});
