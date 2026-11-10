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
const { up, down, left, right, primary, secondary, dash, guard, super: sup, weather, swap1, swap2, charge } = Cmd;

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

/**
 * WP-arcade-numbers timings: cones in each beat-down, when round 2 and round 3 start their segments (each after the
 * round before ended), and the round 2 guard (held while GUARD_BLASTS come; about 11 blocked blasts break it).
 */
const BEAT_ROUND_1 = 10;
const BEAT_ROUND_3 = 11;
/**
 * Weather power (WP-arcade-weather-charge): the weather needs a full charge, and a Fire Blast adds WEATHER_CHARGE_CAST,
 * so segment C starts CHARGE_SHIFT ticks late and p2 first fires CHARGE_BLASTS blasts away from p1 (east, off the
 * right wall); every later segment moves by the same shift.
 */
const CHARGE_SHIFT = 1300;
const CHARGE_BLASTS = 35;
const ROUND_2 = 3800 + CHARGE_SHIFT;
const ROUND_3 = 8600 + CHARGE_SHIFT;
const GUARD_HOLD = 800;
const GUARD_BLASTS = 14;
/** Cone spacing in a beat-down: past the light hit-stun (32) plus its hit-stop, so each cone is a fresh 1-hit combo. */
const BEAT_EVERY = 40;

/** Both players home at `at`, then p1 fires `n` single cones at p2 on the right wall. Returns the tick after the last. */
function beatDown(p1: Track, p2: Track, at: number, n: number): number {
  const h = home(p1, p2, at, 100);
  p1.until(h);
  for (let i = 0; i < n; i++) p1.tap('beat-down cone', secondary, 1, BEAT_EVERY - 1);
  return p1.tick;
}

function movesScript(): ArcadeScript {
  const setup: MatchSetup = {
    simVersion: SIM_VERSION, seed: 0xa4c0df, flags: ARCADE_FLAGS, chapter: 1, difficulty: 1,
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
  // Charge: p2 fires blasts east from the right wall until its weather charge is full.
  p2.until(720).step('p2 to the right wall', right, 140);
  for (let i = 0; i < CHARGE_BLASTS; i++) p2.tap('charge blast', primary, 1, 30);
  // Segment C: counter hit (p2 calls its weather, and its recovery is when p1's cone lands).
  h = home(p1, p2, 720 + CHARGE_SHIFT, 100);
  p1.until(h + 10).tap('cone', secondary);
  p2.until(h + 57).tap('sun', weather);
  // Segment D: dash with a perfect dodge (p2's fire blast passes through p1's invulnerable dash ticks).
  h = home(p1, p2, 1130 + CHARGE_SHIFT, 100);
  p2.until(h + 10).tap('fire blast', primary);
  p1.until(h + 60).tap('dash up', up | dash);
  // Beat-down (WP-arcade-numbers: Arcade lives are about 4x the hits now): single cones a stun apart, so p2 is low
  // enough for the parry's reflection to KO it.
  h = beatDown(p1, p2, 1700 + CHARGE_SHIFT, BEAT_ROUND_1);
  // Segment E: parry (p1 taps guard as the blast arrives: it is reflected, and the reflection KOs p2, who is low by now).
  h = home(p1, p2, h + 60, 100);
  p2.until(h + 10).tap('fire blast', primary);
  p1.until(h + 55).tap('parry', guard);
  // Round 2: p1 holds guard while p2 shoots: chip damage, then the guard breaks. p2 then wins on time over.
  h = home(p1, p2, ROUND_2, 100);
  p1.until(h).step('hold guard', guard, GUARD_HOLD);
  p2.until(h + 10);
  for (let i = 0; i < GUARD_BLASTS; i++) p2.tap('fire blast', primary, 1, 35);
  // Segment F (WP-arcade-weather-charge: moved here, so round 1 fits the timer): 8-way aim (p1 stands up on the top
  // wall and shoots down-right at p2: a diagonal hit).
  h = home(p1, p2, Math.max(p1.tick, p2.tick) + 60, 138, 0);
  p1.until(h).step('aim down-right', right | down, 1).tap('diagonal cone', secondary);
  // Round 3: p1 carries its meter over, wears p2 down, scores a combo and a cone, then spends a bar on the super that
  // finishes p2.
  h = beatDown(p1, p2, ROUND_3, BEAT_ROUND_3);
  h = home(p1, p2, h + 60, 100);
  p1.until(h).tap('tornado', primary, 1, 6);
  for (let i = 0; i < 3; i++) p1.tap('cone', secondary, 1, 19);
  p1.until(h + 110).tap('cone', secondary);
  // Eye of the Storm's 480 px box needs p2 within 280 px (centre to centre): walk in 250 px first.
  p1.until(h + 120).step('walk in for the vortex', right, 50);
  p1.until(h + 175).tap('super', sup);
  p1.until(h + 520);
  return { file: 'arcade-moves', setup, inputs: buildScript(p1, p2) };
}

/**
 * Weather: the caster's element picks the weather, so one match calls all five by swapping heroes (the weather is ready
 * per character, and each hero casts once). Sun, rain, sandstorm, gale, eclipse.
 */
const WALK_RUN = 66;
/** Ticks to wait after a weather cast before a tag (the cast recovery is 16 ticks) or the next move. */
const WEATHER_RECOVERY = 20;
/** The terrain swap telegraph (TERRAIN_TELEGRAPH_TICKS) plus a margin, then the walk over the rock and the cones at it. */
const TELEGRAPH_WAIT = 40;
const ROCK_WALK = 80;
const ROCK_SHOTS = 3;

function weatherScript(): ArcadeScript {
  const setup: MatchSetup = {
    simVersion: SIM_VERSION, seed: 0x5ea7e6, flags: ARCADE_FLAGS, chapter: 1, difficulty: 1,
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
  // Weather power: fire, earth and void walk the charge up (melee-class heroes gain it by walking; a lap of four runs
  // of WALK_RUN ticks returns to the start spot), and the cast follows once it is full.
  const lap = (p: Track, at: number, out: number, back: number): void => {
    p.until(at);
    for (const dir of [out, back, out, back]) p.step('walk', dir, WALK_RUN);
  };
  lap(p1, 100, right, left);
  p1.tap('sun (fire)', weather).wait(WEATHER_RECOVERY).tap('swap to earth', swap1);
  lap(p1, p1.tick, right, left);
  p1.tap('sandstorm (earth)', weather);
  lap(p1, p1.tick, right, left);
  p1.wait(WEATHER_RECOVERY).tap('swap to void', swap2).wait(30).tap('eclipse (void)', weather);
  lap(p2, 110, left, right);
  p2.tap('rain (water)', weather).wait(WEATHER_RECOVERY);
  lap(p2, p2.tick, left, right);
  p2.tap('swap to air', swap1).tap('gale (air)', weather);
  const e = p1.tick;
  // A hit under the eclipse: the void bolt crosses the arena and lands with the weather's damage factor.
  p1.until(e + 18).step('face east', right, 1);
  p2.until(e + 18).step('face west', left, 1);
  p1.until(e + 24).tap('chaos bolt', primary);
  // Elemental clash (WP-arcade-clash): shots fired on the same row meet in the middle. Void against air cancels (both
  // destroyed); then fire (Fiara's Fireball) beats air (the cone), loses half the cone's damage and flies on to land.
  p1.until(e + 180).tap('chaos bolt', primary);
  p2.until(e + 180).tap('cone', secondary);
  p1.until(e + 280).tap('swap to fire', swap1).until(e + 300).tap('fireball', secondary);
  p2.until(e + 300).tap('cone', secondary);
  p1.until(e + 480);
  // Stage terrain (WP-arcade-terrain): the stage is water from the seed, fire after the sun, air after the gale. Rokcore
  // charges up again and calls the sandstorm: the stage turns to earth after the telegraph (the patches become rocks).
  // Rokcore walks over a rock (`patchEntered`) while Cyclonius' cones, fired along the row, stop at the centre rock.
  p1.tap('swap to earth', swap1);
  lap(p1, p1.tick, right, left);
  p1.tap('sandstorm again', weather).wait(TELEGRAPH_WAIT);
  p1.step('walk over the rock', right, ROCK_WALK).step('walk back', left, ROCK_WALK);
  for (let i = 0; i < ROCK_SHOTS; i++) p2.until(p1.tick - ROCK_WALK * 2 + 10 + i * 25).tap('cone at the rock', secondary);
  p1.until(p1.tick + 60);
  // Charge (WP-arcade-charge): Rokcore (melee) charges east along the row at Cyclonius, who stands on the right.
  p1.step('close in', right, 120).tap('charge', right | charge, 1, 1).wait(60);
  return { file: 'arcade-weather', setup, inputs: buildScript(p1, p2) };
}

/**
 * Tag script timings: Fire Blast spacing in the beat-down (past its cooldown and the heavy hit-stun, so each is a fresh
 * hit), the tag after the Tornado (its entrance Fire Blast lands inside the Tornado's 60-tick stun), the blasts that KO
 * both p2 heroes, and when round 2's segment starts (after round 1's KO and round end).
 */
const BLAST_EVERY = 50;
const TAG_AFTER_TORNADO = 30;
const TAG_BLASTS = 10;
const TAG_ROUND_2 = 1400;

/**
 * Tag team (WP-arcade-tag), 2v2; p1 deals 4x (difficulty 0.25) so the KOs come quickly. Round 1: Cyclonius' Tornado
 * stuns Rokcore, and the tag brings Sindarosa in at Cyclonius' spot with an entrance Fire Blast that lands inside the
 * stun (the tag combo); then blasts KO Rokcore, so Fiara enters (the KO entrance, with her entrance Fire Heal), and more
 * KO her: the round ends only then. Round 2 resets both heroes of each side; Rokcore's pellets hurt Cyclonius, who tags
 * out and recovers red life on the bench.
 */
function tagScript(): ArcadeScript {
  const setup: MatchSetup = {
    simVersion: SIM_VERSION, seed: 0x7a9, flags: ARCADE_FLAGS, chapter: 1, difficulty: 0.25,
    p1: [{ character: characterId('cyclonius'), xp: 1 }, { character: characterId('sindarosa'), xp: 1 }],
    p2: [{ character: characterId('rokcore'), xp: 1 }, { character: characterId('fiara'), xp: 1 }],
  };
  const p1 = new Track();
  const p2 = new Track();
  let h = home(p1, p2, 100, 100);
  p1.until(h).tap('tornado', primary, 1, TAG_AFTER_TORNADO).tap('tag in sindarosa', swap1);
  p1.until(h + 120);
  for (let i = 0; i < TAG_BLASTS; i++) p1.tap('fire blast', primary, 1, BLAST_EVERY - 1);
  h = home(p1, p2, TAG_ROUND_2, 100);
  p2.until(h);
  for (let i = 0; i < 4; i++) p2.tap('rock pellet', secondary, 1, BLAST_EVERY - 1);
  p1.until(p2.tick + 100).tap('tag out', swap1);
  // Sindarosa, tagged in, spends the meter round 1 built on her Hellfire Lance (the 200 px beam).
  p1.until(p2.tick + 200).tap('hellfire lance', sup);
  p1.until(p2.tick + 400);
  return { file: 'arcade-tag', setup, inputs: buildScript(p1, p2) };
}

export function arcadeScripts(): ArcadeScript[] {
  return [movesScript(), weatherScript(), tagScript()];
}
