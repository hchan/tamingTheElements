// Super timing probe (headless, docs/TESTING.md, Commands table): when does each hero's super land, and how much?
//   tsx tools/sim/super-timing.ts [--victim rokcore] [--gaps 0,150,300,500] [--level 1] [--json]
// For every Arcade race as caster: a fresh 1v1 (level `--level`, balance default 1) skips its intro, the caster stands
// at x 400 facing east with a full bar, the victim stands `gap` px further east (edge to edge) on the same row and
// idles; the caster presses super on frame 0. Frames are `W.tick` steps (what the player sees at 50 Hz, freezes and
// hit-stops included). Reports the first damage frame, the damage dealt by frames 20/30/60/90 and the total, as a
// percent of the victim's max life. Read-only: it never touches src/core state outside the match it builds.
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { METER_BAR } from '../../src/core/data/arcade';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { SIM_VERSION } from '../../src/core/index';
import { createMatch } from '../../src/core/sim/match';
import { ARCADE_TEAM_BASE, ArcadeT } from '../../src/core/sim/state';
import { step } from '../../src/core/sim/step';
import { skipIntro } from '../../src/core/sim/systems/arcade/round-testkit';
import { Cmd, type Command } from '../../src/core/sim/commands';
import { RACES, xpForLevel } from './run-match';

export interface SuperTiming {
  readonly caster: string;
  readonly victim: string;
  readonly gap: number;
  /** Frame (W.tick after the press) of the first damage, or -1. */
  readonly first: number;
  /** Percent of the victim's max life removed by frames 20, 30, 60, 90 and in total (300 frames). */
  readonly by20: number;
  readonly by30: number;
  readonly by60: number;
  readonly by90: number;
  readonly total: number;
  readonly hits: number;
}

const FRAMES = 300;
const MARKS = [20, 30, 60, 90] as const;

export function superTiming(caster: string, victim: string, gap: number, level = 1): SuperTiming {
  const xp = xpForLevel(level);
  const world = skipIntro(createMatch({
    simVersion: SIM_VERSION, seed: 1, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId(caster), xp }],
    p2: [{ character: characterId(victim), xp }],
  }));
  const s = world.state;
  s.x[0] = 400;
  s.y[1] = s.y[0] ?? 0;
  s.x[1] = 400 + (s.w[0] ?? 0) + gap;
  s.dir[0] = 0;
  s.arcade[ARCADE_TEAM_BASE + ArcadeT.meter] = METER_BAR;
  const max = s.maxHp[1] ?? 1;
  const hp0 = s.hp[1] ?? 0;
  const at: number[] = [];
  let first = -1;
  let hits = 0;
  let prev = hp0;
  for (let f = 0; f < FRAMES; f++) {
    const cmds: readonly [Command, Command] = [f === 0 ? Cmd.super : 0, 0];
    step(world, cmds);
    const hp = s.hp[1] ?? 0;
    if (hp < prev) {
      hits++;
      if (first < 0) first = f;
    }
    prev = hp;
    at.push(hp);
  }
  const pct = (f: number): number => Math.round((1000 * (hp0 - (at[f] ?? hp0))) / max) / 10;
  return {
    caster, victim, gap, first, hits,
    by20: pct(MARKS[0]), by30: pct(MARKS[1]), by60: pct(MARKS[2]), by90: pct(MARKS[3]), total: pct(FRAMES - 1),
  };
}

function main(): void {
  const { values } = parseArgs({
    options: {
      victim: { type: 'string', default: 'rokcore' },
      gaps: { type: 'string', default: '0,150,300,500' },
      level: { type: 'string', default: '1' },
      json: { type: 'boolean', default: false },
    },
  });
  const gaps = values.gaps.split(',').map(Number);
  const level = Number(values.level);
  // `--victim all`: every race as the victim, averaged per caster and gap (first = the latest first-damage frame).
  const victims = values.victim === 'all' ? RACES : [values.victim];
  const mean = (xs: readonly number[]): number => Math.round((10 * xs.reduce((a, b) => a + b, 0)) / xs.length) / 10;
  const rows: SuperTiming[] = RACES.flatMap((c) => gaps.map((g) => {
    const all = victims.map((v) => superTiming(c, v, g, level));
    if (all.length === 1) return all[0] as SuperTiming;
    return {
      caster: c, victim: 'all', gap: g, first: Math.max(...all.map((r) => r.first)), hits: Math.max(...all.map((r) => r.hits)),
      by20: mean(all.map((r) => r.by20)), by30: mean(all.map((r) => r.by30)), by60: mean(all.map((r) => r.by60)),
      by90: mean(all.map((r) => r.by90)), total: mean(all.map((r) => r.total)),
    };
  }));
  if (values.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  console.log(`victim ${values.victim}, level ${values.level}; frames after the press (50 Hz), percent of max life`);
  console.log('caster      gap  first hits  @20   @30   @60   @90  total');
  for (const r of rows) {
    console.log(
      `${r.caster.padEnd(10)} ${String(r.gap).padStart(4)} ${String(r.first).padStart(6)} ${String(r.hits).padStart(4)}`
        + ` ${[r.by20, r.by30, r.by60, r.by90, r.total].map((v) => v.toFixed(1).padStart(5)).join(' ')}`,
    );
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
