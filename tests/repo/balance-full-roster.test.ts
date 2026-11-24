// Report-only full-roster Arcade 1v1 baseline (24 heroes): its shape, and that `--roster full` leaves the other options alone.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ARCADE_FULL_BASELINE_PATH, ARCADE_FULL_PARAMS, ARCADE_PARAMS, type BalanceReport } from '../../tools/sim/balance';
import { parseRoster, rosterRaces } from '../../tools/sim/fun-report';
import { FULL_RACES, RACES, RELEASED_RACES } from '../../tools/sim/run-match';

describe('full-roster Arcade balance baseline', () => {
  const full = JSON.parse(readFileSync(ARCADE_FULL_BASELINE_PATH, 'utf8')) as BalanceReport;

  it('is the Arcade round robin over every non-void hero, with its own parameters', () => {
    expect(full.params).toEqual(ARCADE_FULL_PARAMS);
    expect(Object.keys(full.winRates).sort()).toEqual([...FULL_RACES].sort());
    expect(full.matches).toBe((FULL_RACES.length * (FULL_RACES.length - 1) * ARCADE_FULL_PARAMS.seeds) / 2);
  });

  it('only adds the roster to the released-set Arcade parameters', () => {
    expect({ ...ARCADE_FULL_PARAMS, roster: undefined }).toEqual({ ...ARCADE_PARAMS, roster: undefined });
    expect(ARCADE_PARAMS).not.toHaveProperty('roster');
  });
});

describe('fun report roster option', () => {
  it('defaults to the legacy 12 and maps the names to the run-match rosters', () => {
    expect(rosterRaces(undefined)).toBe(RACES);
    expect(rosterRaces('legacy')).toBe(RACES);
    expect(rosterRaces('released')).toBe(RELEASED_RACES);
    expect(rosterRaces('full')).toBe(FULL_RACES);
    expect(parseRoster(undefined)).toBeUndefined();
    expect(() => parseRoster('all')).toThrow(/--roster/);
  });
});
