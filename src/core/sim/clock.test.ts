import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CHARACTERS } from '../data/characters';
import { characterId } from '../data/ids';
import { DEFAULT_SIM_FLAGS, flagBit } from '../flags';
import { recordBotMatch } from '../replay/record-bots';
import { playReplay } from '../replay/player';
import { validateReplay } from '../replay/validate';
import { allocEntity, freeEntity } from './alloc';
import { advanceGameClock, isArcade, isFrozen, now } from './clock';
import { Cmd, inputMaskFor } from './commands';
import { hash } from './hash';
import { createMatch, type MatchSetup } from './match';
import { createSnapshotBuf, restore, snapshot, SnapshotRing } from './snapshot';
import {
  ARCADE_E, ARCADE_LENGTH, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_W, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW,
  EntityKind, MAX_ENTITIES, TEAM_COUNT, TEAM_COOLDOWNS, World, stateArrays, type SimState,
} from './state';
import type { SimEvent } from './events';
import { step } from './step';

const CLASSIC: MatchSetup = {
  simVersion: 3, seed: 0xa1c, flags: DEFAULT_SIM_FLAGS, chapter: 2, difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }, { character: characterId('curomo'), xp: 5 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};
const ARCADE: MatchSetup = { ...CLASSIC, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true } };
const GAME_TICK = ARCADE_WORLD_BASE + ArcadeW.gameTick;
const FREEZE_UNTIL = ARCADE_WORLD_BASE + ArcadeW.freezeUntil;

describe('arcade state block', () => {
  it('is empty in Classic and ARCADE_LENGTH ints in Arcade', () => {
    expect(createMatch(CLASSIC).state.arcade.length).toBe(0);
    expect(createMatch(ARCADE).state.arcade.length).toBe(ARCADE_LENGTH);
    expect(ARCADE_LENGTH).toBe(12 * MAX_ENTITIES + 16 * TEAM_COUNT + 8);
  });

  it('has distinct field offsets that fit their strides (FUN-DESIGN 2.1 layout)', () => {
    const check = (fields: Record<string, number>, stride: number, extra = 0): void => {
      const offs = Object.values(fields);
      expect(new Set(offs).size).toBe(offs.length);
      expect(Math.max(...offs) + 1 + extra).toBeLessThanOrEqual(stride);
    };
    check(ArcadeE, ARCADE_E);
    check(ArcadeT, ARCADE_T);
    expect(ArcadeT.lastDirPress - ArcadeT.pressTick).toBe(5);
    check(ArcadeW, ARCADE_W);
    expect(ARCADE_TEAM_BASE).toBe(ARCADE_E * MAX_ENTITIES);
    expect(ARCADE_WORLD_BASE).toBe(ARCADE_TEAM_BASE + ARCADE_T * TEAM_COUNT);
  });

  it('is cleared with the entity slot so stale Arcade data never reaches the hash', () => {
    const s = createMatch(ARCADE).state;
    const id = allocEntity(s);
    s.arcade.fill(7, id * ARCADE_E, (id + 1) * ARCADE_E);
    freeEntity(s, id);
    expect(s.arcade.subarray(id * ARCADE_E, (id + 1) * ARCADE_E).every((v) => v === 0)).toBe(true);
  });
});

describe('game clock', () => {
  it('is W.tick in Classic and never freezes', () => {
    const w = createMatch(CLASSIC);
    expect(isArcade(w.state)).toBe(false);
    for (let t = 0; t < 30; t++) {
      expect(now(w.state)).toBe(w.state.world[World.tick]);
      expect(isFrozen(w.state)).toBe(false);
      step(w, [Cmd.right | Cmd.primary, Cmd.left]);
    }
    advanceGameClock(w.state);
    expect(w.state.arcade.length).toBe(0);
  });

  it('is gameTick in Arcade and keeps pace with W.tick while nothing freezes', () => {
    const w = createMatch(ARCADE);
    expect(isArcade(w.state)).toBe(true);
    w.state.arcade[GAME_TICK] = 1000;
    expect(now(w.state)).toBe(1000);
    w.state.arcade[GAME_TICK] = 0;
    for (let t = 0; t < 30; t++) step(w, [Cmd.right, 0]);
    expect(now(w.state)).toBe(30);
    expect(w.state.world[World.tick]).toBe(30);
  });

  it('freeze gate: only W.tick advances; no other state changes and cooldowns resume in game time', () => {
    const w = createMatch(ARCADE);
    const s = w.state;
    step(w, [Cmd.primary, 0]);
    const ready = s.teams[TEAM_COOLDOWNS] ?? 0;
    expect(ready).toBeGreaterThan(1);
    s.arcade[FREEZE_UNTIL] = (s.world[World.tick] ?? 0) + 5;
    const before = stateArrays(s).map((a) => Array.from(a));
    for (let t = 0; t < 5; t++) {
      expect(isFrozen(s)).toBe(true);
      expect(step(w, [Cmd.right | Cmd.primary, Cmd.left | Cmd.primary])).toEqual([]);
    }
    const tickArray = stateArrays(s).indexOf(s.world);
    stateArrays(s).forEach((a, k) => {
      const want = before[k] as number[];
      if (k === tickArray) want[World.tick] = 6;
      expect(Array.from(a)).toEqual(want);
    });
    expect(now(s)).toBe(1);
    expect(isFrozen(s)).toBe(false);
    // Fire Blast is ready again at game time `ready`, which is now W.tick ready + 5: pressing earlier does nothing.
    while ((s.world[World.tick] ?? 0) < ready + 5) step(w, [Cmd.primary, 0]);
    expect(s.teams[TEAM_COOLDOWNS]).toBe(ready);
    expect(now(s)).toBe(ready);
    step(w, [Cmd.primary, 0]);
    expect(now(s)).toBe(ready + 1);
    expect(s.teams[TEAM_COOLDOWNS]).toBeGreaterThan(ready);
  });

  it('the Arcade block exists exactly when the flag is on', () => {
    for (const rulesetArcade of [false, true]) {
      for (const elementalAdvantage of [false, true]) {
        const s = createMatch({ ...CLASSIC, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade, elementalAdvantage } }).state;
        expect(isArcade(s)).toBe(rulesetArcade);
        expect(s.arcade.length).toBe(rulesetArcade ? ARCADE_LENGTH : 0);
      }
    }
  });
});

/**
 * Classic and Arcade side by side. No Arcade rule exists yet, so an Arcade match is Classic shifted in W.tick by the
 * freezes it took: with a freeze of `n` ticks at tick `at`, Arcade after `t + n` steps equals Classic after `t` steps
 * in every entity, team, status and rng value, and emits the same events (ids aside). That proves every timer read
 * goes through the game clock `now(s)`; with `n = 0` it proves Arcade adds nothing but its own block.
 */
describe('an Arcade match with no Arcade rules is Classic shifted by its freezes', () => {
  type Inputs = readonly (readonly [number, number])[];
  /** Events without their W.tick (the shifted part of the id). */
  const strip = (evs: readonly SimEvent[]): unknown[] => evs.map((e) => ({ ...e, tick: 0 }));
  /** `prep` edits both tick-0 worlds the same way (hurt everyone, place the fighters). */
  const runBoth = (setup: MatchSetup, inputs: Inputs, at: number, n: number, prep?: (s: SimState) => void): void => {
    const c = createMatch(setup);
    const a = createMatch({ ...setup, flags: { ...setup.flags, rulesetArcade: true } });
    prep?.(c.state);
    prep?.(a.state);
    const ca = stateArrays(c.state);
    const aa = stateArrays(a.state);
    inputs.forEach(([p, q], t) => {
      if (t === at && n > 0) {
        a.state.arcade[FREEZE_UNTIL] = (a.state.world[World.tick] ?? 0) + n;
        for (let k = 0; k < n; k++) expect(step(a, [p, q])).toEqual([]);
      }
      expect(strip(step(a, [p, q]))).toEqual(strip(step(c, [p, q])));
      // stateArrays ends with world, rng, arcade: every entity, team, status and rng array must match exactly.
      for (let k = 0; k < ca.length - 2; k++) if (k !== ca.length - 3) expect(aa[k]).toEqual(ca[k]);
      const shift = t >= at ? n : 0;
      expect(Array.from(a.state.world)).toEqual(
        Array.from(c.state.world, (v, i) =>
          i === World.flags ? v | flagBit('rulesetArcade') : i === World.tick ? v + shift : v,
        ),
      );
      expect(now(a.state)).toBe(now(c.state));
    });
  };

  it('property: random setups, all 16 command bits, one freeze anywhere', () => {
    const cmd = fc.integer({ min: 0, max: 0xffff });
    const race = fc.constantFrom(...CHARACTERS.map((c) => c.id));
    /** Held-key runs, like a player, so buffs, freezes and swaps play out over several hundred ticks. */
    const sticky = fc
      .array(fc.tuple(fc.integer({ min: 1, max: 60 }), cmd, cmd), { minLength: 1, maxLength: 20 })
      .map((runs) => runs.flatMap(([k, p, q]) => Array.from({ length: k }, (): [number, number] => [p, q])));
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xffffffff }),
        fc.constantFrom(1, 2, 3, 4, 5),
        race,
        race,
        sticky,
        fc.nat(200),
        fc.constantFrom(0, 1, 7, 40, 150),
        fc.constantFrom(1000, 600, 240),
        (seed, chapter, mine, rival, inputs, at, n, hpPm) => {
          const p1 = [{ character: mine, xp: 40 }, { character: rival, xp: 0 }];
          const p2 = [{ character: rival, xp: 40 }, { character: mine, xp: 0 }];
          // Start hurt so rest healing and Capture (at most 25% HP) get exercised too.
          const hurt = (s: SimState): void => {
            for (let id = 0; id < MAX_ENTITIES; id++) {
              if (s.kind[id] === EntityKind.character) s.hp[id] = ((s.maxHp[id] ?? 0) * hpPm) / 1000;
            }
          };
          runBoth({ ...CLASSIC, seed, chapter, p1, p2 }, inputs, at, n, hurt);
        },
      ),
      { numRuns: 40, seed: 0xa4c },
    );
  });

  it('Hurricane hit intervals (hitMask) run on the game clock across a freeze', () => {
    const duel = { ...CLASSIC, p1: [{ character: characterId('echo'), xp: 1 }], p2: [{ character: characterId('pax'), xp: 1 }] };
    const adjacent = (s: SimState): void => {
      s.x[0] = 500; s.y[0] = 300; s.x[1] = 580; s.y[1] = 300; s.dir[0] = 0;
    };
    const hold = Array.from({ length: 120 }, (): [number, number] => [Cmd.secondary, 0]);
    for (const at of [3, 5, 9]) runBoth(duel, hold, at, 7, adjacent);
  });
});

describe('Arcade snapshot and replay', () => {
  it('snapshot round trip with the flag on re-simulates to the same hash', () => {
    const w = createMatch(ARCADE);
    const ring = new SnapshotRing(w.state, 4);
    const cmds = (t: number): [number, number] => [(t * 7) & 0x3fff, (t * 13) & 0x3fff];
    for (let t = 0; t < 120; t++) step(w, cmds(t));
    w.state.arcade[FREEZE_UNTIL] = 125;
    ring.push(w.state, 120);
    for (let t = 120; t < 300; t++) step(w, cmds(t));
    const final = hash(w.state);
    expect(ring.restoreTick(w.state, 120)).toBe(true);
    expect(w.state.arcade[FREEZE_UNTIL]).toBe(125);
    for (let t = 120; t < 300; t++) step(w, cmds(t));
    expect(hash(w.state)).toBe(final);
  });

  it('a Classic snapshot does not restore into an Arcade world', () => {
    const buf = createSnapshotBuf(createMatch(CLASSIC).state);
    snapshot(createMatch(CLASSIC).state, buf);
    expect(() => {
      restore(createMatch(ARCADE).state, buf);
    }).toThrow(RangeError);
  });

  it('an Arcade bot replay records the flag, validates and re-simulates identically', () => {
    const a = recordBotMatch(ARCADE, 600);
    const b = recordBotMatch(ARCADE, 600);
    expect(a.header.flags).toBe('rulesetArcade');
    expect(b).toEqual(a);
    expect(validateReplay(JSON.parse(JSON.stringify(a))).ok).toBe(true);
    expect(playReplay(a)).toEqual({ ok: true, finalHash: a.finalHash });
    expect(a.hashes).not.toEqual(recordBotMatch(CLASSIC, 600).hashes);
  });
});

describe('inputMaskFor', () => {
  it('Classic accepts bits 0..10; Arcade adds dash, guard and super (11..13); 14 and 15 stay reserved', () => {
    expect(inputMaskFor(DEFAULT_SIM_FLAGS)).toBe(0x7ff);
    expect(inputMaskFor(ARCADE.flags)).toBe(0x3fff);
  });
});
