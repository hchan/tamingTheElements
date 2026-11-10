import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { decodeFlags, parseReplay, playReplay } from '@core/index';

/**
 * Classic golden hashes pinned by value (docs/FUN-DESIGN.md section 6). Every Arcade sim work package bumps
 * SIM_VERSION, so the Classic goldens get a header-only diff; these pins make sure a Classic hash change cannot hide
 * inside that bump. If a pin fails, Classic changed: fix the code, do not re-pin.
 */
const PINS: Readonly<Record<string, { readonly hashes: readonly number[]; readonly finalHash: number }>> = {
  'random-vs-random.replay.json': {
    hashes: [
      2536824465, 963219135, 2938532372, 3114283993, 226517838, 2326526324, 1872445734, 3581810913, 3488450904,
      4283697376, 4064767020, 3197500201, 1373724826, 3205316057, 16002763, 3283487931, 3595390621, 3638842712,
      2410126640, 2182047461, 621094120, 3896373568, 4075293662, 3337065932, 1675053618, 687212474, 1462133633,
      2637213721, 3275688190, 1248046520,
    ],
    finalHash: 105224259,
  },
  'random-2v2-ch3.replay.json': {
    hashes: [
      4023758948, 1350176732, 1788533320, 4022762435, 2918774863, 2760300658, 604972209, 2296148927, 2268065711,
      2103811744, 309443085, 964726320, 128514228, 879767663, 136229434, 3592824087, 3831092991, 1524622533,
      2287999547, 1845570988, 1495263586, 2043300649, 1756111091, 1326202257, 647487295, 757019149, 1264439331,
      1064297070, 3922676695, 1482237891,
    ],
    finalHash: 3089207784,
  },
};

const DIR = new URL('../fixtures/replays/', import.meta.url);
const classic = readdirSync(DIR)
  .filter((f) => f.endsWith('.replay.json'))
  .map((name) => ({ name, replay: parseReplay(readFileSync(new URL(name, DIR), 'utf8')) }))
  .filter(({ replay }) => !decodeFlags(replay.header.flags).rulesetArcade);

describe('classic hash pins', () => {
  it('pins every Classic golden, and every pin has its golden', () => {
    expect(new Set(classic.map((c) => c.name))).toEqual(new Set(Object.keys(PINS)));
  });

  it.each(classic)('$name keeps its pinned hashes and still re-simulates to them', ({ name, replay }) => {
    const pin = PINS[name];
    expect(replay.hashes).toEqual(pin?.hashes);
    expect(replay.finalHash).toBe(pin?.finalHash);
    expect(playReplay(replay)).toEqual({ ok: true, finalHash: pin?.finalHash });
  });
});
