import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ABILITIES_B } from '../data/abilities-b';
import { HitStrength } from '../data/arcade';
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
import { skipIntro } from './systems/arcade/round-testkit';
import { createSnapshotBuf, restore, snapshot, SnapshotRing } from './snapshot';
import {
  ARCADE_E, ARCADE_LENGTH, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_W, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW,
  cooldownIdx, EntityFlag, EntityKind, MAX_ENTITIES, TEAM_COUNT, World, stateArrays, type SimState,
} from './state';
import { SimEventKind, type SimEvent } from './events';
import { ABILITY_DEFS } from './systems/projectile';
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
    expect(ARCADE_LENGTH).toBe(15 * MAX_ENTITIES + 16 * TEAM_COUNT + 9);
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
    const w = skipIntro(createMatch(ARCADE));
    const s = w.state;
    step(w, [Cmd.primary, 0]);
    const ready = s.abil[cooldownIdx(0, 0)] ?? 0;
    expect(ready).toBeGreaterThan(1);
    s.arcade[FREEZE_UNTIL] = (s.world[World.tick] ?? 0) + 5;
    const before = stateArrays(s).map((a) => Array.from(a));
    for (let t = 0; t < 5; t++) {
      expect(isFrozen(s)).toBe(true);
      expect(step(w, [Cmd.right | Cmd.primary, Cmd.left | Cmd.primary])).toEqual([]);
    }
    const tickArray = stateArrays(s).indexOf(s.world);
    const arcadeArray = stateArrays(s).indexOf(s.arcade);
    // The input slot still records press edges for the buffer (FUN-DESIGN 2.12): team 1's new primary press, at game
    // tick 1 (stored plus one); team 0 kept holding primary, so it has no new press. Both new direction edges are recorded
    // for the double-tap dash (FUN-DESIGN 2.7).
    const team = (t: number, f: number): number => ARCADE_TEAM_BASE + t * ARCADE_T + f;
    expect(s.arcade[team(1, ArcadeT.pressTick)]).toBe(2);
    expect(s.arcade[team(0, ArcadeT.pressTick)]).toBe(1);
    expect(s.arcade[team(1, ArcadeT.prevCmd)]).toBe(Cmd.left | Cmd.primary);
    expect([s.arcade[team(0, ArcadeT.lastDir)], s.arcade[team(1, ArcadeT.lastDir)]]).toEqual([Cmd.right, Cmd.left]);
    stateArrays(s).forEach((a, k) => {
      const want = before[k] as number[];
      if (k === tickArray) want[World.tick] = 6;
      if (k === arcadeArray) {
        for (const i of [team(0, ArcadeT.prevCmd), team(1, ArcadeT.prevCmd), team(1, ArcadeT.pressTick)]) want[i] = a[i] ?? 0;
        for (const t of [0, 1]) for (const f of [ArcadeT.lastDir, ArcadeT.lastDirPress]) want[team(t, f)] = a[team(t, f)] ?? 0;
      }
      expect(Array.from(a)).toEqual(want);
    });
    expect(now(s)).toBe(1);
    expect(isFrozen(s)).toBe(false);
    // Fire Blast is ready again at game time `ready`, which is now W.tick ready + 5: pressing earlier does nothing.
    while ((s.world[World.tick] ?? 0) < ready + 5) step(w, [Cmd.primary, 0]);
    expect(s.abil[cooldownIdx(0, 0)]).toBe(ready);
    expect(now(s)).toBe(ready);
    step(w, [Cmd.primary, 0]);
    expect(now(s)).toBe(ready + 1);
    expect(s.abil[cooldownIdx(0, 0)]).toBeGreaterThan(ready);
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
 * Classic and Arcade side by side. Until the first Arcade hit (or stun) and the first wall contact, an Arcade match is
 * Classic shifted in W.tick by the freezes it took: after every step the Arcade world is stepped through its freeze
 * (each frozen step must be silent), and then equals Classic in every entity, team, status and rng value and emits the
 * same Classic events (ids aside; Arcade adds melee `damage` and the kinds 40+). An extra freeze of `n` ticks is
 * injected at tick `at`. That proves every timer read goes through the game clock `now(s)`, and that hit-stop only
 * freezes. From the first hit on, hit-stun and knockback (WP-arcade-stun-knockback), the both-axis walls and the first
 * diagonal cast (8-way aim) and the first dash (FUN-DESIGN 2.7) diverge from Classic by design; the freeze lengths and the game clock are still checked on every step.
 */
describe('an Arcade match is Classic shifted by its freezes', () => {
  type Inputs = readonly (readonly [number, number])[];
  /** Events without their W.tick (the shifted part of the id) and seq (Arcade events interleave). */
  const strip = (evs: readonly SimEvent[]): unknown[] => evs.map((e) => ({ ...e, tick: 0, seq: 0 }));
  /** The Classic part of Arcade events: no Arcade kinds, no melee `damage` (each is followed by its hitConfirmed). */
  const classicPart = (evs: readonly SimEvent[]): readonly SimEvent[] =>
    evs.filter((e, i) => {
      const next = evs[i + 1];
      const melee = next?.kind === SimEventKind.hitConfirmed && ABILITY_DEFS[next['ability'] ?? -1]?.kind === 'melee';
      return e.kind < 40 && !(e.kind === SimEventKind.damage && melee);
    });
  /**
   * True once an Arcade cast went along a diagonal 8-way aim (WP-arcade-8way-aim): a live projectile or melee with an
   * odd dir that is not an omni fan bullet. Classic only ever casts along the 4-way facing.
   */
  const aimedDiagonally = (s: SimState): boolean => {
    for (let id = 0; id < MAX_ENTITIES; id++) {
      const k = s.kind[id];
      if ((k !== EntityKind.projectile && k !== EntityKind.melee) || ((s.dir[id] ?? 0) & 1) === 0) continue;
      if (((s.flags[id] ?? 0) & EntityFlag.alive) !== 0 && ABILITY_DEFS[s.defId[id] ?? 0]?.kind !== 'omni') return true;
    }
    return false;
  };
  /** True once any Arcade character has been stunned (Entangling Vines stuns without a `hitConfirmed`). */
  const stunned = (s: SimState): boolean => {
    for (let id = 0; id < MAX_ENTITIES; id++) if ((s.arcade[id * ARCADE_E + ArcadeE.stunUntil] ?? 0) !== 0) return true;
    return false;
  };
  /** `prep` edits both tick-0 worlds the same way (hurt everyone, place the fighters). Returns the Arcade events. */
  const runBoth = (
    setup: MatchSetup, inputs: Inputs, at: number, n: number, prep?: (s: SimState) => void,
  ): SimEvent[] => {
    const c = createMatch(setup);
    const a = skipIntro(createMatch({ ...setup, flags: { ...setup.flags, rulesetArcade: true } }));
    prep?.(c.state);
    prep?.(a.state);
    const ca = stateArrays(c.state);
    const aa = stateArrays(a.state);
    const all: SimEvent[] = [];
    let shift = 0;
    let diverged = false;
    inputs.forEach(([p, q], t) => {
      if (t === at && n > 0) {
        a.state.arcade[FREEZE_UNTIL] = (a.state.world[World.tick] ?? 0) + n;
        for (let k = 0; k < n; k++) expect(step(a, [p, q])).toEqual([]);
        shift += n;
      }
      const evs = step(a, [p, q]);
      all.push(...evs);
      const cevs = step(c, [p, q]);
      // A death diverges too: Arcade keeps the multiplier and its round system takes over (KO, rounds; FUN-DESIGN 2.10).
      diverged ||=
        evs.some((e) => e.kind === SimEventKind.hitConfirmed || e.kind === SimEventKind.died || e.kind === SimEventKind.dashed) ||
        cevs.some((e) => e.kind === SimEventKind.blocked) ||
        stunned(a.state) ||
        aimedDiagonally(a.state);
      if (!diverged) expect(strip(classicPart(evs))).toEqual(strip(cevs));
      const stops = evs.filter((e) => e.kind === SimEventKind.hitStop).map((e) => e['ticks'] ?? 0);
      // Every hit stops the clock; a KO that no hit caused (the round's `ko`) adds the round's KO stop.
      const hits = evs.filter((e) => e.kind === SimEventKind.hitConfirmed).length;
      expect(stops.length).toBeGreaterThanOrEqual(hits);
      expect(stops.length).toBeLessThanOrEqual(hits + evs.filter((e) => e.kind === SimEventKind.ko).length);
      let frozen = 0;
      while (isFrozen(a.state)) {
        expect(step(a, [p, q])).toEqual([]);
        frozen++;
      }
      expect(frozen).toBe(Math.max(0, ...stops));
      shift += frozen;
      expect(now(a.state)).toBe(now(c.state));
      if (diverged) return;
      // stateArrays ends with world, rng, arcade: every entity, team, status and rng array must match exactly.
      for (let k = 0; k < ca.length - 1; k++) if (k !== ca.length - 3) expect(aa[k]).toEqual(ca[k]);
      expect(Array.from(a.state.world)).toEqual(
        Array.from(c.state.world, (v, i) =>
          i === World.flags ? v | flagBit('rulesetArcade') : i === World.tick ? v + shift : v,
        ),
      );
    });
    return all;
  };

  it('property: random setups, all 16 command bits, one freeze anywhere', () => {
    let hits = 0;
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
          const evs = runBoth({ ...CLASSIC, seed, chapter, p1, p2 }, inputs, at, n, hurt);
          hits += evs.filter((e) => e.kind === SimEventKind.hitConfirmed).length;
        },
      ),
      { numRuns: 40, seed: 0xa4c },
    );
    expect(hits).toBeGreaterThan(0);
  });

  it('Hurricane hit intervals (hitMask) run on the game clock across a freeze', () => {
    const duel = { ...ARCADE, p1: [{ character: characterId('echo'), xp: 1 }], p2: [{ character: characterId('pax'), xp: 1 }] };
    const interval = (ABILITIES_B.find((d) => d.id === 'hurricane')?.damageIntervalTicks ?? 0) + 1;
    for (const at of [3, 5, 9]) {
      const w = skipIntro(createMatch(duel));
      const s = w.state;
      s.x[0] = 500; s.y[0] = 300; s.dir[0] = 0;
      const hits: [number, number][] = [];
      for (let t = 0; t < 120; t++) {
        if (t === at) s.arcade[FREEZE_UNTIL] = (s.world[World.tick] ?? 0) + 7;
        s.x[1] = 580; s.y[1] = 300; // pinned: knockback would carry Pax out of the hurricane
        const [tick, game] = [s.world[World.tick] ?? 0, now(s)];
        const evs = step(w, [Cmd.secondary, 0]);
        for (const e of evs) if (e.kind === SimEventKind.hitConfirmed) hits.push([tick, game]);
        expect(evs.filter((e) => e.kind === SimEventKind.hitConfirmed).every((e) => e['strength'] === HitStrength.light)).toBe(true);
      }
      expect(hits.length).toBeGreaterThan(2);
      // Game-clock gaps are the Classic interval; W.tick gaps add the 4-tick light hit-stop (and the injected freeze).
      for (let i = 1; i < hits.length; i++) {
        const [[t0, g0], [t1, g1]] = [hits[i - 1] ?? [0, 0], hits[i] ?? [0, 0]];
        expect(g1 - g0).toBe(interval);
        expect(t1 - t0).toBeGreaterThanOrEqual(interval + 4);
      }
    }
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
