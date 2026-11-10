// Regenerates the golden replay fixtures. Run (`pnpm golden:record`) ONLY when a simulation change is intended,
// review the diff of tests/fixtures/replays/, and say why in the commit message.
import { writeFileSync } from 'node:fs';
import { characterId } from '../../src/core/data/ids';
import { DEFAULT_SIM_FLAGS, assertNoTesterFlags } from '../../src/core/flags';
import { serializeReplay } from '../../src/core/replay/format';
import { GOLDEN_SETUP, recordBotMatch } from '../../src/core/replay/record-bots';
import type { MatchSetup } from '../../src/core/sim/match';
import { SIM_VERSION } from '../../src/core/version';

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

assertNoTesterFlags(SETUP_2V2.flags);
assertNoTesterFlags(GOLDEN_SETUP.flags);
writeFileSync(OUT, serializeReplay(recordBotMatch(GOLDEN_SETUP, TICKS)));
console.log(`wrote ${OUT.pathname} (${TICKS} ticks)`);
writeFileSync(OUT_2V2, serializeReplay(recordBotMatch(SETUP_2V2, TICKS)));
console.log(`wrote ${OUT_2V2.pathname} (${TICKS} ticks)`);
