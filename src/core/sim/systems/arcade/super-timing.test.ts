import { describe, expect, it } from 'vitest';
import { HIT_STOP_TICKS, HitStopCause, HitStrength, METER_BAR, SUPER_FOLLOW_STOP_TICKS } from '../../../data/arcade';
import { RACE_SUPERS } from '../../../data/arcade-supers';
import { characterId } from '../../../data/ids';
import { DEFAULT_SIM_FLAGS } from '../../../flags';
import { Cmd, type Command } from '../../commands';
import { SimEventKind, type SimEvent } from '../../events';
import { createMatch } from '../../match';
import { ARCADE_TEAM_BASE, ArcadeT } from '../../state';
import { step } from '../../step';
import { skipIntro } from './round-testkit';

/**
 * Super timing (qa-r27, SIM_VERSION 58), the in-core twin of tools/sim/super-timing.ts: the caster (id 0, x 400, facing
 * east, one bar) presses super on frame 0 at an idle victim (id 1) standing `gap` px clear of its east edge on the same
 * row. Frames are steps (W.tick, freezes and hit-stops included): what the player sees at 50 Hz.
 */
const RACES = Object.keys(RACE_SUPERS);
const FRAMES = 150;

interface Timing { first: number; pct: number; events: SimEvent[] }

function timing(caster: string, victim: string, gap = 0): Timing {
  const world = skipIntro(createMatch({
    simVersion: 8, seed: 1, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(caster), xp: 1 }],
    p2: [{ character: characterId(victim), xp: 1 }],
  }));
  const s = world.state;
  s.x[0] = 400;
  s.y[1] = s.y[0] ?? 0;
  s.x[1] = 400 + (s.w[0] ?? 0) + gap;
  s.dir[0] = 0;
  s.arcade[ARCADE_TEAM_BASE + ArcadeT.meter] = METER_BAR;
  const hp0 = s.hp[1] ?? 0;
  const events: SimEvent[] = [];
  let first = -1;
  for (let f = 0; f < FRAMES; f++) {
    const cmds: readonly [Command, Command] = [f === 0 ? Cmd.super : 0, 0];
    events.push(...step(world, cmds));
    if (first < 0 && (s.hp[1] ?? 0) < hp0) first = f;
  }
  return { first, pct: (100 * (hp0 - (s.hp[1] ?? 0))) / (s.maxHp[1] ?? 1), events };
}

describe('super timing (qa-r27)', () => {
  it('the opener takes the full super hit-stop, every follow-up SUPER_FOLLOW_STOP_TICKS', () => {
    const { events } = timing('sindarosa', 'pax');
    const hits = events.filter((e) => e.kind === SimEventKind.hitConfirmed);
    const stops = events.filter((e) => e.kind === SimEventKind.hitStop && e['cause'] === HitStopCause.hit).map((e) => e['ticks']);
    expect(hits.length).toBe(5);
    expect(stops).toEqual([HIT_STOP_TICKS[HitStrength.super], ...Array<number>(4).fill(SUPER_FOLLOW_STOP_TICKS)]);
  });

  it('every race\'s super first damages an adjacent foe within 20 frames of the press', () => {
    const late = RACES.flatMap((c) => RACES.map((v) => ({ c, v, first: timing(c, v).first })))
      .filter((r) => r.first < 0 || r.first > 20);
    expect(late).toEqual([]);
  });

  it('every race\'s super, all hits landing on an adjacent foe, removes about 25-35% of its life on average', () => {
    const out = RACES.map((c) => {
      const pcts = RACES.map((v) => timing(c, v).pct);
      return { c, mean: Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) };
    }).filter((r) => r.mean < 23 || r.mean > 37);
    // Floor 23 (was 25) since roster batch 3: the larger victims (Abyssor, Ouroth) shave a point off Zephra's small-wave mean.
    // Hailstorm's icicles add a little to the wave (about 36%), hence the 37 ceiling.
    expect(out).toEqual([]);
  });
});
