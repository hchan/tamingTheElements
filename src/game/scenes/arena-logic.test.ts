import { Cmd, DEFAULT_SIM_FLAGS, EntityFlag, METER_BAR, RoundPhase, WEATHER_CHARGE_FULL, characterId, type MatchSetup, type RenderArcade } from '@core/index';
import { describe, expect, it } from 'vitest';
import { actionRefusal, activeHeroOf, buildMatchEnd, chargeBlockedBy, chargeLineFor, demoMatch, effectsHeld, firstBackdropElement, playbackFrame, runLineFor, syncArcadeBg } from './arena-logic';

type Row = { id: number; team: number; flags: number };
const viewOf = (rows: Row[]) => ({ forEachCharacter: (fn: (c: Row) => void) => { rows.forEach(fn); } }) as never;
const alive = EntityFlag.alive;

describe('activeHeroOf', () => {
  it('picks the first living un-benched team-0 hero', () => {
    const v = viewOf([
      { id: 1, team: 1, flags: alive },
      { id: 2, team: 0, flags: alive | EntityFlag.benched },
      { id: 3, team: 0, flags: EntityFlag.dead },
      { id: 4, team: 0, flags: alive | EntityFlag.frozen },
      { id: 5, team: 0, flags: alive },
    ]);
    expect(activeHeroOf(v)).toEqual({ id: 4, flags: alive | EntityFlag.frozen });
  });

  it('returns undefined with no candidate', () => {
    expect(activeHeroOf(viewOf([]))).toBeUndefined();
    expect(activeHeroOf(viewOf([{ id: 1, team: 1, flags: alive }]))).toBeUndefined();
  });
});

describe('chargeBlockedBy', () => {
  const none = { stunned: false, rooted: false, guarding: false };
  it('is undefined when nothing blocks', () => {
    expect(chargeBlockedBy(alive, none)).toBeUndefined();
  });
  it('reports in the order frozen, stunned, rooted, guarding', () => {
    const all = { stunned: true, rooted: true, guarding: true };
    expect(chargeBlockedBy(EntityFlag.frozen, all)).toBe('frozen');
    expect(chargeBlockedBy(alive, all)).toBe('stunned');
    expect(chargeBlockedBy(alive, { ...all, stunned: false })).toBe('rooted');
    expect(chargeBlockedBy(alive, { ...none, guarding: true })).toBe('guarding');
  });
});

const arcadeStub = (o: Partial<Record<string, unknown>> = {}): RenderArcade =>
  ({ phase: RoundPhase.fight, stunned: () => false, rooted: () => false, guarding: () => false, chargeIn: () => 0, ...o }) as unknown as RenderArcade;

describe('chargeLineFor', () => {
  const v = viewOf([{ id: 7, team: 0, flags: alive }]);
  it('says nothing without a living hero', () => {
    expect(chargeLineFor(viewOf([]), arcadeStub())).toBeUndefined();
  });
  it('says nothing when the charge would go through', () => {
    expect(chargeLineFor(v, arcadeStub())).toBeUndefined();
  });
  it('names a block on the active hero', () => {
    expect(chargeLineFor(v, arcadeStub({ stunned: (id: number) => id === 7 }))).toMatch(/stunned/);
    expect(chargeLineFor(v, arcadeStub({ stunned: (id: number) => id === 8 }))).toBeUndefined();
  });
});

describe('actionRefusal', () => {
  const ready = { phase: RoundPhase.fight, frozen: false, meter0: METER_BAR, weatherCharge0: WEATHER_CHARGE_FULL };
  const charge = () => 'C';
  const elemental = () => 'E';

  it('stays quiet outside the fight or in a hit-stop', () => {
    const low = { ...ready, meter0: 0 };
    expect(actionRefusal(Cmd.super, { ...low, phase: RoundPhase.fight + 1 }, charge, elemental)).toBeUndefined();
    expect(actionRefusal(Cmd.super, { ...low, frozen: true }, charge, elemental)).toBeUndefined();
  });

  it('refuses Super and Weather until their bars are full', () => {
    expect(actionRefusal(Cmd.super, { ...ready, meter0: METER_BAR - 1 }, charge, elemental)).toBe('Super not ready');
    expect(actionRefusal(Cmd.super, ready, charge, elemental)).toBeUndefined();
    expect(actionRefusal(Cmd.weather, { ...ready, weatherCharge0: WEATHER_CHARGE_FULL - 1 }, charge, elemental)).toBe('Weather not ready');
    expect(actionRefusal(Cmd.weather, ready, charge, elemental)).toBeUndefined();
  });

  it('delegates Charge and Elemental, and Super outranks Weather outranks Charge outranks Elemental', () => {
    expect(actionRefusal(Cmd.charge, ready, charge, elemental)).toBe('C');
    expect(actionRefusal(Cmd.elemental, ready, charge, elemental)).toBe('E');
    expect(actionRefusal(Cmd.charge | Cmd.elemental, ready, charge, elemental)).toBe('C');
    const low = { ...ready, meter0: 0, weatherCharge0: 0 };
    expect(actionRefusal(Cmd.super | Cmd.weather | Cmd.charge, low, charge, elemental)).toBe('Super not ready');
    expect(actionRefusal(Cmd.weather | Cmd.charge, low, charge, elemental)).toBe('Weather not ready');
  });

  it('reads charge and elemental lazily and returns undefined with no action bit', () => {
    let calls = 0;
    const spy = () => (calls++, undefined);
    expect(actionRefusal(Cmd.up, ready, spy, spy)).toBeUndefined();
    expect(calls).toBe(0);
    expect(actionRefusal(Cmd.charge, ready, spy, spy)).toBeUndefined();
    expect(calls).toBe(1);
  });
});

describe('playbackFrame', () => {
  it('runs one tick per frame at 1x and two at 2x without touching the parity', () => {
    expect(playbackFrame(1, false)).toEqual({ slowFrame: false, ticks: 1 });
    expect(playbackFrame(2, true)).toEqual({ slowFrame: true, ticks: 2 });
  });

  it('runs a tick every other frame at 0.5x', () => {
    let slow = false;
    const ticks: number[] = [];
    for (let i = 0; i < 6; i++) {
      const f = playbackFrame(0.5, slow);
      slow = f.slowFrame;
      ticks.push(f.ticks);
    }
    expect(ticks).toEqual([0, 1, 0, 1, 0, 1]);
  });
});

describe('buildMatchEnd', () => {
  it('prefers the event winner and carries Arcade round wins', () => {
    expect(buildMatchEnd({ winner: 1, won0: 2, won1: 1 }, 0, 1, [3])).toEqual({ winner: 1, activeSlot: 1, capturedIndices: [3], rounds: [2, 1] });
  });
  it('defaults a missing won1 to 0 and omits rounds without won0', () => {
    expect(buildMatchEnd({ winner: 0, won0: 2 }, null, 0, []).rounds).toEqual([2, 0]);
    expect('rounds' in buildMatchEnd({ winner: 0 }, null, 0, [])).toBe(false);
  });
  it('falls back to the online session winner, then -1', () => {
    expect(buildMatchEnd(undefined, 1, 0, []).winner).toBe(1);
    expect(buildMatchEnd(undefined, null, 0, []).winner).toBe(-1);
    expect(buildMatchEnd(undefined, undefined, 0, []).winner).toBe(-1);
    expect(buildMatchEnd({}, 1, 0, []).winner).toBe(-1);
  });
});

describe('demoMatch', () => {
  const base = {
    flags: DEFAULT_SIM_FLAGS,
    p1: [{ character: characterId('curomo'), xp: 0 }, { character: characterId('fiara'), xp: 0 }],
    p2: [{ character: characterId('pax'), xp: 0 }],
  } as unknown as MatchSetup;

  it('returns the base untouched with no hero and no Arcade', () => {
    expect(demoMatch(base, null, false)).toBe(base);
  });
  it('turns on withCrowdControl only when asked (Arcade demos)', () => {
    expect(demoMatch(base, null, true).flags.withCrowdControl).toBe(false);
    expect(demoMatch(base, null, true, null, true).flags).toMatchObject({ rulesetArcade: true, withCrowdControl: true });
  });
  it('swaps only the first hero', () => {
    const m = demoMatch(base, 'pax', false);
    expect(m.p1[0]).toEqual({ character: characterId('pax'), xp: 0 });
    expect(m.p1[1]).toEqual(base.p1[1]);
    expect(m.p2).toBe(base.p2);
  });
  it('swaps the opponent with foe, keeping the rest of its team', () => {
    const m = demoMatch(base, 'pax', false, 'rokcore');
    expect(m.p1[0]).toEqual({ character: characterId('pax'), xp: 0 });
    expect(m.p2[0]).toEqual({ character: characterId('rokcore'), xp: 0 });
    expect(demoMatch(base, null, false, 'rokcore').p1).toBe(base.p1);
  });
  it('turns the Arcade ruleset on', () => {
    expect(demoMatch(base, null, true).flags).toEqual({ ...DEFAULT_SIM_FLAGS, rulesetArcade: true });
    expect(base.flags.rulesetArcade).toBeFalsy();
  });
});

describe('effectsHeld', () => {
  it('holds frame-timed effects only while paused and not ageing', () => {
    expect(effectsHeld(true, false)).toBe(true);
    expect(effectsHeld(true, true)).toBe(false);
    expect(effectsHeld(false, false)).toBe(false);
    expect(effectsHeld(false, true)).toBe(false);
  });
});

describe('runLineFor and the Run press', () => {
  const rows = [{ id: 7, team: 0, flags: alive }];
  const view = (away: boolean | undefined) => ({ ...(viewOf(rows) as object), actionBar: () => (away === undefined ? undefined : { run: { away } }) }) as never;
  const ar = (o: Partial<Record<string, unknown>> = {}) => arcadeStub({ running: () => false, runIn: () => 0, ...o });
  it('says nothing when the run would start, with no hero, or with no run slot', () => {
    expect(runLineFor(view(true), ar())).toBeUndefined();
    expect(runLineFor({ ...(viewOf([]) as object), actionBar: () => ({ run: { away: true } }) } as never, ar())).toBeUndefined();
    expect(runLineFor(view(undefined), ar({ runIn: () => 90 }))).toBeUndefined();
  });
  it('names the run and the whole seconds left, rounded up', () => {
    expect(runLineFor(view(true), ar({ runIn: () => 150 }))).toBe('Run Away in 3 s');
    expect(runLineFor(view(false), ar({ runIn: () => 101 }))).toBe('Run Towards in 3 s');
  });
  it('says rooted first, and stays quiet while running (a second press stops the run)', () => {
    expect(runLineFor(view(true), ar({ rooted: () => true, runIn: () => 150 }))).toBe("Can't run while rooted");
    expect(runLineFor(view(true), ar({ running: () => true, runIn: () => 300 }))).toBeUndefined();
  });
  it('says stunned before rooted or the cooldown (a stunned Run press shows as a notice line, not only the tile note)', () => {
    expect(runLineFor(view(true), ar({ stunned: () => true, runIn: () => 150 }))).toBe("Can't run while stunned");
    expect(runLineFor(view(true), ar({ stunned: () => true, rooted: () => true }))).toBe("Can't run while stunned");
    expect(runLineFor(view(true), ar({ stunned: () => true, running: () => true }))).toBeUndefined();
  });
  it('actionRefusal routes the Run bit to the run line, after the others', () => {
    const ready = { phase: RoundPhase.fight, frozen: false, meter0: METER_BAR, weatherCharge0: WEATHER_CHARGE_FULL };
    const none = () => undefined;
    expect(actionRefusal(Cmd.run, ready, none, none, () => 'R')).toBe('R');
    expect(actionRefusal(Cmd.run, { ...ready, phase: RoundPhase.intro }, none, none, () => 'R')).toBeUndefined();
    expect(actionRefusal(Cmd.run | Cmd.elemental, ready, none, () => 'E', () => 'R')).toBe('E');
  });
});

describe('firstBackdropElement (qa r126: no stale hero floor on the first frame)', () => {
  it('shows the sim stage, not the hero element', () => {
    expect(firstBackdropElement(4, 'fire')).toBe('air');
    expect(firstBackdropElement(1, 'air')).toBe('fire');
    expect(firstBackdropElement(2, 'earth')).toBe('water');
  });
  it('falls back to the hero element with no stage and keeps the Void arena', () => {
    expect(firstBackdropElement(0, 'earth')).toBe('earth');
    expect(firstBackdropElement(3, 'void')).toBe('void');
    expect(firstBackdropElement(0, undefined)).toBeUndefined();
  });
});

describe('syncArcadeBg', () => {
  const mk = () => { const img = { visible: false, texture: { key: 'bg:fire' }, setTexture(k: string) { this.texture.key = k; }, setVisible(v: boolean) { this.visible = v; } }; return img; };
  const tex = { exists: () => true };
  it('stays hidden before the sim stage is set (tick 0), so no stale hero floor shows', () => {
    const img = mk();
    syncArcadeBg(img, 0, 'fire', tex);
    expect(img.visible).toBe(false);
  });
  it('shows the stage backdrop once known', () => {
    const img = mk();
    syncArcadeBg(img, 4, 'fire', tex);
    expect(img).toMatchObject({ visible: true, texture: { key: 'bg:air' } });
  });
  it('stays hidden when the stage texture is missing', () => {
    const img = mk();
    syncArcadeBg(img, 2, 'fire', { exists: () => false });
    expect(img.visible).toBe(false);
  });
});
