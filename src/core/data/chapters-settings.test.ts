import { describe, expect, it } from 'vitest';
import {
  ARENA_HEIGHT,
  ARENA_WIDTH,
  CAPTURE_HEALTH_FRACTION,
  CHAPTERS,
  CHARACTER_HEIGHT,
  CHARACTER_WIDTH,
  GARRISON_MAX_SIZE,
  SWAP_COOLDOWN_TICKS,
} from './chapters';
import {
  DEFAULT_DIFFICULTY,
  DEFAULT_DISPLAY_SCALE,
  DEFAULT_GARRISON_SORT_ORDER,
  DIFFICULTY,
  DISPLAY_SCALE,
  GARRISON_SORT_ORDER,
} from './settings';
import dataJson from '../../../tests/fixtures/legacy/data.json';
import rulesJson from '../../../tests/fixtures/legacy/rules.json';

type Num = number | { n: number };
const num = (x: Num): number => (typeof x === 'number' ? x : x.n);
const data = dataJson as unknown as {
  garrison: { MAX_SIZE: number; MaxXP: Record<string, number> };
  game: Record<string, Num | string | null | boolean>;
  settings: {
    difficultyEnum: Record<string, Num>;
    displaySettingsEnum: Record<string, Num>;
    garrisonSortOrderEnum: Record<string, number>;
    scalars: Record<string, Num>;
  };
};
const rules = rulesJson as unknown as {
  addXP: Record<string, { maxXP: number | null; histogram: Record<string, number> }>;
};

describe('chapters vs legacy', () => {
  it('matches XP caps and gain ranges', () => {
    for (const c of CHAPTERS) {
      const legacy = rules.addXP[`chapter${String(c.chapter)}`];
      expect(legacy, `chapter${String(c.chapter)}`).toBeDefined();
      expect(c.maxXp).toBe(legacy?.maxXP);
      const gains = Object.keys(legacy?.histogram ?? {}).map(Number);
      expect(c.xpGain.min).toBe(Math.min(...gains));
      expect(c.xpGain.max).toBe(Math.max(...gains));
      if (c.maxXp !== null) expect(c.maxXp).toBe(data.garrison.MaxXP[`chapter${String(c.chapter)}`]);
    }
    expect(GARRISON_MAX_SIZE).toBe(data.garrison.MAX_SIZE);
  });

  it('has the expected objectives', () => {
    expect(CHAPTERS[0]?.objectives).toEqual([{ kind: 'levelAtLeastFirst', level: 5 }]);
    expect(CHAPTERS[1]?.objectives).toContainEqual({ kind: 'countAtLevel', level: 10, count: 3, exact: true });
    expect(CHAPTERS[3]?.objectives).toEqual([{ kind: 'defeatBoss' }]);
  });
});

describe('settings and constants vs legacy', () => {
  it('matches presets', () => {
    for (const [k, v] of Object.entries(data.settings.difficultyEnum)) {
      expect(DIFFICULTY[k as keyof typeof DIFFICULTY]).toBe(num(v));
    }
    for (const [k, v] of Object.entries(data.settings.displaySettingsEnum)) {
      expect(DISPLAY_SCALE[k as keyof typeof DISPLAY_SCALE]).toBe(num(v));
    }
    expect(GARRISON_SORT_ORDER).toEqual(data.settings.garrisonSortOrderEnum);
    expect(Object.keys(DIFFICULTY)).toHaveLength(5);
    expect(Object.keys(DISPLAY_SCALE)).toHaveLength(5);
    expect(DEFAULT_DIFFICULTY).toBe(num(data.settings.scalars.defaultDifficulty as Num));
    expect(DEFAULT_DISPLAY_SCALE).toBe(num(data.settings.scalars.defaultDisplaySettings as Num));
    expect(DEFAULT_GARRISON_SORT_ORDER).toBe(data.settings.scalars.defaultGarrisonSortOrder);
  });

  it('matches combat constants', () => {
    expect(SWAP_COOLDOWN_TICKS).toBe(250);
    expect(SWAP_COOLDOWN_TICKS * 20).toBe(num(data.game.swapCooldown as Num));
    expect(CAPTURE_HEALTH_FRACTION).toBe(num(data.game.capturableHealthPercentage as Num));
    expect(CHARACTER_WIDTH).toBe(data.game.characterDisplayWidth);
    expect(CHARACTER_HEIGHT).toBe(data.game.characterDisplayHeight);
    expect([ARENA_WIDTH, ARENA_HEIGHT]).toEqual([1280, 720]);
  });
});
