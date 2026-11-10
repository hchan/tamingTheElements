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
      2536824465, 963219135, 1995464551, 2368547438, 817335150, 4273096471, 2137040781, 1842188144, 627939850,
      1402049543, 696661435, 3474688760, 2528416891, 2584590426, 3337250709, 4144617872, 4142397496, 1052982785,
      3693617324, 970330127, 1669052882, 3315666704, 2413813836, 1430403960, 4166857278, 1370915113, 3784459990,
      1649644385, 1359370225, 4174492624,
    ],
    finalHash: 928617089,
  },
  'random-2v2-ch3.replay.json': {
    hashes: [
      4023758948, 1350176732, 3707047122, 1101857539, 2659180432, 2587485185, 2372798770, 238571550, 2680139143,
      2179316036, 1939518305, 667387921, 818398799, 536890271, 2566280184, 461031727, 4127355711, 846155369,
      3254086367, 3932043308, 4018642626, 3338696635, 194090776, 770265163, 3092461095, 2612353052, 740123737,
      3087318088, 936637614, 3713955278,
    ],
    finalHash: 2043337677,
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
