import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  BUFFER_TICKS, COMBO_SCALE_PM, METER_CAST, METER_WEATHER, WEATHER_CHARGE_CAST, WEATHER_CHARGE_FULL, WEATHER_CHARGE_STEP, WEATHER_COOLDOWN_TICKS, WEATHER_EFFECTS, WEATHER_EFFECTS_ON,
  WEATHER_ELEMENTS, WEATHER_PM, WEATHER_RANGED_KINDS, WEATHER_RECOVERY_TICKS, WEATHER_TICKS, Weather,
} from '../../../data/arcade';
import { ABILITIES_A } from '../../../data/abilities-a';
import { ABILITIES_B } from '../../../data/abilities-b';
import { CHARACTERS } from '../../../data/characters';
import { arcadeRaceNumbers } from '../../arcade-numbers';
import type { Element } from '../../../data/elements';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { computeDamage } from '../../../rules/damage';
import { isFrozen, now } from '../../clock';
import { Cmd, inputMaskFor, type Command } from '../../commands';
import { EventSink, SimEventKind, type SimEvent } from '../../events';
import { hash } from '../../hash';
import { createMatch, type MatchSetup } from '../../match';
import { createSnapshotBuf, restore, snapshot } from '../../snapshot';
import {
  ARCADE_E, ARCADE_T, ARCADE_TEAM_BASE, ARCADE_WORLD_BASE, ArcadeE, ArcadeT, ArcadeW, cooldownIdx, EntityFlag, EntityKind,
  MAX_ENTITIES,
} from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { applyArcadeHit } from './hit';
import { RANGED } from './meter';
import { chargedWeather, skipIntro } from './round-testkit';
import { canAct } from './stun';
import { weatherDamage } from './weather';

const W = Cmd.weather;
/** The attacker race's Arcade damage pm (FUN-DESIGN 2.13), applied after the weather exactly as `applyArcadeHit` does. */
const racePm = (race: string, dmg: number): number => {
  const pm = arcadeRaceNumbers(race)[1];
  return pm === 1000 ? dmg : (dmg * pm) / 1000;
};
const E = (id: number, f: number): number => id * ARCADE_E + f;
const T = (team: number, f: number): number => ARCADE_TEAM_BASE + team * ARCADE_T + f;
const AW = (f: number): number => ARCADE_WORLD_BASE + f;
const of = (ev: readonly SimEvent[], kind: number): SimEvent[] => ev.filter((e) => e.kind === kind);
/** The weather slot as [kind, until, team]. */
const slot = (w: SimWorld): number[] => [ArcadeW.weather, ArcadeW.weatherUntil, ArcadeW.weatherTeam].map((f) => w.state.arcade[AW(f)] ?? 0);
/** One race per element. */
const RACE: Readonly<Record<Element, string>> = { fire: 'sindarosa', water: 'curomo', earth: 'rokcore', air: 'echo', void: 'dummy' };
const ELS = Object.keys(RACE) as Element[];

/** Fills both teams' weather charge (the cast spent it). */
const refill = chargedWeather;

/** `p1` (id 0) at (300, 300) facing east against `p2` (id 1) at (900, 300) facing west, straight into the fight. */
function duel(p1 = 'sindarosa', p2 = 'curomo', arcade = true, intro = false): SimWorld {
  const setup: MatchSetup = {
    simVersion: 15, seed: 3, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(p1), xp: 1 }],
    p2: [{ character: characterId(p2), xp: 1 }],
  };
  const created = createMatch(setup);
  const world = intro ? created : skipIntro(created);
  const s = world.state;
  s.x[0] = 300; s.y[0] = 300; s.dir[0] = 0;
  s.x[1] = 900; s.y[1] = 300; s.dir[1] = 4;
  if (!intro) refill(world);
  return world;
}

/** Steps (team 0 sends `c0`, team 1 `c1`) until the game clock reaches `g`, frozen ticks included; returns the events. */
function until(world: SimWorld, g: number, c0: Command = 0, c1: Command = 0): SimEvent[] {
  const out: SimEvent[] = [];
  while (now(world.state) < g || isFrozen(world.state)) out.push(...step(world, [c0, c1]));
  return out;
}

describe('weather table (FUN-DESIGN 2.14)', () => {
  it('has the design numbers', () => {
    expect([WEATHER_PM, WEATHER_TICKS, WEATHER_COOLDOWN_TICKS, WEATHER_RECOVERY_TICKS, METER_WEATHER]).toEqual([1200, 500, 50, 16, 50]);
    expect(Weather).toEqual({ none: 0, sun: 1, rain: 2, sandstorm: 3, gale: 4, eclipse: 5 });
    expect(WEATHER_ELEMENTS).toEqual([['fire', 'water'], ['water', 'fire'], ['earth', 'air'], ['air', 'earth'], ['void', null]]);
  });

  it('keeps the secondary effects as data rows, switched off', () => {
    expect(WEATHER_EFFECTS_ON).toBe(false);
    expect(WEATHER_EFFECTS.map((r) => [r.effect, r.value])).toEqual([
      ['meltFreezeTicks', 10], ['extinguishBurn', 1], ['projectileSpeedPm', 900], ['knockbackPm', 1100], ['none', 0],
    ]);
  });

  it('Cmd.weather is bit 14, Arcade only', () => {
    expect(W).toBe(1 << 14);
    expect(inputMaskFor({ rulesetArcade: false }) & W).toBe(0);
    expect(inputMaskFor({ rulesetArcade: true }) & W).toBe(W);
  });
});

describe('damage modifier (rule: favoured x1.2, counter /1.2, after the chart, before combo scaling)', () => {
  const setWeather = (w: SimWorld, kind: number): void => {
    w.state.arcade[AW(ArcadeW.weather)] = kind;
    w.state.arcade[AW(ArcadeW.weatherUntil)] = kind === 0 ? 0 : now(w.state) + 100;
  };
  /** Exact expected factor of an `att` attacker's damage under weather `kind`. */
  const factor = (kind: number, att: Element, raw: number): number => {
    const row = WEATHER_ELEMENTS[kind - 1];
    return row?.[0] === att ? (raw * 1200) / 1000 : row?.[1] === att ? (raw * 1000) / 1200 : raw;
  };

  it('weatherDamage: every weather against every attacker element', () => {
    const w = duel();
    const expected: Record<number, Partial<Record<Element, number>>> = {
      [Weather.none]: {},
      [Weather.sun]: { fire: 120, water: 100 / 1.2 },
      [Weather.rain]: { water: 120, fire: 100 / 1.2 },
      [Weather.sandstorm]: { earth: 120, air: 100 / 1.2 },
      [Weather.gale]: { air: 120, earth: 100 / 1.2 },
      [Weather.eclipse]: { void: 120 },
    };
    for (let kind = 0; kind <= 5; kind++) {
      setWeather(w, kind);
      for (const el of ELS) {
        const got = weatherDamage(w.state, 100, el);
        expect(got).toBeCloseTo(expected[kind]?.[el] ?? 100, 12);
        expect(got).toBe(factor(kind, el, 100));
      }
    }
  });

  it('every attacker/defender element pair under every weather: the hit is the chart damage times the weather factor', () => {
    for (const att of ELS) {
      for (const def of ELS) {
        for (let kind = 0; kind <= 5; kind++) {
          const w = duel(RACE[att], RACE[def]);
          const s = w.state;
          setWeather(w, kind);
          const raw = computeDamage({ base: 10, attackerMult: s.dmgMult[0] ?? 1, attEl: att, defEl: def, defReductionPct: 0 });
          const sink = new EventSink(0);
          applyArcadeHit(w, sink, 0, 0, 1, 10, 0, 0);
          expect(of(sink.events, SimEventKind.damage)[0]?.['amount'], `${att} on ${def}, weather ${String(kind)}`).toBe(
            racePm(RACE[att], factor(kind, att, raw)),
          );
        }
      }
    }
  });

  it('applies before the race pm and the combo scale: hit 3 under Sun is ((raw * 1200 / 1000) * pm / 1000) * 900 / 1000', () => {
    const w = duel('sindarosa', 'pax');
    const s = w.state;
    setWeather(w, Weather.sun);
    s.arcade[E(1, ArcadeE.stunUntil)] = now(s) + 50;
    s.arcade[T(0, ArcadeT.comboHits)] = 2;
    const raw = computeDamage({ base: 40, attackerMult: s.dmgMult[0] ?? 1, attEl: 'fire', defEl: 'earth', defReductionPct: 0 });
    const sink = new EventSink(0);
    applyArcadeHit(w, sink, 0, 0, 1, 40, 0, 0);
    expect(of(sink.events, SimEventKind.hitConfirmed)[0]).toMatchObject({ combo: 3, scalePm: COMBO_SCALE_PM[2] });
    expect(of(sink.events, SimEventKind.damage)[0]?.['amount']).toBe((racePm('sindarosa', (raw * 1200) / 1000) * 900) / 1000);
  });

  it('never changes who wins a mirror: both sides of a mirror take the same factor', () => {
    for (const el of ELS) {
      for (let kind = 0; kind <= 5; kind++) {
        const amounts = [0, 1].map((attacker) => {
          const w = duel(RACE[el], RACE[el]);
          setWeather(w, kind);
          const sink = new EventSink(0);
          applyArcadeHit(w, sink, attacker, attacker, 1 - attacker, 20, 0, 0);
          return of(sink.events, SimEventKind.damage)[0]?.['amount'];
        });
        expect(amounts[0]).toBe(amounts[1]);
      }
    }
  });
});

describe('cast (rule: element weather, 500 ticks, +50 meter, medium recovery)', () => {
  it('each element calls its own weather: fire Sun, water Rain, earth Sandstorm, air Gale, void Eclipse', () => {
    const expected: Record<Element, number> = {
      fire: Weather.sun, water: Weather.rain, earth: Weather.sandstorm, air: Weather.gale, void: Weather.eclipse,
    };
    for (const el of ELS) {
      const ev = step(duel(RACE[el], 'curomo'), [W, 0]);
      expect(of(ev, SimEventKind.weatherChanged)).toMatchObject([{ sourceId: 0, weather: expected[el], prev: 0, team: 0 }]);
    }
  });

  it('sets the slot for WEATHER_TICKS, books the cooldown and gains METER_WEATHER', () => {
    const w = duel();
    const s = w.state;
    const g = now(s);
    const ev = step(w, [W, 0]);
    expect(of(ev, SimEventKind.weatherChanged)).toMatchObject([{ weather: Weather.sun, prev: Weather.none, team: 0 }]);
    expect(slot(w)).toEqual([Weather.sun, g + WEATHER_TICKS, 0]);
    expect(s.arcade[E(0, ArcadeE.weatherReadyAt)]).toBe(g + WEATHER_COOLDOWN_TICKS);
    expect(s.arcade[T(0, ArcadeT.meter)]).toBe(METER_WEATHER);
    expect(METER_WEATHER).toBeGreaterThan(METER_CAST);
  });

  it('recovery: the caster cannot move or cast for WEATHER_RECOVERY_TICKS game ticks', () => {
    const w = duel();
    const s = w.state;
    const g = now(s);
    step(w, [W, 0]);
    until(w, g + WEATHER_RECOVERY_TICKS - 1, Cmd.right);
    expect(s.x[0]).toBe(300);
    expect(canAct(w, 0)).toBe(false);
    step(w, [Cmd.right, 0]);
    expect(now(s)).toBe(g + WEATHER_RECOVERY_TICKS);
    expect(canAct(w, 0)).toBe(true);
    step(w, [Cmd.right, 0]);
    expect(s.x[0]).toBeGreaterThan(300);
  });

  it('a hit during the recovery is a counter hit', () => {
    const w = duel('pax', 'sindarosa');
    const s = w.state;
    step(w, [W, 0]);
    s.abil[cooldownIdx(1, 0)] = 0;
    const g = now(s);
    step(w, [0, Cmd.primary]);
    for (let id = 0; id < MAX_ENTITIES; id++) {
      if (s.kind[id] !== EntityKind.projectile || ((s.flags[id] ?? 0) & EntityFlag.alive) === 0 || s.spawnTick[id] !== g) continue;
      s.x[id] = (s.x[0] ?? 0) + 40 - (s.vx[id] ?? 0);
      s.y[id] = (s.y[0] ?? 0) + 30;
    }
    expect(of(step(w, [0, 0]), SimEventKind.hitConfirmed)).toMatchObject([{ target: 0, counter: 1 }]);
    expect(now(s)).toBeLessThan(g + WEATHER_RECOVERY_TICKS);
  });

  it('no cast while stunned, guarding or outside the fight', () => {
    const stunned = duel();
    stunned.state.arcade[E(0, ArcadeE.stunUntil)] = now(stunned.state) + 20;
    expect(of(step(stunned, [W, 0]), SimEventKind.weatherChanged)).toEqual([]);
    const guarding = duel();
    expect(of(step(guarding, [W | Cmd.guard, 0]), SimEventKind.weatherChanged)).toEqual([]);
    const intro = duel('sindarosa', 'curomo', true, true);
    expect(of(step(intro, [W, 0]), SimEventKind.weatherChanged)).toEqual([]);
  });

  it('a press that cannot cast is buffered BUFFER_TICKS game ticks', () => {
    // Stunned through game tick g + BUFFER_TICKS - 1: the press at g casts at g + BUFFER_TICKS (age BUFFER_TICKS).
    const w = duel();
    const g = now(w.state);
    w.state.arcade[E(0, ArcadeE.stunUntil)] = g + BUFFER_TICKS;
    expect(of(step(w, [W, 0]), SimEventKind.weatherChanged)).toEqual([]);
    expect(of(until(w, g + BUFFER_TICKS + 1), SimEventKind.weatherChanged)).toMatchObject([{ weather: Weather.sun }]);
    expect(w.state.arcade[E(0, ArcadeE.weatherReadyAt)]).toBe(g + BUFFER_TICKS + WEATHER_COOLDOWN_TICKS);
    // One tick longer and the press ages out: no cast.
    const late = duel();
    late.state.arcade[E(0, ArcadeE.stunUntil)] = g + BUFFER_TICKS + 1;
    step(late, [W, 0]);
    expect(of(until(late, g + 3 * BUFFER_TICKS), SimEventKind.weatherChanged)).toEqual([]);
  });
});

describe('duration and lockout (rule: 500 ticks, 50-tick lockout)', () => {
  it('ends exactly WEATHER_TICKS game ticks after the cast with weatherEnded', () => {
    const w = duel();
    const g = now(w.state);
    step(w, [W, 0]);
    expect(of(until(w, g + WEATHER_TICKS), SimEventKind.weatherEnded)).toEqual([]);
    expect(weatherDamage(w.state, 100, 'fire')).toBe(120);
    expect(of(step(w, [0, 0]), SimEventKind.weatherEnded)).toMatchObject([{ weather: Weather.sun }]);
    expect(slot(w)).toEqual([0, 0, 0]);
    expect(weatherDamage(w.state, 100, 'fire')).toBe(100);
  });

  it('the next cast is ready WEATHER_COOLDOWN_TICKS after the last one, not a tick sooner', () => {
    const w = duel();
    const g = now(w.state);
    step(w, [W, 0]);
    refill(w);
    // A press BUFFER_TICKS + 1 before the cooldown runs out ages out of the buffer: no cast.
    until(w, g + WEATHER_COOLDOWN_TICKS - BUFFER_TICKS - 1);
    expect(of([...step(w, [W, 0]), ...until(w, g + WEATHER_COOLDOWN_TICKS + 4)], SimEventKind.weatherChanged)).toEqual([]);
    const b = duel();
    step(b, [W, 0]);
    refill(b);
    until(b, g + WEATHER_COOLDOWN_TICKS - 1);
    // Pressed one tick early: refused that tick, then cast from the buffer on the first ready tick.
    expect(of(step(b, [W, 0]), SimEventKind.weatherChanged)).toEqual([]);
    expect(of(step(b, [W, 0]), SimEventKind.weatherChanged)).toMatchObject([{ weather: Weather.sun, prev: Weather.sun }]);
    expect(b.state.arcade[E(0, ArcadeE.weatherReadyAt)]).toBe(g + 2 * WEATHER_COOLDOWN_TICKS);
  });
});

describe('replace and refresh (rule: a new weather replaces, the same one only refreshes)', () => {
  it('a different weather replaces the old one at once, with a fresh timer and owner, no weatherEnded', () => {
    const w = duel('sindarosa', 'curomo');
    const g = now(w.state);
    step(w, [W, 0]);
    until(w, g + 10);
    const ev = step(w, [0, W]);
    expect(of(ev, SimEventKind.weatherChanged)).toMatchObject([{ sourceId: 1, weather: Weather.rain, prev: Weather.sun, team: 1 }]);
    expect(of(ev, SimEventKind.weatherEnded)).toEqual([]);
    expect(slot(w)).toEqual([Weather.rain, g + 10 + WEATHER_TICKS, 1]);
    expect(of(until(w, g + 10 + WEATHER_TICKS), SimEventKind.weatherEnded)).toEqual([]);
    expect(of(step(w, [0, 0]), SimEventKind.weatherEnded)).toMatchObject([{ weather: Weather.rain }]);
  });

  it('the same weather only refreshes the timer (no stacking): the factor stays x1.2', () => {
    const w = duel('sindarosa', 'lavax');
    const g = now(w.state);
    step(w, [W, 0]);
    until(w, g + 100);
    const ev = step(w, [0, W]);
    expect(of(ev, SimEventKind.weatherChanged)).toMatchObject([{ weather: Weather.sun, prev: Weather.sun, team: 1 }]);
    expect(slot(w)).toEqual([Weather.sun, g + 100 + WEATHER_TICKS, 1]);
    expect(weatherDamage(w.state, 100, 'fire')).toBe(120);
  });

  it('two casts on one tick: team 0 first, so team 1 replaces it', () => {
    const w = duel('sindarosa', 'curomo');
    const ev = of(step(w, [W, W]), SimEventKind.weatherChanged);
    expect(ev).toMatchObject([{ weather: Weather.sun, prev: 0, team: 0 }, { weather: Weather.rain, prev: Weather.sun, team: 1 }]);
    expect(slot(w)[0]).toBe(Weather.rain);
  });
});

describe('round reset', () => {
  it('ends the weather (weatherEnded before roundStarted) and clears every weather cooldown', () => {
    const w = duel('sindarosa', 'curomo');
    const s = w.state;
    step(w, [W, W]);
    s.hp[1] = 0;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 400 && !ev.some((e) => e.kind === SimEventKind.roundStarted); i++) ev.push(...step(w, [0, 0]));
    const kinds = ev.filter((e) => e.kind === SimEventKind.weatherEnded || e.kind === SimEventKind.roundStarted);
    expect(kinds).toMatchObject([{ kind: SimEventKind.weatherEnded, weather: Weather.rain }, { kind: SimEventKind.roundStarted, round: 2 }]);
    expect(slot(w)).toEqual([0, 0, 0]);
    expect([s.arcade[E(0, ArcadeE.weatherReadyAt)], s.arcade[E(1, ArcadeE.weatherReadyAt)]]).toEqual([0, 0]);
  });
});

describe('weather charge (owner rule 2026-11-10, WP-arcade-weather-charge)', () => {
  const charge = (w: SimWorld, team: number): number => w.state.arcade[T(team, ArcadeT.weatherCharge)] ?? 0;
  const setCharge = (w: SimWorld, team: number, v: number): void => {
    w.state.arcade[T(team, ArcadeT.weatherCharge)] = v;
  };
  /** A duel whose charges start empty (sindarosa, ranged, is team 0; curomo, melee, team 1). */
  const empty = (p1 = 'sindarosa', p2 = 'curomo'): SimWorld => {
    const w = duel(p1, p2);
    setCharge(w, 0, 0);
    setCharge(w, 1, 0);
    return w;
  };

  it('has the design numbers and the ranged kinds', () => {
    expect([WEATHER_CHARGE_FULL, WEATHER_CHARGE_CAST, WEATHER_CHARGE_STEP, WEATHER_COOLDOWN_TICKS]).toEqual([1000, 30, 4, 50]);
    expect(WEATHER_RANGED_KINDS).toEqual(['range', 'omni']);
  });

  it('a hero is ranged exactly when its primary ability is a range or omni projectile', () => {
    const kinds = [...ABILITIES_A, ...ABILITIES_B];
    CHARACTERS.forEach((c, i) => {
      const kind = kinds.find((d) => d.id === c.abilities[0])?.kind ?? '';
      expect(RANGED[i] === 1, c.id).toBe(WEATHER_RANGED_KINDS.includes(kind));
    });
    const byId = (id: string): number => RANGED[CHARACTERS.findIndex((c) => c.id === id)] ?? -1;
    expect([byId('sindarosa'), byId('cyclonius'), byId('curomo'), byId('treenoc'), byId('pax'), byId('fiara')]).toEqual([1, 1, 0, 0, 0, 0]);
  });

  it('starts empty, and weather does nothing until the charge is full', () => {
    const w = empty();
    expect([charge(w, 0), charge(w, 1)]).toEqual([0, 0]);
    expect(of(until(w, now(w.state) + 60, W, W), SimEventKind.weatherChanged)).toEqual([]);
    expect(slot(w)).toEqual([0, 0, 0]);
    setCharge(w, 0, WEATHER_CHARGE_FULL - 1);
    expect(of(until(w, now(w.state) + 10, W, 0), SimEventKind.weatherChanged)).toEqual([]);
    setCharge(w, 0, WEATHER_CHARGE_FULL);
    step(w, [0, 0]);
    expect(of(step(w, [W, 0]), SimEventKind.weatherChanged)).toMatchObject([{ weather: Weather.sun, team: 0 }]);
  });

  it('a cast spends the whole charge and books only the lockout', () => {
    const w = empty();
    const g = now(w.state);
    setCharge(w, 0, WEATHER_CHARGE_FULL);
    setCharge(w, 1, 500);
    step(w, [W, 0]);
    expect([charge(w, 0), charge(w, 1)]).toEqual([0, 500]);
    expect(w.state.arcade[E(0, ArcadeE.weatherReadyAt)]).toBe(g + WEATHER_COOLDOWN_TICKS);
  });

  it('a held key casts once: the charge is gone and the lockout holds', () => {
    const w = empty();
    setCharge(w, 0, WEATHER_CHARGE_FULL);
    expect(of(until(w, now(w.state) + 200, W, 0), SimEventKind.weatherChanged)).toHaveLength(1);
  });

  it('a ranged hero gains WEATHER_CHARGE_CAST per primary and per secondary cast, and nothing from walking', () => {
    const w = empty();
    step(w, [Cmd.primary, 0]);
    expect(charge(w, 0)).toBe(WEATHER_CHARGE_CAST);
    until(w, now(w.state) + 60);
    step(w, [Cmd.secondary, 0]);
    expect(charge(w, 0)).toBe(2 * WEATHER_CHARGE_CAST);
    const walker = empty();
    for (let i = 0; i < 20; i++) step(walker, [Cmd.left, 0]);
    expect(charge(walker, 0)).toBe(0);
  });

  it('a melee-class hero gains WEATHER_CHARGE_STEP per walked tick, nothing idle or from casting', () => {
    const w = empty();
    for (let i = 0; i < 10; i++) step(w, [0, 0]);
    expect(charge(w, 1)).toBe(0);
    for (let i = 0; i < 10; i++) step(w, [0, Cmd.left | Cmd.up]);
    expect(charge(w, 1)).toBe(10 * WEATHER_CHARGE_STEP);
    step(w, [0, Cmd.primary]);
    until(w, now(w.state) + 60);
    step(w, [0, Cmd.secondary]);
    expect(charge(w, 1)).toBe(10 * WEATHER_CHARGE_STEP);
  });

  it('a tick blocked by a wall charges nothing, and the charge caps at WEATHER_CHARGE_FULL', () => {
    const w = empty('sindarosa', 'pax');
    w.state.x[1] = w.arena.x + w.arena.w - (w.state.w[1] ?? 0);
    for (let i = 0; i < 5; i++) step(w, [0, Cmd.right]);
    expect(charge(w, 1)).toBe(0);
    setCharge(w, 1, WEATHER_CHARGE_FULL - 1);
    step(w, [0, Cmd.left]);
    step(w, [0, Cmd.left]);
    expect(charge(w, 1)).toBe(WEATHER_CHARGE_FULL);
  });

  it('the round reset empties both charges', () => {
    const w = duel('sindarosa', 'curomo');
    w.state.hp[1] = 0;
    const ev: SimEvent[] = [];
    for (let i = 0; i < 400 && !ev.some((e) => e.kind === SimEventKind.roundStarted); i++) ev.push(...step(w, [0, 0]));
    expect(of(ev, SimEventKind.roundStarted)).toHaveLength(1);
    expect([charge(w, 0), charge(w, 1)]).toEqual([0, 0]);
  });

  it('Classic has no charge block and never reads one', () => {
    const w = duel('sindarosa', 'curomo', false);
    for (let i = 0; i < 10; i++) step(w, [Cmd.left | Cmd.primary, Cmd.left]);
    expect(w.state.arcade.length).toBe(0);
  });

  it('property: the charge stays in 0..FULL and only moves by a cast gain, a step gain, a spend or a reset', () => {
    const race = fc.constantFrom(...CHARACTERS.filter((c) => c.id !== 'eternal-void').map((c) => c.id));
    const cmd = fc.integer({ min: 0, max: 0x3f | W });
    fc.assert(
      fc.property(race, race, fc.array(fc.tuple(cmd, cmd), { minLength: 1, maxLength: 400 }), (p1, p2, inputs) => {
        const w = empty(p1, p2);
        w.state.hp[0] = 10_000;
        w.state.hp[1] = 10_000;
        for (const [a, b] of inputs) {
          const before = [charge(w, 0), charge(w, 1)];
          step(w, [a, b]);
          for (const team of [0, 1]) {
            const now_ = charge(w, team);
            const was = before[team] ?? 0;
            expect(now_).toBeGreaterThanOrEqual(0);
            expect(now_).toBeLessThanOrEqual(WEATHER_CHARGE_FULL);
            // Up by at most a cast and a step in one tick (a tag swap casts too), or down to 0 (a spend or a reset).
            if (now_ !== was && now_ !== 0) expect(now_ - was).toBeGreaterThan(0);
            expect(now_ - was).toBeLessThanOrEqual(2 * WEATHER_CHARGE_CAST + WEATHER_CHARGE_STEP);
          }
        }
      }),
      { numRuns: 40, seed: 0xc4a96e },
    );
  });
});

describe('Classic', () => {
  it('ignores the weather bit', () => {
    const a = duel('sindarosa', 'curomo', false);
    const b = duel('sindarosa', 'curomo', false);
    for (const c of [W, W | Cmd.right, Cmd.primary | W, 0, W]) {
      const kinds = step(a, [c, c]).map((e) => e.kind);
      step(b, [c & ~W, c & ~W]);
      expect(hash(a.state)).toBe(hash(b.state));
      expect(kinds.some((k) => k >= 40)).toBe(false);
    }
  });
});

describe('weather properties', () => {
  const race = fc.constantFrom(...CHARACTERS.filter((c) => c.id !== 'eternal-void').map((c) => c.id));
  const cmd = fc.tuple(fc.integer({ min: 0, max: 0x3f }), fc.boolean()).map(([c, x]) => c | (x ? W : 0));
  const runs = fc
    .array(fc.tuple(fc.integer({ min: 1, max: 120 }), cmd, cmd), { minLength: 1, maxLength: 30 })
    .map((rs) => rs.flatMap(([k, p, q]) => Array.from({ length: k }, (_, i): [number, number] => [i === 0 ? p : p & ~W, i === 0 ? q : q & ~W])));

  it('the slot, timers and cooldowns obey the rules, and re-simulate to identical hashes after a snapshot restore', () => {
    let casts = 0;
    let replaced = 0;
    let ended = 0;
    fc.assert(
      fc.property(race, race, runs, fc.nat(), (p1, p2, inputs, cut) => {
        const make = (): SimWorld => {
          const w = duel(p1, p2);
          w.state.hp[0] = 10_000;
          w.state.hp[1] = 10_000;
          return w;
        };
        const world = make();
        const s = world.state;
        const lastCast = [-WEATHER_COOLDOWN_TICKS, -WEATHER_COOLDOWN_TICKS];
        const hashes: number[] = [];
        for (const [p, q] of inputs) {
          const g = now(s);
          const before = slot(world);
          const evs = step(world, [p, q]);
          hashes.push(hash(s));
          const [kind = 0, end = 0, team = 0] = slot(world);
          if (kind === 0) expect([end, team]).toEqual([0, 0]);
          else {
            expect(kind).toBeLessThanOrEqual(Weather.eclipse);
            expect(end - now(s)).toBeGreaterThanOrEqual(0);
            expect(end - now(s)).toBeLessThan(WEATHER_TICKS);
          }
          let prev = before[0];
          for (const e of evs) {
            if (e.kind === SimEventKind.weatherEnded) {
              ended++;
              expect(e['weather']).toBe(prev);
              expect(before[1]).toBe(g);
              prev = 0;
            }
            if (e.kind !== SimEventKind.weatherChanged) continue;
            casts++;
            if (e['prev'] !== 0 && e['prev'] !== e['weather']) replaced++;
            expect(e['prev']).toBe(prev);
            const caster = e.sourceId;
            const el = CHARACTERS[s.defId[caster] ?? 0]?.element;
            expect(e['weather']).toBe(WEATHER_ELEMENTS.findIndex((r) => r[0] === el) + 1);
            expect(g - (lastCast[caster] ?? 0)).toBeGreaterThanOrEqual(WEATHER_COOLDOWN_TICKS);
            lastCast[caster] = g;
            expect(s.arcade[E(caster, ArcadeE.weatherReadyAt)]).toBe(g + WEATHER_COOLDOWN_TICKS);
            prev = e['weather'] ?? 0;
          }
          expect(kind).toBe(prev);
        }
        const again = make();
        const k = cut % inputs.length;
        for (const [p, q] of inputs.slice(0, k)) step(again, [p, q]);
        const buf = createSnapshotBuf(again.state);
        snapshot(again.state, buf);
        for (const [p, q] of inputs.slice(k)) step(again, [p, q]);
        restore(again.state, buf);
        const rest = inputs.slice(k).map(([p, q]) => {
          step(again, [p, q]);
          return hash(again.state);
        });
        expect(rest).toEqual(hashes.slice(k));
      }),
      { numRuns: 60, seed: 0x3ea7 },
    );
    expect(casts).toBeGreaterThan(40);
    expect(replaced).toBeGreaterThan(5);
    expect(ended).toBeGreaterThan(5);
  });
});
