// Regenerates the golden replay fixtures. Run (`pnpm golden:record`) ONLY when a simulation change is intended,
// review the diff of tests/fixtures/replays/, and say why in the commit message.
import { writeFileSync } from 'node:fs';
import { serializeReplay } from '../../src/core/replay/format';
import { GOLDEN_SETUP, recordBotMatch } from '../../src/core/replay/record-bots';

const TICKS = 1500;
const OUT = new URL('../../tests/fixtures/replays/random-vs-random.replay.json', import.meta.url);

writeFileSync(OUT, serializeReplay(recordBotMatch(GOLDEN_SETUP, TICKS)));
console.log(`wrote ${OUT.pathname} (${TICKS} ticks)`);
