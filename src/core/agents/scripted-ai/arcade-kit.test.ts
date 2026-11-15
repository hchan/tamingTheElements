import { describe, expect, it } from 'vitest';
import { Cmd } from '../../sim/commands';
import { arcadePlayfield } from '../../data/arcade';
import { ALL_ABILITIES } from '../../data/abilities-all';
import type { AbilityDef } from '../../data/types';
import type { ArcadeView, FighterView, ObservationView, ShotView } from '../agent';
import { ArcadeTactics } from './arcade';
import { AI_NORMAL, ZONER, type KitKind } from './arcade-ai';
import { attackAbilityOf, kitKindOf } from './index';

const fighter = (x: number, y: number, hp = 1000): FighterView => ({ id: 0, x, y, w: 80, h: 80, hp, maxHp: 1000, flags: 0, alive: true });
const FREE: ArcadeView = {
  meter: 0, oppMeter: 0, selfStun: 0, oppStun: 0, freeze: 0, combo: 0, oppCombo: 0, superActive: false, superId: 0, prevCmd: 0,
  primaryAge: -1, secondaryAge: -1, phase: 1, shots: [], dashIn: 0, weatherIn: 0, chargeIn: -1, weatherCharge: 1000, tagIn: 0, partnerPm: -1, partner2Pm: -1, rocks: [],
  snagSlot: -1, oppGuarding: false, oppRooted: 0, oppRootImmune: 0, traps: [], trapIn: 0, trapCount: 0, fireShot: false, elemKind: 0, elemIn: -1, cleanseIn: 1, selfRooted: 0, selfSlowed: false, oppSuperActive: false, hazard: undefined,
};
const PF = arcadePlayfield();
const MID_X = PF.x + PF.w / 2;
const MID_Y = PF.y + PF.h / 2;

function press(kit: readonly [KitKind, KitKind], gap: number, opts: { hp?: number; shot?: ShotView; at?: [number, number]; noTrap?: boolean } = {}): number {
  const t = new ArcadeTactics(AI_NORMAL, ZONER, false, kit);
  const [sx, sy] = opts.at ?? [MID_X, MID_Y];
  const v: ObservationView = {
    side: 0, tick: 100, self: fighter(sx, sy, opts.hp ?? 1000), opponent: fighter(sx + gap, sy), cooldowns: [0, 0, 0, 0], matchSeed: 0,
    arcade: { ...FREE, trapIn: opts.noTrap === true ? 99 : 0, shots: opts.shot === undefined ? [] : [opts.shot] },
  };
  return t.apply(v, Cmd.secondary);
}

describe('kit use (SIM_VERSION 81)', () => {
  it('maps the roster abilities to their kit role', () => {
    const kit = (id: string): KitKind => kitKindOf(ALL_ABILITIES.find((d) => d.id === id));
    expect([kit('bell-pulse'), kit('cinder-spray'), kit('skitter'), kit('molten-hide'), kit('mycelium-mend')]).toEqual(['omni', 'omni', 'hop', 'hide', 'heal']);
  });

  it('rings only with the foe inside the ring', () => {
    expect(press(['none', 'omni'], 100) & Cmd.secondary).toBe(Cmd.secondary);
    expect(press(['none', 'omni'], 500) & Cmd.secondary).toBe(0);
  });

  it('heals only below 55% and with no shot on the way', () => {
    expect(press(['none', 'heal'], 500, { hp: 900 }) & Cmd.secondary).toBe(0);
    expect(press(['none', 'heal'], 500, { hp: 400 }) & Cmd.secondary).toBe(Cmd.secondary);
    const shot: ShotView = { x: MID_X + 200, y: MID_Y, w: 20, h: 20, vx: -8, vy: 0 };
    expect(press(['none', 'heal'], 500, { hp: 400, shot }) & Cmd.secondary).toBe(0);
  });

  it('hops (Skitter) from an adjacent foe or a wall, not otherwise', () => {
    expect(press(['none', 'hop'], 100) & Cmd.secondary).toBe(Cmd.secondary);
    expect(press(['none', 'hop'], 500) & Cmd.secondary).toBe(0);
    expect(press(['none', 'hop'], 200, { at: [PF.x + 10, MID_Y], noTrap: true }) & Cmd.secondary).toBe(Cmd.secondary);
  });

  it('armours (Molten Hide) only against a close foe', () => {
    expect(press(['none', 'hide'], 150) & Cmd.secondary).toBe(Cmd.secondary);
    expect(press(['none', 'hide'], 600) & Cmd.secondary).toBe(0);
  });

  it('leaves a hero with no kit role alone', () => {
    expect(press(['none', 'none'], 600)).toBe(Cmd.secondary);
  });

  it('reads a centred melee (Abyss Flash) with the explosion reach', () => {
    const def = ALL_ABILITIES.find((d) => d.id === 'abyss-flash');
    expect(def).toBeDefined();
    expect(attackAbilityOf(def as AbilityDef).reach).toBe('explosion');
  });
});
