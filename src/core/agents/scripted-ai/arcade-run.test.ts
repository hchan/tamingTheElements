import { describe, expect, it } from 'vitest';
import { Cmd } from '../../sim/commands';
import { arcadePlayfield } from '../../data/arcade';
import type { ArcadeView, FighterView, ObservationView } from '../agent';
import { ArcadeTactics, runCornered } from './arcade';
import { AI_EASY, AI_HARD, AI_NORMAL, RUSHDOWN, ZONER, type ArcadeAiLevel, type Style } from './arcade-ai';

const PF = arcadePlayfield();
const MID_X = PF.x + PF.w / 2;
const MID_Y = PF.y + PF.h / 2;
const MOVE = Cmd.up | Cmd.down | Cmd.left | Cmd.right;
const fighter = (x: number, y: number): FighterView => ({ id: 0, x, y, w: 80, h: 80, hp: 1000, maxHp: 1000, flags: 0, alive: true });
const BASE: ArcadeView = {
  meter: 0, oppMeter: 0, selfStun: 0, oppStun: 0, freeze: 0, combo: 0, oppCombo: 0, superActive: false, superId: 0, prevCmd: 0,
  primaryAge: -1, secondaryAge: -1, phase: 1, shots: [], dashIn: 0, weatherIn: 0, chargeIn: -1, weatherCharge: 1000, tagIn: 0, partnerPm: -1, partner2Pm: -1, rocks: [],
  snagSlot: -1, oppGuarding: false, oppRooted: 0, oppRootImmune: 0, traps: [], trapIn: 99, trapCount: 0, fireShot: false, elemKind: 0, elemIn: -1, cleanseIn: 1, selfRooted: 0, selfSlowed: false, oppSuperActive: false, hazard: undefined,
  runIn: 0, running: false, runAway: true,
};

function view(gap: number, a: Partial<ArcadeView>, at: [number, number], tick = 100): ObservationView {
  return {
    side: 0, tick, self: fighter(at[0], at[1]), opponent: fighter(at[0] + gap, at[1]), cooldowns: [0, 0, 0, 0], matchSeed: 0,
    arcade: { ...BASE, ...a },
  };
}

function decide(level: ArcadeAiLevel, gap: number, a: Partial<ArcadeView> = {}, base = 0, style: Style = ZONER, at: [number, number] = [MID_X, MID_Y]): number {
  return new ArcadeTactics(level, style).apply(view(gap, a, at), base);
}

describe('AI Run (SIM_VERSION 89)', () => {
  it('a ranged hero runs away from a close foe, with no direction on the press', () => {
    const c = decide(AI_NORMAL, 150, {}, Cmd.right);
    expect(c & Cmd.run).toBe(Cmd.run);
    expect(c & MOVE).toBe(0);
  });

  it('does not run from afar, on cooldown, after a Run press, or when Rushdown', () => {
    expect(decide(AI_NORMAL, 400) & Cmd.run).toBe(0);
    expect(decide(AI_NORMAL, 150, { runIn: 30 }) & Cmd.run).toBe(0);
    expect(decide(AI_NORMAL, 150, { prevCmd: Cmd.run }) & Cmd.run).toBe(0);
    expect(decide(AI_NORMAL, 150, {}, 0, RUSHDOWN) & Cmd.run).toBe(0);
  });

  it('does not run when cornered', () => {
    const at: [number, number] = [PF.x + PF.w - 80 - 2, PF.y + 2];
    expect(runCornered(fighter(at[0], at[1]), fighter(at[0] - 100, at[1] + 100), PF)).toBe(true);
    const v: ObservationView = { ...view(0, {}, at), opponent: fighter(at[0] - 100, at[1] + 100) };
    expect(new ArcadeTactics(AI_NORMAL, ZONER).apply(v, 0) & Cmd.run).toBe(0);
  });

  it('Easy never runs', () => {
    expect(decide(AI_EASY, 150) & Cmd.run).toBe(0);
    expect(decide(AI_EASY, 400, { runAway: false, chargeIn: 100 }) & Cmd.run).toBe(0);
  });

  it('a melee hero runs in when Charge is on cooldown and the foe is far', () => {
    const melee = { runAway: false, chargeIn: 100 };
    expect(decide(AI_NORMAL, 400, melee) & Cmd.run).toBe(Cmd.run);
    expect(decide(AI_NORMAL, 400, { ...melee, chargeIn: 0 }) & Cmd.run).toBe(0);
    expect(decide(AI_NORMAL, 100, melee) & Cmd.run).toBe(0);
  });

  it('sends no direction bits while running, and never presses Run again', () => {
    const c = decide(AI_HARD, 150, { running: true, prevCmd: Cmd.run }, Cmd.left | Cmd.primary);
    expect(c & MOVE).toBe(0);
    expect(c & Cmd.run).toBe(0);
  });

  it('breaks a ranged run with a direction press when the foe is far or stunned', () => {
    expect(decide(AI_NORMAL, 600, { running: true }) & MOVE).not.toBe(0);
    expect(decide(AI_NORMAL, 150, { running: true, oppStun: 20 }) & MOVE).not.toBe(0);
  });

  it('breaks a ranged run that has not moved for 10 free ticks', () => {
    const t = new ArcadeTactics(AI_NORMAL, ZONER);
    const moves: boolean[] = [];
    for (let i = 0; i < 14; i++) moves.push((t.apply(view(150, { running: true }, [MID_X, MID_Y], 100 + i), 0) & MOVE) !== 0);
    expect(moves.slice(0, 10).every((m) => !m)).toBe(true);
    expect(moves[10]).toBe(true);
  });
});
