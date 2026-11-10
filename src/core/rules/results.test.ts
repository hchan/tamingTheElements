import { describe, expect, it } from 'vitest';
import { characterId } from '../data/ids';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { seedSfc32 } from '../rng/seed';
import { createMatch } from '../sim/match';
import type { MatchSetup } from '../sim/match';
import { step } from '../sim/step';
import { EntityFlag } from '../sim/state';
import { EventSink, SimEventKind } from '../sim/events';
import { capturedRosterIndices, endSystem } from '../sim/systems/end';
import { applyMatchResult } from './results';
import type { MatchOutcome, ResultSave } from './results';

const clock = { now: () => 777 };
const entry = (id: string, experience: number, characterName: string) => ({
  id,
  experience,
  characterName,
  createdTime: 1,
  lastModifiedTime: 1,
});
const save: ResultSave = {
  chapter: 2,
  garrison: [entry('a', 4, 'Pax'), entry('b', 9, 'Echo')],
};
const setup = (foe = 'lavax', chapter: 1 | 2 = 2): MatchSetup => ({
  simVersion: 1,
  seed: 1,
  flags: DEFAULT_SIM_FLAGS,
  chapter,
  difficulty: 1,
  p1: [
    { character: characterId('pax'), xp: 4 },
    { character: characterId('echo'), xp: 9 },
  ],
  p2: [
    { character: characterId(foe), xp: 3 },
    { character: characterId('pax'), xp: 6 },
  ],
});
const win: MatchOutcome = { winner: 0, practice: false, activeIndex: 1, capturedIndices: [] };
const meta = () => seedSfc32(5, 'meta');

describe('applyMatchResult', () => {
  it('gives XP only to the active hero and reports the level-up', () => {
    const r = applyMatchResult(save, setup(), win, meta(), clock);
    const gained = r.report.xp?.gained ?? 0;
    expect(gained).toBeGreaterThanOrEqual(2);
    expect(gained).toBeLessThanOrEqual(3);
    expect(r.save.garrison[0]).toEqual(save.garrison[0]);
    expect(r.save.garrison[1]?.experience).toBe(9 + gained);
    expect(r.save.garrison[1]?.lastModifiedTime).toBe(777);
    expect(r.report.xp).toMatchObject({ before: 9, after: 9 + gained, levelBefore: 6 });
    expect(r.report.victory).toBe(true);
  });

  it('flags a level-up when XP crosses a threshold', () => {
    const s: ResultSave = { chapter: 1, garrison: [entry('a', 4, 'Pax')] };
    const r = applyMatchResult(s, setup('lavax', 1), { ...win, activeIndex: 0 }, meta(), clock);
    expect(r.report.xp).toMatchObject({ gained: 1, before: 4, after: 5, levelBefore: 4, levelAfter: 5, leveledUp: true });
  });

  it('caps XP at the chapter maximum like addXP', () => {
    const s: ResultSave = { chapter: 1, garrison: [entry('a', 5, 'Pax')] };
    const r = applyMatchResult(s, setup('lavax', 1), { ...win, activeIndex: 0 }, meta(), clock);
    expect(r.report.xp).toMatchObject({ gained: 0, after: 5, leveledUp: false });
  });

  it('gives no XP in practice but still adds captured opponents', () => {
    const r = applyMatchResult(save, setup(), { ...win, practice: true, capturedIndices: [0] }, meta(), clock);
    expect(r.report.xp).toBeNull();
    expect(r.save.garrison[1]?.experience).toBe(9);
    expect(r.save.garrison).toHaveLength(3);
  });

  it('adds captured opponents at their match xp', () => {
    const r = applyMatchResult(save, setup(), { ...win, capturedIndices: [0, 1] }, meta(), clock);
    expect(r.save.garrison.slice(2).map((g) => [g.characterName, g.experience])).toEqual([
      ['Lavax', 3],
      ['Pax', 6],
    ]);
    expect(new Set(r.save.garrison.map((g) => g.id)).size).toBe(4);
    expect(r.report.captured).toEqual([
      { characterName: 'Lavax', experience: 3 },
      { characterName: 'Pax', experience: 6 },
    ]);
  });

  it('changes nothing on defeat or a draw', () => {
    for (const winner of [1, -1]) {
      const r = applyMatchResult(save, setup(), { ...win, winner, capturedIndices: [0] }, meta(), clock);
      expect(r.save).toBe(save);
      expect(r.report).toMatchObject({ victory: false, xp: null, captured: [], gameCompleted: false });
    }
  });

  it('completes the game when the last boss is beaten, even in practice', () => {
    const boss = setup('eternal-void');
    const r = applyMatchResult(save, boss, win, meta(), clock);
    expect(r.save.completeTime).toBe(777);
    expect(r.report.gameCompleted).toBe(true);
    const p = applyMatchResult(save, boss, { ...win, practice: true }, meta(), clock);
    expect(p.save.completeTime).toBe(777);
    expect(p.report.xp).toBeNull();
    expect(applyMatchResult(save, setup(), win, meta(), clock).save.completeTime).toBeUndefined();
  });

  it('does not mutate its input and is deterministic', () => {
    const frozen = JSON.stringify(save);
    const a = applyMatchResult(save, setup(), { ...win, capturedIndices: [0] }, meta(), clock);
    const b = applyMatchResult(save, setup(), { ...win, capturedIndices: [0] }, meta(), clock);
    expect(JSON.stringify(save)).toBe(frozen);
    expect(a).toEqual(b);
  });
});

describe('endSystem', () => {
  const kill = (w: ReturnType<typeof createMatch>, id: number, bits: number) => {
    w.state.flags[id] = (w.state.flags[id] ?? 0) | bits;
  };
  const ended = (events: readonly { kind: number }[]) => events.filter((e) => e.kind === SimEventKind.matchEnded);

  it('continues while both teams have a member in play, benched included', () => {
    const w = createMatch(setup());
    kill(w, 0, EntityFlag.dead);
    expect(ended(step(w, [0, 0]))).toHaveLength(0);
  });

  it('declares victory once, with captured count and survivors', () => {
    const w = createMatch(setup());
    kill(w, 2, EntityFlag.captured | EntityFlag.dead); // a Capture hit kills in the same tick
    kill(w, 3, EntityFlag.dead);
    const ev = ended(step(w, [0, 0]));
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ winner: 0, captured: 1, survivors: 2 });
    expect(ended(step(w, [0, 0]))).toHaveLength(0);
    expect(capturedRosterIndices(w.state, 1)).toEqual([0]);
  });

  it('declares defeat and a draw', () => {
    const lose = createMatch(setup());
    kill(lose, 0, EntityFlag.dead);
    kill(lose, 1, EntityFlag.dead);
    expect(ended(step(lose, [0, 0]))[0]).toMatchObject({ winner: 1, captured: 0, survivors: 2 });
    const draw = createMatch(setup());
    for (let i = 0; i < 4; i++) kill(draw, i, EntityFlag.dead);
    const sink = new EventSink(0);
    endSystem(draw, [0, 0], sink);
    expect(sink.events[0]).toMatchObject({ winner: -1, survivors: 0 });
  });
});
