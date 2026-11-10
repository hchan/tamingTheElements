import { describe, expect, it } from 'vitest';
import { getCharacter } from '../data/characters';
import { characterId } from '../data/ids';
import { DEFAULT_SIM_FLAGS } from '../flags';
import type { Command } from '../sim/commands';
import { hash } from '../sim/hash';
import { createMatch, type MatchSetup } from '../sim/match';
import { SnapshotRing } from '../sim/snapshot';
import { countIdx, World } from '../sim/state';
import { hasEnded } from '../sim/systems/end';
import { controlledId } from '../sim/systems/movement';
import { step } from '../sim/step';
import type { SimWorld } from '../sim/world';
import { collectCommands, loadAgents, saveAgents, type Agent, type AgentSnapshot } from './agent';
import { RandomBot } from './random-bot';
import { ScriptedAI, scriptedProfileFor } from './scripted-ai/index';

const SETUP: MatchSetup = {
  simVersion: 1,
  seed: 0x5eed,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('pax'), xp: 20 }],
  p2: [{ character: characterId('sindarosa'), xp: 20 }],
};
/** Scripted pax vs sindarosa ends near tick 1260, so both kinds play through to the end or the cap. */
const END = 1500;
const CUT = 400;

type Pair = readonly [Agent, Agent];

function scripted(world: SimWorld, side: 0 | 1): ScriptedAI {
  const roster = [SETUP.p1, SETUP.p2] as const;
  const self = getCharacter(roster[side][0]?.character ?? characterId('pax'));
  const other = getCharacter(roster[1 - side]?.[0]?.character ?? characterId('pax'));
  return new ScriptedAI(scriptedProfileFor(self, other), {
    activeCount: (slot) => world.state.abil[countIdx(controlledId(world, side), slot)] ?? 0,
  });
}

const KINDS: [string, (world: SimWorld) => Pair][] = [
  ['RandomBot', () => [new RandomBot('r0'), new RandomBot('r1')]],
  ['ScriptedAI', (world) => [scripted(world, 0), scripted(world, 1)]],
];

/** Plays from the world's current tick to END (or the match end) and returns the commands and the final hash. */
function playOut(world: SimWorld, agents: Pair): { cmds: Command[][]; hash: number } {
  const cmds: Command[][] = [];
  for (let t = world.state.world[World.tick] ?? 0; t < END && !hasEnded(world.state); t++) {
    const c = collectCommands(world, agents);
    cmds.push(c);
    step(world, c);
  }
  return { cmds, hash: hash(world.state) };
}

describe('agent memory rewinds with the world (AgentSnapshot next to the SnapshotRing entry)', () => {
  it.each(KINDS)('%s: snapshot at tick N with agent state, restore and continue gives the same hash', (_, make) => {
    const world = createMatch(SETUP);
    const agents = make(world);
    const ring = new SnapshotRing<AgentSnapshot>(world.state, 4);
    for (let t = 0; t < CUT; t++) step(world, collectCommands(world, agents));
    expect(hasEnded(world.state)).toBe(false);
    ring.push(world.state, CUT, saveAgents(agents));
    const first = playOut(world, agents); // H1
    expect(first.cmds.length).toBeGreaterThan(100);

    // Rewind the same instances.
    expect(ring.restoreTick(world.state, CUT, (a) => { if (a) loadAgents(agents, a); })).toBe(true);
    expect(playOut(world, agents)).toEqual(first); // H2 === H1, command for command

    // Fresh instances loaded from a JSON round trip of the snapshot: save() captured everything.
    const fresh = make(world);
    expect(ring.restoreTick(world.state, CUT, (a) => { if (a) loadAgents(fresh, JSON.parse(JSON.stringify(a)) as AgentSnapshot); })).toBe(true);
    expect(playOut(world, fresh)).toEqual(first);
  });

  it.each(KINDS)('%s: without restoring the agent state the continuation differs (the memory matters)', (_, make) => {
    const world = createMatch(SETUP);
    const agents = make(world);
    const ring = new SnapshotRing(world.state, 2);
    for (let t = 0; t < CUT; t++) step(world, collectCommands(world, agents));
    ring.push(world.state, CUT);
    const first = playOut(world, agents);
    ring.restoreTick(world.state, CUT);
    expect(playOut(world, agents).cmds).not.toEqual(first.cmds);
  });

  it('saved state shares nothing with the agent', () => {
    const world = createMatch(SETUP);
    const agents = KINDS[1]?.[1](world) as Pair;
    for (let t = 0; t < CUT; t++) step(world, collectCommands(world, agents));
    const snap = saveAgents(agents);
    const copy = JSON.stringify(snap);
    for (let t = 0; t < 200; t++) step(world, collectCommands(world, agents));
    expect(JSON.stringify(snap)).toBe(copy);
  });
});
