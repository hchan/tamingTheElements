import { describe, expect, it } from 'vitest';
import golden from '@fixtures/replays/random-vs-random.replay.json';
import {
  DEFAULT_SIM_FLAGS,
  HASH_INTERVAL,
  characterId,
  RandomBot,
  SIM_VERSION,
  collectCommands,
  createMatch,
  hash,
  parseReplay,
  playReplay,
  step,
  type MatchSetup,
  type ReplayFile,
} from '@core/index';
import { ReplayCursor } from './cursor';
import { PlaytestRecorder } from './playtest-recorder';

const GOLDEN_SETUP: MatchSetup = {
  simVersion: SIM_VERSION,
  seed: 0x5eed,
  flags: DEFAULT_SIM_FLAGS,
  chapter: 1,
  difficulty: 1,
  p1: [{ character: characterId('lavax'), xp: 20 }],
  p2: [{ character: characterId('pax'), xp: 20 }],
};

describe('playtest recorder', () => {
  it('records the live world of a human-vs-bot match and the replay verifies', () => {
    const rec = new PlaytestRecorder(GOLDEN_SETUP);
    const live = createMatch(GOLDEN_SETUP);
    const bot = new RandomBot('p2');
    for (let t = 0; t < 130; t++) {
      // The bot is consulted on the live world, as in the arena; that must not make the live world diverge.
      const enemy = collectCommands(live, [undefined, bot])[1];
      const cmds: [number, number] = [t % 40 < 20 ? 8 : 16, enemy];
      rec.record(live, cmds);
      step(live, cmds);
    }
    const file = rec.finish() as ReplayFile;
    expect(file.finalHash).toBe(hash(live.state));
    expect(file.header.tickCount).toBe(130);
    expect(file.header.seed).toBe(GOLDEN_SETUP.seed);
    expect(file.hashes).toHaveLength(Math.ceil(130 / HASH_INTERVAL));
    expect(playReplay(file, SIM_VERSION).ok).toBe(true);
  });

  it('yields nothing when empty or invalidated', () => {
    expect(new PlaytestRecorder(GOLDEN_SETUP).finish()).toBeUndefined();
    const rec = new PlaytestRecorder(GOLDEN_SETUP);
    rec.record(createMatch(GOLDEN_SETUP), [0, 0]);
    rec.invalidate();
    expect(rec.finish()).toBeUndefined();
  });
});

describe('replay cursor', () => {
  const file = parseReplay(JSON.stringify(golden));

  it('plays the golden to ok', () => {
    const c = new ReplayCursor(file);
    while (c.next()) {
      /* run */
    }
    expect(c.state).toBe('ok');
    expect(c.tick).toBe(file.header.tickCount);
  });

  it('stops at the first divergent checkpoint', () => {
    const hashes = file.hashes.slice();
    hashes[3] = (hashes[3] as number) ^ 1;
    const c = new ReplayCursor({ ...file, hashes });
    while (c.next()) {
      /* run */
    }
    expect(c.state).toBe('diverged');
    expect(c.divergence?.tick).toBe(3 * HASH_INTERVAL);
    expect(c.tick).toBe(3 * HASH_INTERVAL);
  });
});
