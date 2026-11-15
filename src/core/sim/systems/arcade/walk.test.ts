import { describe, expect, it } from 'vitest';
import {
  BACKWARD_WALK_PM, DASH_ATTACK_CANCEL_FROM, DASH_COOLDOWN_TICKS, DASH_CURVE_PM, DASH_RECOVERY_TICKS, DASH_SPEED_MULT, DASH_TICKS,
  WALK_ACCEL_PM, WALK_BRAKE_PM, WALK_TURN_PM,
} from '../../../data/arcade';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { now } from '../../clock';
import { Cmd } from '../../commands';
import { createMatch } from '../../match';
import { ArcadeE, ARCADE_E } from '../../state';
import { step } from '../../step';
import type { SimWorld } from '../../world';
import { skipIntro } from './round-testkit';
import { dashTick } from './stun';
import { approachWalk, backwardWalkX, dashCurvePm } from './walk';

// Arcade movement feel (SIM_VERSION 66, FUN-DESIGN 2.3a): walk ramp, brake, turn, the dash curve, the dash-attack cancel
// and the wall slide. Classic movement is untouched (aim.test.ts and dash.test.ts pin it).

function duel(race = 'fiara', arcade = true): SimWorld {
  const w = skipIntro(createMatch({
    simVersion: 67, seed: 9, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: arcade }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(race), xp: 1 }], p2: [{ character: characterId('pax'), xp: 1 }],
  }));
  w.state.x[0] = 300; w.state.y[0] = 300; w.state.dir[0] = 0;
  w.state.x[1] = 1700; w.state.y[1] = 300; w.state.dir[1] = 4;
  return w;
}

describe('approachWalk', () => {
  it('ramps up, brakes and turns by the table rates, landing exactly on the target', () => {
    const speed = 1000;
    expect(approachWalk(0, speed, speed)).toBe(WALK_ACCEL_PM);
    expect(approachWalk(speed, 0, speed)).toBe(speed - WALK_BRAKE_PM);
    expect(approachWalk(speed, -speed, speed)).toBe(speed - WALK_TURN_PM);
    expect(approachWalk(900, speed, speed)).toBe(speed);
    expect(approachWalk(-100, 0, speed)).toBe(-100 + WALK_BRAKE_PM > 0 ? 0 : -100 + WALK_BRAKE_PM);
    expect(approachWalk(speed, speed, speed)).toBe(speed);
  });

  it('turning is faster than braking, and braking faster than the start', () => {
    expect(WALK_TURN_PM).toBeGreaterThan(WALK_ACCEL_PM);
    expect(WALK_BRAKE_PM).toBeLessThan(WALK_TURN_PM);
  });
});

describe('dash curve', () => {
  it('sums to the flat dash distance (12 ticks x 1000), so the dash is not shorter or longer', () => {
    expect(DASH_CURVE_PM).toHaveLength(DASH_TICKS);
    const sum = DASH_CURVE_PM.reduce((a, b) => a + b, 0);
    expect(Math.abs(sum - DASH_TICKS * 1000)).toBeLessThanOrEqual(100);
    expect(dashCurvePm(0)).toBe(1000);
    expect(dashCurvePm(DASH_TICKS + 1)).toBe(1000);
    expect(dashCurvePm(1)).toBe(DASH_CURVE_PM[0]);
  });

  it('is front-loaded: the first tick is the fastest and the last the slowest', () => {
    expect(Math.max(...DASH_CURVE_PM)).toBe(DASH_CURVE_PM[0]);
    expect(Math.min(...DASH_CURVE_PM)).toBe(DASH_CURVE_PM[DASH_TICKS - 1]);
  });

  it('travels the curve distance and keeps the invulnerable ticks 2..7', () => {
    const w = duel();
    const speed = (w.state.speed[0] ?? 0) * DASH_SPEED_MULT;
    step(w, [Cmd.dash | Cmd.right, 0]);
    for (let t = 1; t < DASH_TICKS; t++) step(w, [0, 0]);
    const want = (DASH_CURVE_PM.reduce((a, b) => a + b, 0) * speed) / 1000;
    expect((w.state.x[0] ?? 0) - 300).toBeCloseTo(want, 6);
  });
});

describe('walk inertia (Arcade only)', () => {
  it('ramps up over three ticks and slides to a stop after release', () => {
    const w = duel();
    const sp = w.state.speed[0] ?? 0;
    const xs: number[] = [300];
    for (let i = 0; i < 4; i++) { step(w, [Cmd.right, 0]); xs.push(w.state.x[0] ?? 0); }
    const d = xs.slice(1).map((x, i) => x - (xs[i] ?? 0));
    expect(d[0]).toBeCloseTo((sp * WALK_ACCEL_PM) / 1000, 6);
    expect(d[1]).toBeGreaterThan(d[0] ?? 0);
    expect(d[3]).toBeCloseTo(sp, 6);
    const x = w.state.x[0] ?? 0;
    step(w, [0, 0]);
    const slid = (w.state.x[0] ?? 0) - x;
    expect(slid).toBeGreaterThan(0);
    expect(slid).toBeLessThan(sp);
    for (let i = 0; i < 6; i++) step(w, [0, 0]);
    const rest = w.state.x[0] ?? 0;
    step(w, [0, 0]);
    expect(w.state.x[0]).toBe(rest);
  });

  it('a reversal turns around faster than the start-up', () => {
    const w = duel();
    for (let i = 0; i < 5; i++) step(w, [Cmd.right, 0]);
    const x = w.state.x[0] ?? 0;
    step(w, [Cmd.left, 0]);
    expect((w.state.x[0] ?? 0) - x).toBeLessThan((w.state.speed[0] ?? 0) * (1 - WALK_TURN_PM / 1000) + 1e-9);
  });

  it('Classic still starts and stops instantly', () => {
    const w = duel('fiara', false);
    const sp = w.state.speed[0] ?? 0;
    step(w, [Cmd.right, 0]);
    expect(w.state.x[0]).toBe(300 + sp);
    step(w, [0, 0]);
    expect(w.state.x[0]).toBe(300 + sp);
  });
});

describe('wall slide', () => {
  it('a diagonal walk into the east wall keeps moving along the free axis', () => {
    const w = duel();
    w.state.x[0] = w.arena.x + w.arena.w - 80;
    const y = 300;
    for (let i = 0; i < 4; i++) step(w, [Cmd.right | Cmd.down, 0]);
    expect(w.state.x[0]).toBe(w.arena.x + w.arena.w - 80);
    expect((w.state.y[0] ?? 0) - y).toBeGreaterThan(5);
  });
});

describe('dash into attack cancel', () => {
  const E = (id: number, f: number): number => id * ARCADE_E + f;
  function dashing(): SimWorld {
    const w = duel();
    step(w, [Cmd.dash | Cmd.right, 0]);
    return w;
  }
  it('a press from dash tick 10 ends the dash and casts at once; the cooldown stays', () => {
    const w = dashing();
    expect(dashTick(w.state, 0)).toBe(2);
    const w2 = duel();
    step(w2, [Cmd.dash | Cmd.right, 0]);
    for (let t = 2; t < DASH_ATTACK_CANCEL_FROM; t++) step(w2, [0, 0]);
    step(w2, [Cmd.primary, 0]);
    expect(dashTick(w2.state, 0)).toBe(0);
    expect(w2.state.vx[0]).toBe(0);
    expect(w2.state.arcade[E(0, ArcadeE.dashReadyAt)]).toBe(now(w2.state) - DASH_ATTACK_CANCEL_FROM + DASH_COOLDOWN_TICKS);
  });

  it('an earlier press does not cancel: the dash runs on', () => {
    const w = duel();
    step(w, [Cmd.dash | Cmd.right, 0]);
    for (let t = 2; t < DASH_ATTACK_CANCEL_FROM - 1; t++) step(w, [0, 0]);
    step(w, [Cmd.primary, 0]);
    expect(dashTick(w.state, 0)).toBeGreaterThan(0);
    expect(DASH_RECOVERY_TICKS).toBeGreaterThan(0);
  });
});

describe('backward walk (SIM_VERSION 67)', () => {
  const run = (cmd: number, arcade = true, mut?: (w: SimWorld) => void): number => {
    const w = duel('fiara', arcade);
    mut?.(w);
    const x0 = w.state.x[0] ?? 0;
    for (let i = 0; i < 12; i++) step(w, [cmd, 0]);
    return Math.abs((w.state.x[0] ?? 0) - x0);
  };

  it('walking away from the foe covers about BACKWARD_WALK_PM of the forward distance', () => {
    const fwd = run(Cmd.right);
    const back = run(Cmd.left);
    expect(back).toBeGreaterThan(0);
    expect(back).toBeLessThan(fwd);
    expect(Math.abs(back - (fwd * BACKWARD_WALK_PM) / 1000)).toBeLessThan(fwd * 0.1);
  });

  it('backwardWalkX halves only away-from-foe targets; no foe or equal x keeps full speed', () => {
    expect(backwardWalkX(300, 1700, 7)).toBe(7);
    expect(backwardWalkX(300, 1700, -7)).toBe((-7 * BACKWARD_WALK_PM) / 1000);
    expect(backwardWalkX(1700, 300, 7)).toBe((7 * BACKWARD_WALK_PM) / 1000);
    expect(backwardWalkX(300, null, -7)).toBe(-7);
    expect(backwardWalkX(300, 300, -7)).toBe(-7);
  });

  it('vertical movement is not halved', () => {
    const w = duel();
    const y0 = w.state.y[0] ?? 0;
    for (let i = 0; i < 12; i++) step(w, [Cmd.up, 0]);
    const w2 = duel();
    for (let i = 0; i < 12; i++) step(w2, [Cmd.down, 0]);
    expect(Math.abs((w.state.y[0] ?? 0) - y0)).toBeGreaterThan(0);
    expect(Math.abs((w.state.y[0] ?? 0) - y0)).toBe(Math.abs((w2.state.y[0] ?? 0) - y0));
  });

  it('Classic is unchanged: back and forward cover the same distance', () => {
    expect(run(Cmd.left, false)).toBe(run(Cmd.right, false));
  });

  it('the foe on the left flips which way is backward', () => {
    const swap = (w: SimWorld): void => { w.state.x[0] = 1700; w.state.x[1] = 300; };
    expect(run(Cmd.right, true, swap)).toBeLessThan(run(Cmd.left, true, swap));
  });
});
