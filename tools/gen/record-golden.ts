// Regenerates the golden replay fixtures. Run (`pnpm golden:record`) ONLY when a simulation change is intended,
// review the diff of tests/fixtures/replays/, and say why in the commit message.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { collectCommands } from '../../src/core/agents/agent';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS, assertNoTesterFlags } from '../../src/core/flags';
import { serializeReplay } from '../../src/core/replay/format';
import { ReplayRecorder } from '../../src/core/replay/recorder';
import { GOLDEN_SETUP, recordBotMatch } from '../../src/core/replay/record-bots';
import { createMatch, type MatchSetup } from '../../src/core/sim/match';
import { step } from '../../src/core/sim/step';
import { SIM_VERSION } from '../../src/core/version';
import { makeAgent } from '../sim/run-match';

const TICKS = 1500;
const OUT = new URL('../../tests/fixtures/replays/random-vs-random.replay.json', import.meta.url);

/** Second golden: two-hero rosters, chapter 3, another seed and difficulty. */
const SETUP_2V2: MatchSetup = {
  simVersion: SIM_VERSION,
  seed: 0xbeef,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 3,
  difficulty: 2,
  p1: [{ character: characterId('curomo'), xp: 30 }, { character: characterId('fiara'), xp: 10 }],
  p2: [{ character: characterId('pax'), xp: 30 }, { character: characterId('cyclonius'), xp: 10 }],
};
const OUT_2V2 = new URL('../../tests/fixtures/replays/random-2v2-ch3.replay.json', import.meta.url);

/** Arcade golden (FUN-DESIGN WP-arcade-tooling): 1v1, scripted AI on both sides so it contains hits, stun, knockback and combos. */
const SETUP_ARCADE: MatchSetup = {
  simVersion: SIM_VERSION,
  seed: 0xa4cade,
  flags: { ...DEFAULT_SIM_FLAGS, rulesetArcade: true },
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 1 }],
  p2: [{ character: characterId('pax'), xp: 1 }],
};
const OUT_ARCADE = new URL('../../tests/fixtures/replays/arcade-1v1.replay.json', import.meta.url);

function recordScripted(setup: MatchSetup, ticks: number, raceA: string, raceB: string) {
  const world = createMatch(setup);
  const rec = new ReplayRecorder(setup);
  const agents = [makeAgent('scripted', raceA), makeAgent('scripted', raceB)] as const;
  for (let t = 0; t < ticks; t++) {
    const cmds = collectCommands(world, agents);
    rec.record(world, cmds);
    step(world, cmds);
  }
  return rec.finish(world);
}

const { values } = parseArgs({ options: { ruleset: { type: 'string' } } });
if (values.ruleset !== undefined && values.ruleset !== 'classic' && values.ruleset !== 'arcade') {
  throw new Error('--ruleset must be classic or arcade');
}
if (values.ruleset === 'arcade') {
  assertNoTesterFlags(SETUP_ARCADE.flags);
  writeFileSync(OUT_ARCADE, serializeReplay(recordScripted(SETUP_ARCADE, TICKS, 'lavax', 'pax')));
  console.log(`wrote ${OUT_ARCADE.pathname} (${TICKS} ticks)`);
  process.exit(0);
}

assertNoTesterFlags(SETUP_2V2.flags);
assertNoTesterFlags(GOLDEN_SETUP.flags);
writeFileSync(OUT, serializeReplay(recordBotMatch(GOLDEN_SETUP, TICKS)));
console.log(`wrote ${OUT.pathname} (${TICKS} ticks)`);
writeFileSync(OUT_2V2, serializeReplay(recordBotMatch(SETUP_2V2, TICKS)));
console.log(`wrote ${OUT_2V2.pathname} (${TICKS} ticks)`);
