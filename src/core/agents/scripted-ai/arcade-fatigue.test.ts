import { describe, expect, it } from 'vitest';
import { Cmd } from '../../sim/commands';
import type { ArcadeView, FighterView, ObservationView, ShotView } from '../agent';
import { ArcadeTactics } from './arcade';
import {
  AI_EASY, AI_HARD, AI_NORMAL, ARCADE_AI_FATIGUE_FLOOR_PM, ARCADE_AI_FATIGUE_RESET_TICKS, ARCADE_AI_FATIGUE_WINDOW, NO_PLAN, ZONER,
  fatigueScale, type ArcadeAiLevel,
} from './arcade-ai';

const fighter = (x: number, y: number, hp = 100): FighterView => ({ id: 0, x, y, w: 80, h: 80, hp, maxHp: 1000, flags: 1, alive: true });
const FREE: ArcadeView = {
  meter: 0, oppMeter: 0, selfStun: 0, oppStun: 0, freeze: 0, combo: 0, oppCombo: 0, superActive: false, superId: 0, prevCmd: 0,
  primaryAge: -1, secondaryAge: -1, phase: 1, shots: [], dashIn: 0, weatherIn: 0, chargeIn: -1, weatherCharge: 1000, tagIn: 0, partnerPm: -1, partner2Pm: -1, rocks: [],
  snagSlot: -1, oppGuarding: false, oppRooted: 0, oppRootImmune: 0, traps: [], trapIn: 0, trapCount: 0, fireShot: false, elemKind: 0, elemIn: -1, cleanseIn: 1, selfRooted: 0, selfSlowed: false, oppSuperActive: false, hazard: undefined,
};
const SHOT: ShotView = { x: 279 + 8 * 30, y: 330, w: 20, h: 20, vx: -8, vy: 0 };
const cmd = Cmd.primary | Cmd.left;
const mem = (t: ArcadeTactics): number[] => (t.save() as { mem: number[] }).mem;

function view(tick: number, threat: boolean, selfHp = 100, oppHp = 100, selfStun = 0): ObservationView {
  return {
    side: 0, tick, self: fighter(200, 300, selfHp), opponent: fighter(700, 300, oppHp), cooldowns: [0, 0, 0, 0], matchSeed: 0,
    arcade: { ...FREE, selfStun, shots: threat ? [SHOT] : [] },
  };
}

/** `cycles` threats `gap` ticks apart (a threat tick, then a quiet one), the foe's HP moving so the fight is never stale; returns the fatigue after each. */
function run(t: ArcadeTactics, cycles: number, gap: number, hitEvery = 0, start = 100): number[] {
  const out: number[] = [];
  for (let i = 0; i < cycles; i++) {
    const hit = hitEvery > 0 && i % hitEvery === 0;
    t.apply(view(start + gap * i, true, hit ? 100 - i : 100, 1000 - i, hit ? 5 : 0), cmd);
    out.push(mem(t)[16] ?? 0);
    t.apply(view(start + gap * i + 1, false, hit ? 100 - i : 100, 1000 - i), cmd);
  }
  return out;
}

describe('defence fatigue (SIM_VERSION 80)', () => {
  it('scales the plans down 120 pm per defended threat to the level floor; Easy has none', () => {
    expect([0, 1, 3, 5, 20].map((n) => fatigueScale(AI_HARD, n))).toEqual([1000, 880, 640, 400, 400]);
    expect([0, 3, 20].map((n) => fatigueScale(AI_NORMAL, n))).toEqual([1000, 640, 500]);
    expect([0, 10, 20].map((n) => fatigueScale(AI_EASY, n))).toEqual([1000, 1000, 1000]);
    expect(ARCADE_AI_FATIGUE_FLOOR_PM).toEqual([1000, 500, 400]);
  });

  it('rises with consecutive defended threats on Normal and Hard, never on Easy', () => {
    const hard = run(new ArcadeTactics(AI_HARD, ZONER), 30, 60);
    expect(hard[hard.length - 1]).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < hard.length; i++) expect((hard[i] ?? 0) - (hard[i - 1] ?? 0)).toBeLessThanOrEqual(1);
    const normal = run(new ArcadeTactics(AI_NORMAL, ZONER), 30, 60);
    expect(normal[normal.length - 1]).toBeGreaterThanOrEqual(3);
    expect(Math.max(...run(new ArcadeTactics(AI_EASY, ZONER), 30, 60))).toBe(0);
  });

  it('answers fewer threats under sustained fire than when each one follows a hit', () => {
    const noPlans = (hitEvery: number): number => {
      const t = new ArcadeTactics(AI_HARD, ZONER);
      let n = 0;
      for (let i = 0; i < 300; i++) {
        t.apply(view(100 + 60 * i, true, hitEvery > 0 ? 1000 - i : 100, 1000 - i, hitEvery > 0 ? 5 : 0), cmd);
        if (mem(t)[4] === NO_PLAN) n++;
        t.apply(view(101 + 60 * i, false, hitEvery > 0 ? 1000 - i : 100, 1000 - i), cmd);
      }
      return n;
    };
    expect(noPlans(0)).toBeGreaterThan(noPlans(1) + 20);
  });

  it('rises at most once per window, however fast the shots come', () => {
    const t = new ArcadeTactics(AI_HARD, ZONER);
    const after = run(t, 25, 4); // ticks 100..199: 25 threats
    expect(after[after.length - 1]).toBeLessThanOrEqual(Math.ceil(100 / ARCADE_AI_FATIGUE_WINDOW));
  });

  it('resets on a hit and after ARCADE_AI_FATIGUE_RESET_TICKS without a threat', () => {
    const t = new ArcadeTactics(AI_HARD, ZONER);
    run(t, 12, 60);
    expect(mem(t)[16]).toBeGreaterThan(0);
    const last = 100 + 60 * 11; // the last threat tick
    t.apply(view(last + ARCADE_AI_FATIGUE_RESET_TICKS - 1, false, 100, 500), cmd);
    expect(mem(t)[16]).toBeGreaterThan(0);
    t.apply(view(last + ARCADE_AI_FATIGUE_RESET_TICKS, false, 100, 500), cmd);
    expect(mem(t)[16]).toBe(0);
    run(t, 8, 60, 0, 2000);
    expect(mem(t)[16]).toBeGreaterThan(0);
    t.apply(view(2500, false, 99, 500, 5), cmd); // the hero was hit (hit-stun)
    expect(mem(t)[16]).toBe(0);
  });

  it('Hard: chip and damage over time (HP drops, no hit-stun) keep the count; a real hit resets it', () => {
    const t = new ArcadeTactics(AI_HARD, ZONER);
    run(t, 8, 60, 0, 2000);
    const n = mem(t)[16] ?? 0;
    expect(n).toBeGreaterThan(0);
    t.apply(view(2490, false, 90, 500, 0), cmd);
    t.apply(view(2491, false, 80, 500, 0), cmd);
    expect(mem(t)[16]).toBe(n);
    t.apply(view(2492, false, 70, 500, 3), cmd);
    expect(mem(t)[16]).toBe(0);
  });

  it('Normal: any HP drop still resets it', () => {
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    run(t, 8, 60, 0, 2000);
    expect(mem(t)[16]).toBeGreaterThan(0);
    t.apply(view(2500, false, 99, 500, 0), cmd);
    expect(mem(t)[16]).toBe(0);
  });

  it('round-trips through save and load, and an old 16-slot memory loads as fresh', () => {
    const t = new ArcadeTactics(AI_HARD, ZONER);
    run(t, 10, 60);
    const saved = t.save();
    const u = new ArcadeTactics(AI_HARD, ZONER);
    u.load(saved);
    expect(u.save()).toEqual(saved);
    expect(mem(u)).toHaveLength(24);
    const old = new ArcadeTactics(AI_HARD, ZONER);
    old.load({ mem: [-1, 0, -1, 0, NO_PLAN, 0, ZONER, 0, 0, 0, 0, -1000, 0, -1, 0, 0], rng: null });
    expect(mem(old).slice(16)).toEqual([0, 0, 0, 0, 0, 0, 0, -1000]);
    expect(old.apply(view(5, true), cmd)).toBeDefined();
  });

  it('keeps the guard reflex off once three threats in a row were defended', () => {
    const lvl: ArcadeAiLevel = AI_HARD;
    let armedLate = 0;
    const t = new ArcadeTactics(lvl, ZONER);
    run(t, 6, 60);
    for (let i = 0; i < 100; i++) {
      t.apply(view(1000 + 60 * i, true, 100, 1000 - i), cmd);
      if ((mem(t)[16] ?? 0) >= 3 && mem(t)[12] === 1) armedLate++;
      t.apply(view(1001 + 60 * i, false, 100, 1000 - i), cmd);
    }
    expect(armedLate).toBe(0);
  });
});
