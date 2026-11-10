import { describe, expect, it } from 'vitest';
import { characterId } from '../data/ids';
import { DEFAULT_SIM_FLAGS, assertNoTesterFlags, decodeFlags, encodeFlags, hasTesterFlags } from '../flags';
import { Cmd, NO_COMMAND } from '../sim/commands';
import { SimEventKind } from '../sim/events';
import { createMatch, type MatchSetup } from '../sim/match';
import { hash } from '../sim/hash';
import { EntityFlag, TEAM_STRIDE, TeamField } from '../sim/state';
import { step } from '../sim/step';
import { SWAP_COOLDOWN_TICKS } from '../sim/systems/swap';
import { REST_HEAL_INTERVAL } from '../sim/systems/rest';
import { newEmptyState } from '../save/v1';
import { levelFromXp } from '../rules/progression';
import { objectivesMet } from '../rules/objectives';
import { applyArenaCheat, applyTickCheats, benchRows } from './cheats';
import { addEveryRace, advanceChapterCheat, levelHero, xpForLevel } from './save-edits';
import { headerFromSetup, isCheatHeader } from '../replay/format';
import { ReplayRecorder } from '../replay/recorder';
import { playReplay } from '../replay/player';
import { validateReplay } from '../replay/validate';

const pax = { character: characterId('pax'), xp: 1 };
const lavax = { character: characterId('lavax'), xp: 1 };
const setup = (flags = DEFAULT_SIM_FLAGS, chapter: 1 | 2 = 1): MatchSetup => ({
  simVersion: 1,
  seed: 7,
  flags,
  chapter,
  difficulty: 1,
  p1: [pax, lavax, pax],
  p2: [pax, pax],
});
const at = (a: Float64Array, i: number): number => a.at(i) ?? 0;
const idle = [NO_COMMAND, NO_COMMAND] as const;

describe('testerCapture sim flag', () => {
  it('is off by default and encodes after the existing flags (their bits do not move)', () => {
    expect(hasTesterFlags(DEFAULT_SIM_FLAGS)).toBe(false);
    const on = { ...DEFAULT_SIM_FLAGS, testerCapture: true };
    expect(encodeFlags(on)).toBe('testerCapture');
    expect(decodeFlags('testerCapture')).toEqual(on);
    expect(() => {
      assertNoTesterFlags(on);
    }).toThrow(/tester-mode/);
    expect(() => {
      assertNoTesterFlags(DEFAULT_SIM_FLAGS);
    }).not.toThrow();
  });

  it('leaves the Classic hash untouched and grants Capture in chapter 1 only when on', () => {
    expect(hash(createMatch(setup()).state)).toBe(hash(createMatch(setup(DEFAULT_SIM_FLAGS)).state));
    const w = createMatch(setup({ ...DEFAULT_SIM_FLAGS, testerCapture: true }));
    const classic = createMatch(setup());
    expect(hash(w.state)).not.toBe(hash(classic.state));
  });
});

describe('arena cheats', () => {
  it('myHp25 and enemyHp25 set the active character to exactly the capture line', () => {
    const w = createMatch(setup());
    applyArenaCheat(w, 'enemyHp25');
    applyArenaCheat(w, 'myHp25');
    const s = w.state;
    expect(s.hp[3]).toBe((s.maxHp[3] ?? 0) * 0.25);
    expect(s.hp[0]).toBe((s.maxHp[0] ?? 0) * 0.25);
    expect(s.hp[4]).toBe(s.maxHp[4]);
  });

  it('win ends the match for the player; captureWin flags every enemy captured', () => {
    const w = createMatch(setup());
    applyArenaCheat(w, 'win');
    const ev = step(w, idle).filter((e) => e.kind === SimEventKind.matchEnded);
    expect(ev[0]?.['winner']).toBe(0);
    const c = createMatch(setup());
    applyArenaCheat(c, 'captureWin');
    const end = step(c, idle).find((e) => e.kind === SimEventKind.matchEnded);
    expect(end?.['winner']).toBe(0);
    expect(end?.['captured']).toBe(2);
  });

  it('freezeEnemy freezes every living enemy and nobody else', () => {
    const w = createMatch(setup());
    applyArenaCheat(w, 'freezeEnemy');
    const f = (i: number): boolean => ((w.state.flags[i] ?? 0) & EntityFlag.frozen) !== 0;
    expect([f(0), f(3), f(4)]).toEqual([false, true, true]);
  });
});

describe('tick cheats', () => {
  it('god mode keeps the player team full while an enemy-side hit would otherwise land', () => {
    const w = createMatch(setup());
    w.state.hp[0] = 5;
    applyTickCheats(w, { godMode: true, instantSwap: false });
    expect(w.state.hp[0]).toBe(w.state.maxHp[0]);
  });

  it('instant swap removes the swap cooldown the normal rules book', () => {
    const w = createMatch(setup());
    step(w, [Cmd.swap1, 0]);
    expect(w.state.teams[TeamField.swapCooldownUntil]).toBe(SWAP_COOLDOWN_TICKS);
    const blocked = createMatch(setup());
    step(blocked, [Cmd.swap1, 0]);
    step(blocked, [Cmd.swap1, 0]);
    expect(blocked.state.teams[TeamField.activeSlot]).toBe(1);
    const fast = createMatch(setup());
    for (let i = 0; i < 2; i++) {
      applyTickCheats(fast, { godMode: false, instantSwap: true });
      step(fast, [Cmd.swap1, 0]);
    }
    expect(fast.state.teams[TeamField.activeSlot]).toBe(0);
  });

  it('leaves the enemy swap cooldown alone', () => {
    const w = createMatch(setup());
    w.state.teams[TEAM_STRIDE + TeamField.swapCooldownUntil] = 99;
    applyTickCheats(w, { godMode: true, instantSwap: true });
    expect(w.state.teams[TEAM_STRIDE + TeamField.swapCooldownUntil]).toBe(99);
  });
});

describe('bench rows and rest-heal', () => {
  it('lists the roster with the active hero marked and shows benched hp rising up to the rest cap', () => {
    const w = createMatch(setup());
    const s = w.state;
    s.hp[1] = at(s.maxHp, 1) * 0.1;
    s.restCap[1] = at(s.maxHp, 1) * 0.5;
    const before = benchRows(w, 0);
    expect(before.map((r) => [r.name, r.active])).toEqual([['Pax', true], ['Lavax', false], ['Pax', false]]);
    let last = at(s.hp, 1);
    for (let i = 0; i < REST_HEAL_INTERVAL * 120; i++) {
      step(w, idle);
      const now = at(s.hp, 1);
      expect(now).toBeGreaterThanOrEqual(last);
      last = now;
    }
    expect(last).toBe(s.restCap[1]);
    expect(benchRows(w, 0)[1]?.hp).toBe(last);
  });
});

describe('save edits', () => {
  it('xpForLevel inverts levelFromXp', () => {
    for (let l = 0; l <= 20; l++) expect(levelFromXp(xpForLevel(l))).toBe(l);
  });

  it('levels a hero by 1 or to a level, and meets the chapter-1 objective at level 5', () => {
    const save = { ...newEmptyState(), chapter: 1, garrison: [{ id: 'a', experience: 1, characterName: 'Pax' }] };
    expect(levelFromXp(levelHero(save, 0, { by: 1 }).garrison[0]?.experience ?? 0)).toBe(2);
    expect(objectivesMet(levelHero(save, 0, { to: 5 }))).toBe(true);
    expect(levelFromXp(levelHero(save, 0, { to: 15 }).garrison[0]?.experience ?? 0)).toBe(15);
    expect(levelHero(save, 4, { by: 1 })).toBe(save);
    expect(save.garrison[0]?.experience).toBe(1);
  });

  it('advances the chapter with a cap and adds every missing race once, never the boss', () => {
    const save = { ...newEmptyState(), chapter: 4, garrison: [{ id: 'a', experience: 1, characterName: 'Pax' }] };
    expect(advanceChapterCheat(save).chapter).toBe(5);
    expect(advanceChapterCheat(advanceChapterCheat(save)).chapter).toBe(5);
    expect(advanceChapterCheat({ ...save, chapter: 0 }).chapter).toBe(1);
    let n = 0;
    const ids = { next: () => `id-${String(n++)}` };
    const all = addEveryRace(save, 5, ids);
    const names = all.garrison.map((g) => g.characterName);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('Fiara');
    expect(names).not.toContain('Eternal Void');
    expect(addEveryRace(all, 6, ids).garrison.length).toBe(all.garrison.length);
  });
});

describe('cheat replays are refused', () => {
  const record = (cheats: boolean, flags = DEFAULT_SIM_FLAGS): ReturnType<ReplayRecorder['finish']> => {
    const su = setup(flags);
    const w = createMatch(su);
    const rec = new ReplayRecorder(su);
    for (let i = 0; i < 60; i++) {
      rec.record(w, idle);
      step(w, idle);
    }
    return rec.finish(w, cheats);
  };

  it('a normal replay has no cheats field and still verifies', () => {
    const r = record(false);
    expect('cheats' in r.header).toBe(false);
    expect(playReplay(r).ok).toBe(true);
    expect(validateReplay(JSON.parse(JSON.stringify(r)) as unknown).ok).toBe(true);
  });

  it('flags the header, and playReplay and validateReplay refuse it', () => {
    const r = record(true);
    expect(r.header.cheats).toBe(true);
    expect(isCheatHeader(r.header)).toBe(true);
    expect(() => playReplay(r)).toThrow(/tester mode/);
    const v = validateReplay(JSON.parse(JSON.stringify(r)) as unknown);
    expect(v.ok).toBe(false);
  });

  it('refuses a replay whose flags carry the tester flag even without the header field', () => {
    const r = record(false, { ...DEFAULT_SIM_FLAGS, testerCapture: true });
    expect(isCheatHeader(r.header)).toBe(true);
    expect(() => playReplay(r)).toThrow(/tester mode/);
    expect(headerFromSetup(setup(), 1).cheats).toBeUndefined();
  });
});
