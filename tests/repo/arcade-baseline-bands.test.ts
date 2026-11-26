import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// R8 (SIM_VERSION 118): every released hero stays inside the 35-65% hard limit of the recorded Arcade baselines.
// The target band is 40-60%; the hard limit leaves room for the sampling noise of a 16-seed (1v1) or 8-seed (2v2) record.
const HARD_MIN = 0.35;
const HARD_MAX = 0.65;

function winRates(file: string): Record<string, number> {
  const raw = JSON.parse(readFileSync(new URL(`../fixtures/balance/${file}`, import.meta.url), 'utf8')) as { winRates: Record<string, number> };
  return raw.winRates;
}

describe('Arcade baseline win-rate bands', () => {
  it.each(['arcade-baseline.json', 'arcade-2v2-baseline.json'])('%s: every hero is within 35-65%', (file) => {
    const rates = winRates(file);
    expect(Object.keys(rates).length).toBeGreaterThanOrEqual(24);
    for (const [hero, rate] of Object.entries(rates)) {
      expect(rate, `${file} ${hero}`).toBeGreaterThanOrEqual(HARD_MIN);
      expect(rate, `${file} ${hero}`).toBeLessThanOrEqual(HARD_MAX);
    }
  });
});
