import { describe, expect, it } from 'vitest';
import { characterId } from '../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { EventSink, SimEventKind, type SimEvent } from '../events';
import { createMatch, type MatchSetup } from '../match';
import { EntityFlag, EntityKind, MAX_ENTITIES } from '../state';
import type { SimWorld } from '../world';
import { endSystem, hasEnded, matchWinner, survivorsOf } from './end';

const setup: MatchSetup = {
  simVersion: 1,
  seed: 1,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('pax'), xp: 1 }, { character: characterId('echo'), xp: 1 }],
  p2: [{ character: characterId('lavax'), xp: 1 }, { character: characterId('pax'), xp: 1 }],
};

/** Entity ids of a team's characters, ascending. */
function members(world: SimWorld, team: number): number[] {
  const s = world.state;
  const out: number[] = [];
  for (let id = 0; id < MAX_ENTITIES; id++) {
    if (s.kind[id] === EntityKind.character && s.team[id] === team && ((s.flags[id] ?? 0) & EntityFlag.alive) !== 0) out.push(id);
  }
  return out;
}

const kill = (world: SimWorld, id: number): void => {
  world.state.flags[id] = (world.state.flags[id] ?? 0) | EntityFlag.dead;
};

function run(world: SimWorld): SimEvent[] {
  const sink = new EventSink(0);
  endSystem(world, [0, 0], sink);
  return [...sink.events].filter((e) => e.kind === SimEventKind.matchEnded);
}

describe('Classic match end', () => {
  it('a fresh match has both teams in play and no winner', () => {
    const w = createMatch(setup);
    expect(members(w, 0).length).toBe(2);
    expect(survivorsOf(w.state, 0)).toBe(2);
    expect(survivorsOf(w.state, 1)).toBe(2);
    expect(matchWinner(w.state)).toBeNull();
    expect(run(w)).toEqual([]);
    expect(hasEnded(w.state)).toBe(false);
  });

  it('a benched survivor keeps the team alive: only losing every member ends the match', () => {
    const w = createMatch(setup);
    const [first] = members(w, 1);
    kill(w, first as number);
    expect(survivorsOf(w.state, 1)).toBe(1);
    expect(matchWinner(w.state)).toBeNull();
    expect(run(w)).toEqual([]);
  });

  it('the surviving team wins, MatchEnded carries its survivor count, and it is emitted exactly once', () => {
    const w = createMatch(setup);
    for (const id of members(w, 1)) kill(w, id);
    kill(w, members(w, 0)[0] as number);
    expect(matchWinner(w.state)).toBe(0);
    const first = run(w);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ winner: 0, survivors: 1, captured: 0 });
    expect(hasEnded(w.state)).toBe(true);
    expect(run(w)).toEqual([]);
  });

  it('both teams wiped in the same tick is a draw (-1) with no survivors', () => {
    const w = createMatch(setup);
    for (const id of [...members(w, 0), ...members(w, 1)]) kill(w, id);
    expect(matchWinner(w.state)).toBe(-1);
    expect(run(w)[0]).toMatchObject({ winner: -1, survivors: 0, captured: 0 });
  });

  it('team 1 winning reports no captures even when team 0 is wiped', () => {
    const w = createMatch(setup);
    for (const id of members(w, 0)) kill(w, id);
    expect(matchWinner(w.state)).toBe(1);
    expect(run(w)[0]).toMatchObject({ winner: 1, captured: 0, survivors: 2 });
  });
});
