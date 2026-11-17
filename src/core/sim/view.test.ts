import { describe, expect, it } from 'vitest';
import { characterId } from '../data/ids';
import { GUARD_MAX, TAG_COOLDOWN_TICKS, WEATHER_CHARGE_FULL, WEATHER_TICKS, Weather } from '../data/arcade';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { ARCADE_E, ARCADE_WORLD_BASE, ArcadeE, ArcadeW } from './state';
import { Cmd } from './commands';
import { EventSink } from './events';
import { isSlowMoHold, now } from './clock';
import { hash } from './hash';
import { createMatch, type MatchSetup } from './match';
import { ABILITY_DEFS } from './systems/projectile';
import { applyArcadeHit } from './systems/arcade/hit';
import { chargedWeather, skipIntro } from './systems/arcade/round-testkit';
import { step } from './step';
import { abilitySlugAt, createRenderView, type RenderCharacter } from './view';
import { SIM_VERSION } from '../version';

function match(arcade: boolean): MatchSetup {
  return {
    simVersion: SIM_VERSION, seed: 7, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('sindarosa'), xp: 1 }],
    p2: [{ character: characterId('pax'), xp: 1 }],
  };
}

describe('RenderView.arcade (FUN-DESIGN section 3)', () => {
  it('is undefined in Classic', () => {
    expect(createRenderView(createMatch(match(false))).arcade()).toBeUndefined();
  });

  it('reports the freeze, the live combo, the meters and the victim stun after a hit, reusing one object', () => {
    const world = skipIntro(createMatch(match(true)));
    const view = createRenderView(world);
    const before = view.arcade();
    expect(before).toMatchObject({ frozen: false, comboHits: [0, 0], comboDamage: [0, 0], meter: [0, 0] });
    expect(before?.stunned(1)).toBe(false);
    world.state.hp[1] = 10_000;
    applyArcadeHit(world, new EventSink(0), 0, 0, 1, 16, ABILITY_DEFS.findIndex((d) => d.id === 'fire-blast'), 0);
    const after = view.arcade();
    expect(after).toBe(before);
    expect(after?.frozen).toBe(true);
    expect(after?.comboHits).toEqual([1, 0]);
    expect(after?.comboDamage[0]).toBeGreaterThan(0);
    // Both meters rise: the attacker by 800 and the victim by 600 per mille of the life share removed.
    expect(after?.meter[0]).toBeGreaterThan(after?.meter[1] ?? 0);
    expect(after?.meter[1]).toBeGreaterThan(0);
    expect(after?.stunned(1)).toBe(true);
    expect(after?.invulnerable(1)).toBe(false);
  });

  it('exposes the game clock and the slow-motion hold of the next step through a scripted KO', () => {
    const world = skipIntro(createMatch(match(true)));
    const view = createRenderView(world);
    const ar = view.arcade();
    expect(ar?.gameTick).toBe(now(world.state));
    expect(ar?.slowHold).toBe(false);
    world.state.hp[1] = 1;
    world.state.x[0] = 400; world.state.x[1] = 480; world.state.y[1] = world.state.y[0] ?? 0; world.state.dir[0] = 0;
    let sawHold = false;
    let sawFrozen = false;
    for (let i = 0; i < 400; i++) {
      step(world, [i < 80 ? Cmd.primary : 0, 0]);
      view.arcade();
      expect(ar?.gameTick).toBe(now(world.state));
      expect(ar?.slowHold).toBe(isSlowMoHold(world.state));
      sawHold ||= ar?.slowHold === true;
      sawFrozen ||= ar?.frozen === true;
    }
    expect(sawFrozen).toBe(true);
    expect(sawHold).toBe(true);
  });

  it('reports the sudden-death slot (read-out only)', () => {
    const world = skipIntro(createMatch(match(true)));
    const view = createRenderView(world);
    expect(view.arcade()?.sudden).toBe(false);
    world.state.arcade[ARCADE_WORLD_BASE + ArcadeW.sudden] = 1;
    expect(view.arcade()?.sudden).toBe(true);
  });

  it('reports the guard meter (full until drained) and whether a character guards (read-outs only)', () => {
    const world = skipIntro(createMatch(match(true)));
    const ar = createRenderView(world).arcade();
    expect(ar?.guard(0)).toBe(GUARD_MAX);
    expect(ar?.guarding(0)).toBe(false);
    world.state.arcade[ArcadeE.guardDrain] = 300;
    world.state.arcade[ArcadeE.blockUntil] = (world.state.arcade[ARCADE_WORLD_BASE + ArcadeW.gameTick] ?? 0) + 5;
    expect(ar?.guard(0)).toBe(GUARD_MAX - 300);
    expect(ar?.guarding(0)).toBe(true);
    expect(ar?.guarding(1)).toBe(false);
  });

  it('reports the ticks until a melee hero can charge (0 ready) and -1 for a ranged hero (read-out only)', () => {
    const world = skipIntro(createMatch(match(true)));
    const ar = createRenderView(world).arcade();
    expect(ar?.chargeIn(0)).toBe(-1); // Sindarosa casts at range
    expect(ar?.chargeIn(1)).toBe(0); // Pax
    world.state.arcade[1 * ARCADE_E + ArcadeE.chargeReadyAt] = (world.state.arcade[ARCADE_WORLD_BASE + ArcadeW.gameTick] ?? 0) + 120;
    expect(ar?.chargeIn(1)).toBe(120);
  });

  it('reports the ticks until a dash is ready and the active character (read-outs only)', () => {
    const world = skipIntro(createMatch(match(true)));
    const ar = createRenderView(world).arcade();
    expect(ar?.active(0)).toBe(0);
    expect(ar?.dashIn(0)).toBe(0);
    world.state.arcade[ArcadeE.dashReadyAt] = (world.state.arcade[ARCADE_WORLD_BASE + ArcadeW.gameTick] ?? 0) + 25;
    expect(ar?.dashIn(0)).toBe(25);
  });

  it('reports the weather up and the game ticks it has left (read-outs only)', () => {
    const world = chargedWeather(skipIntro(createMatch(match(true))));
    const view = createRenderView(world);
    expect(view.arcade()).toMatchObject({ weather: Weather.none, weatherLeft: 0, weatherCharge: [WEATHER_CHARGE_FULL, WEATHER_CHARGE_FULL] });
    // Sindarosa (fire) calls Sunshine for WEATHER_TICKS game ticks, counted from the cast.
    step(world, [Cmd.weather, 0]);
    const left = view.arcade()?.weatherLeft ?? 0;
    expect(view.arcade()?.weather).toBe(Weather.sun);
    expect(left).toBeGreaterThan(WEATHER_TICKS - 3);
    expect(left).toBeLessThanOrEqual(WEATHER_TICKS);
    for (let i = 0; i < 10; i++) step(world, [0, 0]);
    expect(view.arcade()?.weatherLeft).toBe(left - 10);
    for (let i = 0; i < WEATHER_TICKS; i++) step(world, [0, 0]);
    expect(view.arcade()).toMatchObject({ weather: Weather.none, weatherLeft: 0 });
  });

  it('gives every character its element', () => {
    const els: string[] = [];
    createRenderView(createMatch(match(false))).forEachCharacter((c: RenderCharacter) => els.push(c.element));
    expect(els).toEqual(['fire', 'earth']);
  });

  it('reads the tag cooldown as 150 ticks in Arcade and the swap cooldown as 250 in Classic (WP-arcade-2v2-tune)', () => {
    expect(createRenderView(createMatch(match(true))).actionBar(0)?.swapCooldownTicks).toBe(TAG_COOLDOWN_TICKS);
    expect(TAG_COOLDOWN_TICKS).toBe(150);
    expect(createRenderView(createMatch(match(false))).actionBar(0)?.swapCooldownTicks).toBe(250);
  });
});

describe('RenderArcade crowd-control read-outs (CA1)', () => {
  it('match their ArcadeE fields in a scripted state and leave the state untouched', () => {
    const world = skipIntro(createMatch(match(true)));
    const s = world.state;
    const view = createRenderView(world);
    const ar = view.arcade();
    const g = now(s);
    const e = 1 * ARCADE_E;
    expect([ar?.stunLeft(1), ar?.rootLeft(1), ar?.rootImmuneLeft(1), ar?.mireLeft(1), ar?.kbSpeed(1), ar?.wallBounced(1)]).toEqual([0, 0, 0, 0, 0, false]);
    s.arcade[e + ArcadeE.stunUntil] = g + 12;
    s.arcade[e + ArcadeE.rootUntil] = g + 40;
    s.arcade[e + ArcadeE.rootImmuneUntil] = g + 90;
    s.arcade[e + ArcadeE.trapSlowUntil] = g + 33;
    s.arcade[e + ArcadeE.kbVx] = -48;
    s.arcade[e + ArcadeE.kbVy] = 16;
    s.arcade[e + ArcadeE.wallBounced] = 1;
    const before = hash(s);
    expect(ar?.stunLeft(1)).toBe(12);
    expect(ar?.rootLeft(1)).toBe(40);
    expect(ar?.rootImmuneLeft(1)).toBe(0); // while rooted
    expect(ar?.mireLeft(1)).toBe(33);
    expect(ar?.kbSpeed(1)).toBe(4);
    expect(ar?.wallBounced(1)).toBe(true);
    s.arcade[e + ArcadeE.rootUntil] = 0;
    expect(ar?.rootLeft(1)).toBe(0);
    expect(ar?.rootImmuneLeft(1)).toBe(90);
    s.arcade[e + ArcadeE.rootUntil] = g + 40;
    expect(hash(s)).toBe(before);
  });

  it('shows the stun and knockback of a real hit through the accessors', () => {
    const world = skipIntro(createMatch(match(true)));
    const view = createRenderView(world);
    world.state.hp[1] = 10_000;
    applyArcadeHit(world, new EventSink(0), 0, 0, 1, 16, ABILITY_DEFS.findIndex((d) => d.id === 'fire-blast'), 0);
    const ar = view.arcade();
    expect(ar?.stunLeft(1)).toBeGreaterThan(0);
    expect(ar?.kbSpeed(1)).toBeGreaterThan(0);
  });

  it('abilitySlugAt names an ability and returns an empty string for the special defs', () => {
    const i = ABILITY_DEFS.findIndex((d) => d.id === 'fire-blast');
    expect(abilitySlugAt(i)).toBe('fire-blast');
    expect(abilitySlugAt(0x100)).toBe('');
    expect(abilitySlugAt(0x103)).toBe('');
    expect(abilitySlugAt(-1)).toBe('');
  });
});


describe('RenderProjectile Fire Blast falloff fields (FUN-DESIGN 2.27)', () => {
  function fly(arcade: boolean, ticks: number): { alphaPm: number | undefined; growPx: number | undefined } {
    const world = arcade ? skipIntro(createMatch(match(true))) : createMatch(match(false));
    const s = world.state;
    s.x[0] = 100; s.y[0] = 400; s.x[1] = 5000; s.y[1] = 100;
    const view = createRenderView(world);
    step(world, [Cmd.primary, 0]);
    for (let i = 0; i < ticks; i++) step(world, [0, 0]);
    let out: { alphaPm: number | undefined; growPx: number | undefined } = { alphaPm: undefined, growPx: undefined };
    view.forEachProjectile((p) => { out = { alphaPm: p.alphaPm, growPx: p.growPx }; });
    return out;
  }
  it('Arcade: full opacity while young, the box growth reported, alpha down to 350 pm at the damage floor', () => {
    expect(fly(true, 0)).toEqual({ alphaPm: 1000, growPx: 0 });
    expect(fly(true, 20)).toEqual({ alphaPm: 1000, growPx: 40 });
    expect(fly(true, 40)).toMatchObject({ growPx: 40 });
    expect(fly(true, 40).alphaPm).toBeLessThan(1000);
    expect(fly(true, 75).alphaPm).toBe(350);
  });
  it('Classic: neutral values', () => {
    expect(fly(false, 30)).toEqual({ alphaPm: 1000, growPx: 0 });
  });
});
