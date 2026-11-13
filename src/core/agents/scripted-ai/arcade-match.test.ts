import { describe, expect, it } from 'vitest';
import { METER_MAX, SUPER_COST, TRAP_TEAM_MAX } from '../../data/arcade';
import { characterId } from '../../data/ids';
import { getCharacter } from '../../data/characters';
import { DEFAULT_SIM_FLAGS } from '../../flags';
import { Cmd, inputMaskFor, type Command } from '../../sim/commands';
import { hash } from '../../sim/hash';
import { createMatch, type MatchSetup } from '../../sim/match';
import { step } from '../../sim/step';
import { createObservationView, type AgentState } from '../agent';
import { AI_EASY, AI_HARD, AI_NORMAL, RUSHDOWN, TURTLE, ZONER, type ArcadeAiLevel, type Style } from './arcade-ai';
import { ScriptedAI, scriptedProfileFor } from './index';

/**
 * Whole-match properties of the Arcade AI (the layer is otherwise tested by unit helpers and by goldens): the same seed
 * gives the same command stream, a saved agent resumes it, and no command asks for something the observation says is refused.
 */

const TICKS = 2500;

function setup(seed: number): MatchSetup {
  return {
    simVersion: 1, seed, flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true }, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('sindarosa'), xp: 1 }, { character: characterId('curomo'), xp: 1 }],
    p2: [{ character: characterId('lavax'), xp: 1 }, { character: characterId('cyclonius'), xp: 1 }],
  };
}

function agents(level: ArcadeAiLevel, styles: readonly [Style, Style]): [ScriptedAI, ScriptedAI] {
  const make = (me: string, opp: string, id: string, personality: Style): ScriptedAI =>
    new ScriptedAI(scriptedProfileFor(getCharacter(characterId(me)), getCharacter(characterId(opp))), { id, level, personality });
  return [make('sindarosa', 'lavax', 'a', styles[0]), make('lavax', 'sindarosa', 'b', styles[1])];
}

interface Run {
  readonly cmds: Command[];
  readonly illegal: string[];
  readonly hash: number;
}

/** Runs a match of two scripted AIs, checking every command against the view it was decided from. */
function play(seed: number, level: ArcadeAiLevel, styles: readonly [Style, Style], ticks = TICKS): Run {
  const world = createMatch(setup(seed));
  const ais = agents(level, styles);
  const mask = inputMaskFor(setup(seed).flags);
  const cmds: Command[] = [];
  const illegal: string[] = [];
  for (let i = 0; i < ticks; i++) {
    const views = [createObservationView(world, 0), createObservationView(world, 1)] as const;
    const out = [ais[0].observe(views[0]), ais[1].observe(views[1])] as const;
    out.forEach((c, side) => {
      const a = views[side]?.arcade;
      const bad = (why: string): void => {
        illegal.push(`tick ${String(i)} side ${String(side)}: ${why}`);
      };
      if ((c & ~mask) !== 0) bad('bits outside the input mask');
      if ((c & Cmd.up) !== 0 && (c & Cmd.down) !== 0) bad('up and down');
      if ((c & Cmd.left) !== 0 && (c & Cmd.right) !== 0) bad('left and right');
      if (a === undefined) {
        bad('no arcade view');
        return;
      }
      if ((c & Cmd.dash) !== 0 && a.dashIn !== 0) bad('dash on cooldown');
      if ((c & Cmd.weather) !== 0 && a.weatherIn !== 0) bad('weather on cooldown');
      if ((c & Cmd.trap) !== 0 && (a.trapIn !== 0 || a.trapCount >= TRAP_TEAM_MAX)) bad('trap on cooldown or at the team cap');
      if ((c & Cmd.elemental) !== 0 && a.elemIn !== 0) bad('elemental not ready');
      if ((c & Cmd.super) !== 0 && (a.meter < SUPER_COST || a.meter > METER_MAX)) bad('super without a bar');
      if ((c & (Cmd.swap1 | Cmd.swap2)) !== 0 && a.tagIn !== 0) bad('tag on cooldown');
      if ((c & Cmd.swap1) !== 0 && a.partnerPm < 0) bad('tag with no partner');
      if ((c & Cmd.swap2) !== 0 && a.partner2Pm < 0) bad('tag 2 with no second bench hero');
      if ((c & Cmd.swap3) !== 0) bad('swap3 is not an Arcade command');
    });
    cmds.push(out[0], out[1]);
    step(world, [out[0], out[1]]);
  }
  return { cmds, illegal, hash: hash(world.state) };
}

const COMBOS: readonly [ArcadeAiLevel, readonly [Style, Style]][] = [
  [AI_EASY, [RUSHDOWN, TURTLE]],
  [AI_NORMAL, [ZONER, RUSHDOWN]],
  [AI_HARD, [TURTLE, ZONER]],
  [AI_HARD, [RUSHDOWN, RUSHDOWN]],
];

describe('the scripted Arcade AI over whole matches', () => {
  it.each(COMBOS)('level %i %j: the same seed gives the same commands and the same final world', (level, styles) => {
    const a = play(5, level, styles);
    const b = play(5, level, styles);
    expect(b.cmds).toEqual(a.cmds);
    expect(b.hash).toBe(a.hash);
    // Not a constant stream: the AI does things, and another seed plays differently.
    expect(new Set(a.cmds).size).toBeGreaterThan(5);
    expect(play(6, level, styles).hash).not.toBe(a.hash);
  });

  it.each(COMBOS)('level %i %j: no command is one the observation says the sim refuses', (level, styles) => {
    for (const seed of [1, 2, 3]) expect(play(seed, level, styles).illegal).toEqual([]);
  });

  it('uses every Arcade button over a match (so the legality checks above are not vacuous)', () => {
    const { cmds } = play(5, AI_HARD, [RUSHDOWN, TURTLE], 4000);
    const seen = (bit: number): boolean => cmds.some((c) => (c & bit) !== 0);
    expect(seen(Cmd.guard)).toBe(true);
    expect(seen(Cmd.dash)).toBe(true);
    expect(seen(Cmd.primary) || seen(Cmd.secondary)).toBe(true);
    for (const bit of [Cmd.trap, Cmd.super, Cmd.weather, Cmd.swap1, Cmd.elemental, Cmd.charge]) expect(seen(bit)).toBe(true);
  });

  it('a mid-match save, fresh agents and load resume the identical command stream', () => {
    const cfg = [AI_HARD, [ZONER, RUSHDOWN]] as const;
    const worldA = createMatch(setup(9));
    const live = agents(cfg[0], cfg[1]);
    const decide = (world: typeof worldA, ais: readonly ScriptedAI[]): [Command, Command] => [
      ais[0]?.observe(createObservationView(world, 0)) ?? 0,
      ais[1]?.observe(createObservationView(world, 1)) ?? 0,
    ];
    const log: [Command, Command][] = [];
    for (let i = 0; i < 700; i++) {
      const cmds = decide(worldA, live);
      log.push(cmds);
      step(worldA, cmds);
    }
    const saved = JSON.parse(JSON.stringify(live.map((ai) => ai.save()))) as AgentState[];
    // A second world replays the logged commands to the same point; the loaded copies then take over there.
    const worldB = createMatch(setup(9));
    for (const cmds of log) step(worldB, cmds);
    expect(hash(worldB.state)).toBe(hash(worldA.state));
    const copy = agents(cfg[0], cfg[1]);
    copy.forEach((ai, i) => {
      ai.load(saved[i] ?? null);
    });
    for (let i = 0; i < 400; i++) {
      const fromLive = decide(worldA, live);
      const fromCopy = decide(worldB, copy);
      expect(fromCopy).toEqual(fromLive);
      step(worldA, fromLive);
      step(worldB, fromCopy);
    }
  });
});
