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
      3607339281, 1718059215, 3824582679, 2800899086, 2019129390, 659769687, 1686457565, 3572881360, 3893699690,
      744803687, 3845847851, 2462819864, 24511771, 2934856650, 2302225077, 787788592, 1143487288, 1266858721,
      2309397100, 4258745039, 533488882, 653745824, 2566552828, 1928621816, 647018302, 2844474169, 2997679990,
      3037856161, 3896496721, 1105887152,
    ],
    finalHash: 1796239905,
  },
  'random-2v2-ch3.replay.json': {
    hashes: [
      3069257188, 2267877212, 1766221170, 1584495187, 2643362400, 100935025, 1987273090, 638140846, 3422890839,
      519045140, 3514030641, 2822110433, 3467836607, 2175402063, 3652497096, 912992703, 2821059663, 900506169,
      2916811087, 1642583100, 2662112930, 3364554955, 281118312, 792726747, 58680151, 4021447500, 226392073,
      4209544984, 538945742, 946281086,
    ],
    finalHash: 1513589949,
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
