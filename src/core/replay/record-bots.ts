import { RandomBot } from '../agents/random-bot';
import { collectCommands } from '../agents/agent';
import { characterId } from '../data/ids';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { createMatch, type MatchSetup } from '../sim/match';
import { step } from '../sim/step';
import type { ReplayFile } from './format';
import { ReplayRecorder } from './recorder';

/** Fixed setup of the golden bot-vs-bot replay in tests/fixtures/replays. */
export const GOLDEN_SETUP: MatchSetup = {
  simVersion: 1,
  seed: 0x5eed,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};

/** Runs two seeded random bots for `ticks` ticks and records the match. */
export function recordBotMatch(setup: MatchSetup, ticks: number): ReplayFile {
  // Bots draw from the world's `ai.pN` streams, which a replay never re-runs. So they play on a
  // shadow world and the recorded world only ever sees the resulting commands.
  const shadow = createMatch(setup);
  const world = createMatch(setup);
  const rec = new ReplayRecorder(setup);
  const bots = [new RandomBot('random0'), new RandomBot('random1')] as const;
  for (let t = 0; t < ticks; t++) {
    const cmds = collectCommands(shadow, bots);
    rec.record(world, cmds);
    step(shadow, cmds);
    step(world, cmds);
  }
  return rec.finish(world);
}
