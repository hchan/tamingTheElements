// The scripted Arcade goldens (WP-arcade-move-golden): hand-authored inputs (no AI) that reach every Arcade mechanic, so
// the cross-browser determinism gate and the hash checkpoints cover dash, guard, parry, super, weather and the rounds.
// `tests/repo/arcade-moves-coverage.test.ts` replays the committed files and asserts from the event stream that each
// mechanic still fires; `pnpm golden:record --ruleset arcade` writes them. Tuning notes: a segment starts with `home`,
// which puts both fighters on known spots, so the segments do not depend on each other; the offsets inside a segment
// (cast tick to hit tick, dash press to the blast's arrival) were measured with a trace of the sim, and the coverage
// test fails loudly when a sim change moves them.
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../src/core/flags';
import { ReplayRecorder } from '../../src/core/replay/recorder';
import type { ReplayFile } from '../../src/core/replay/format';
import { createMatch, type MatchSetup } from '../../src/core/sim/match';
import { step } from '../../src/core/sim/step';
import { SIM_VERSION } from '../../src/core/version';
import { buildScript, Cmd, Track } from './arcade-script';

export interface ArcadeScript {
  /** Fixture name under tests/fixtures/replays/ (without `.replay.json`). */
  readonly file: string;
  readonly setup: MatchSetup;
  readonly inputs: readonly [number[], number[]];
}

/** Records a script: steps the match with its inputs and returns the replay with its hash checkpoints. */
export function recordArcadeScript(script: ArcadeScript): ReplayFile {
  const world = createMatch(script.setup);
  const rec = new ReplayRecorder(script.setup);
  const [in0, in1] = script.inputs;
  for (let t = 0; t < in0.length; t++) {
    const cmds = [in0[t] ?? 0, in1[t] ?? 0] as const;
    rec.record(world, cmds);
    step(world, cmds);
  }
  return rec.finish(world);
}

const ARCADE_FLAGS = { ...DEFAULT_SIM_FLAGS, rulesetArcade: true };
const { up, down, left, right, primary, secondary, dash, guard, super: sup, weather, swap1, swap2 } = Cmd;

/**
 * Both players to known spots, so a segment does not depend on what the one before it did: p1 goes to the top wall and
 * back down `rows` ticks (31 is the start row, 0 stays at the top; p2 always returns to the start row), then p1 goes to
 * the left wall and walks `walk` ticks toward p2, while p2 goes to the right wall and turns to face p1. Returns the tick
 * at which both are in place.
 */
function home(p1: Track, p2: Track, at: number, walk: number, rows = 31): number {
  p1.until(at).step('p1 to the top wall', up, 50).step('p1 back down', down, rows);
  p2.until(at).step('p2 to the top wall', up, 50).step('p2 back down', down, 31);
  p1.step('p1 to the left wall', left, 140).step('p1 walks in', right, walk);
  p2.step('p2 to the right wall', right, 140 + walk).step('p2 faces p1', left, 1);
  return Math.max(p1.tick, p2.tick);
}

function movesScript(): ArcadeScript {
  const setup: MatchSetup = {
    simVersion: SIM_VERSION, seed: 0xa4c0de, flags: ARCADE_FLAGS, chapter: 1, difficulty: 1,
    p1: [{ character: characterId('cyclonius'), xp: 5 }],
    p2: [{ character: characterId('sindarosa'), xp: 1 }],
  };
  const p1 = new Track();
  const p2 = new Track();
  // Segment A: a buffered cast (the cone is pressed while the dash recovery still blocks it, and fires when it ends).
  p1.until(100).step('walk', right, 40);
  p1.wait(10).step('dash right', right | dash, 1).wait(12).tap('buffered cone', secondary);
  // Segment B: combo (tornado stun, then three cones inside it: hits 2 to 4 are scaled).
  let h = home(p1, p2, 260, 100);
  p1.until(h).tap('tornado', primary, 1, 6);
  for (let i = 0; i < 3; i++) p1.tap('cone', secondary, 1, 19);
  // Segment C: counter hit (p2 calls its weather, and its recovery is when p1's cone lands).
  h = home(p1, p2, 720, 100);
  p1.until(h + 10).tap('cone', secondary);
  p2.until(h + 57).tap('sun', weather);
  // Segment D: dash with a perfect dodge (p2's fire blast passes through p1's invulnerable dash ticks).
  h = home(p1, p2, 1130, 100);
  p2.until(h + 10).tap('fire blast', primary);
  p1.until(h + 60).tap('dash up', up | dash);
  // Segment F: 8-way aim (p1 stands up on the top wall and shoots down-right at p2: a diagonal hit).
  h = home(p1, p2, 1640, 138, 0);
  p1.until(h).step('aim down-right', right | down, 1).tap('diagonal cone', secondary);
  // Segment E: parry (p1 taps guard as the blast arrives: it is reflected, and the reflection KOs p2, who is low by now).
  h = home(p1, p2, 2250, 100);
  p2.until(h + 10).tap('fire blast', primary);
  p1.until(h + 55).tap('parry', guard);
  // Round 2: p1 holds guard while p2 shoots: chip damage, then the guard breaks. p2 then wins on time over.
  h = home(p1, p2, 3000, 100);
  p1.until(h).step('hold guard', guard, 420);
  p2.until(h + 10);
  for (let i = 0; i < 8; i++) p2.tap('fire blast', primary, 1, 35);
  // Round 3: p1 carries its meter over, scores a combo and a cone, then spends a bar on the super that finishes p2.
  h = home(p1, p2, 7700, 100);
  p1.until(h).tap('tornado', primary, 1, 6);
  for (let i = 0; i < 3; i++) p1.tap('cone', secondary, 1, 19);
  p1.until(h + 110).tap('cone', secondary);
  p1.until(h + 175).tap('super', sup);
  p1.until(8530);
  return { file: 'arcade-moves', setup, inputs: buildScript(p1, p2) };
}

/**
 * Weather: the caster's element picks the weather, so one match calls all five by swapping heroes (the weather is ready
 * per character, and each hero casts once). Sun, rain, sandstorm, gale, eclipse.
 */
function weatherScript(): ArcadeScript {
  const setup: MatchSetup = {
    simVersion: SIM_VERSION, seed: 0x5ea7e5, flags: ARCADE_FLAGS, chapter: 1, difficulty: 1,
    p1: [
      { character: characterId('fiara'), xp: 1 }, // fire
      { character: characterId('rokcore'), xp: 1 }, // earth
      { character: characterId('eternal-void'), xp: 1 }, // void
    ],
    p2: [
      { character: characterId('curomo'), xp: 1 }, // water
      { character: characterId('cyclonius'), xp: 1 }, // air
    ],
  };
  const p1 = new Track();
  const p2 = new Track();
  p1.until(100).tap('sun (fire)', weather);
  p2.until(130).tap('rain (water)', weather);
  p1.until(150).tap('swap to earth', swap1).until(160).tap('sandstorm (earth)', weather);
  p2.until(170).tap('swap to air', swap1).until(180).tap('gale (air)', weather);
  // The swap cooldown is 250 ticks: the second swap of p1 comes after it. From rokcore the teammates are fiara, void.
  p1.until(410).tap('swap to void', swap2).until(420).tap('eclipse (void)', weather);
  // A hit under the eclipse: the void bolt crosses the arena and lands with the weather's damage factor.
  p1.until(440).tap('chaos bolt', primary);
  // Elemental clash (WP-arcade-clash): shots fired on the same row meet in the middle. Void against air cancels (both
  // destroyed); then fire (Fiara's Fireball) beats air (the cone), loses half the cone's damage and flies on to land.
  p1.until(600).tap('chaos bolt', primary);
  p2.until(600).tap('cone', secondary);
  p1.until(700).tap('swap to fire', swap1).until(720).tap('fireball', secondary);
  p2.until(720).tap('cone', secondary);
  p1.until(900);
  return { file: 'arcade-weather', setup, inputs: buildScript(p1, p2) };
}

export function arcadeScripts(): ArcadeScript[] {
  return [movesScript(), weatherScript()];
}
