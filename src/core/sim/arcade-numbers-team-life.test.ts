import { describe, expect, it } from 'vitest';
import { ARCADE_2V2_LIFE_PM, ARCADE_RACE_NUMBERS, arcadeLifePm } from './arcade-numbers';

/** Pinned team life (2v2 before the x1.3 scale = 3v3 life, then the 2v2 value) of all 24 heroes, as of SIM_VERSION 119. */
const TEAM_LIFE: Record<string, readonly [team3: number, team2: number]> = {
  curomo: [4568, 5938],
  cyclonius: [4763, 6191],
  echo: [5077, 6600],
  fiara: [2706, 3517],
  ishimi: [4131, 5370],
  lavax: [3039, 3950],
  morblass: [3031, 3940],
  pax: [2937, 3818],
  rokcore: [1442, 1874],
  sindarosa: [2269, 2949],
  treenoc: [4793, 6230],
  wispera: [4632, 6021],
  kindrel: [5143, 6685],
  nykra: [3443, 4475],
  quarrak: [2372, 3083],
  hyalia: [4495, 5843],
  brazgor: [2240, 2912],
  glimmaw: [4320, 5616],
  durrok: [3081, 4005],
  zephra: [5599, 7278],
  ouroth: [3670, 4771],
  abyssor: [2767, 3597],
  vortigal: [3971, 5162],
  umbrel: [5475, 7117],
};

/** 1v1 life `hpPm` of all 24 heroes as of SIM_VERSION 120 (17 rows changed from v119; the rest are unchanged). */
const HP_PM_V120: Record<string, number> = {
  curomo: 6233, cyclonius: 4896, echo: 8269, fiara: 4235, ishimi: 5668, lavax: 3680, morblass: 3313, pax: 5380,
  rokcore: 1787, sindarosa: 2708, treenoc: 6083, wispera: 8028, kindrel: 7487, nykra: 6250, quarrak: 3796,
  hyalia: 6969, brazgor: 5942, glimmaw: 7200, durrok: 5532, zephra: 6100, ouroth: 7312, abyssor: 5707,
  vortigal: 6598, umbrel: 8296,
};

describe('arcade 1v1 life (SIM_VERSION 120)', () => {
  for (const [slug, hp] of Object.entries(HP_PM_V120)) {
    it(`${slug}: hpPm ${String(hp)}`, () => {
      expect((ARCADE_RACE_NUMBERS[slug] ?? [0])[0]).toBe(hp);
      expect(arcadeLifePm(hp, 1, slug)).toBe(hp);
    });
  }
});

describe('arcade team life (bit-identical across 1v1 life retunes)', () => {
  it('pins all 24 heroes', () => {
    expect(Object.keys(TEAM_LIFE)).toHaveLength(24);
  });
  for (const [slug, [team3, team2]] of Object.entries(TEAM_LIFE)) {
    it(`${slug}: 3v3 life ${String(team3)}, 2v2 life ${String(team2)}`, () => {
      const hp = (ARCADE_RACE_NUMBERS[slug] ?? [0])[0];
      expect(arcadeLifePm(hp, 3, slug)).toBe(team3);
      expect(arcadeLifePm(hp, 2, slug)).toBe(team2);
      expect(ARCADE_2V2_LIFE_PM[slug] ?? 600).toBeGreaterThan(0);
    });
  }
});
