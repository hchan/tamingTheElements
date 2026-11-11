import { describe, expect, it } from 'vitest';
import { advanceKonami, KONAMI } from './code';
import { benchRowView } from './bench-panel';
import { badgeText } from './badge';
import { onMainMenu } from './install';

const feed = (codes: readonly string[]): number => codes.reduce((p, c) => advanceKonami(p, c), 0);

describe('cheat code', () => {
  it('matches the Konami sequence and nothing shorter', () => {
    expect(feed(KONAMI)).toBe(KONAMI.length);
    expect(feed(KONAMI.slice(0, -1))).toBe(KONAMI.length - 1);
  });
  it('restarts on a wrong key, keeping a leading Up', () => {
    expect(feed(['ArrowUp', 'ArrowUp', 'KeyX'])).toBe(0);
    expect(feed(['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowUp'])).toBe(1);
    expect(feed(['KeyB', ...KONAMI])).toBe(KONAMI.length);
  });
  it('counts only on the main menu route', () => {
    expect([onMainMenu(''), onMainMenu('#main'), onMainMenu('#settings'), onMainMenu('#loading')]).toEqual([true, true, false, false]);
  });
});

describe('bench row view', () => {
  const base = { id: 1, name: 'Lavax', active: false, dead: false, hp: 120, maxHp: 400, restCap: 300 };
  it('shows current/max and the rest ceiling as words and percentages', () => {
    expect(benchRowView(base)).toEqual({
      name: 'Lavax',
      hpPct: 30,
      restPct: 75,
      text: 'Lavax BENCH 120 / 400 (rest cap 300)',
      state: 'bench',
    });
  });
  it('marks the active and dead rows and guards a zero max', () => {
    expect(benchRowView({ ...base, active: true }).state).toBe('active');
    expect(benchRowView({ ...base, dead: true, hp: 0 }).text).toContain('DEAD');
    expect(benchRowView({ ...base, maxHp: 0 }).hpPct).toBe(0);
  });
});

describe('badge', () => {
  it('says whether progress is kept', () => {
    expect(badgeText(false)).toBe('TESTER MODE - progress not saved');
    expect(badgeText(true)).toBe('TESTER MODE - keeping progress');
    expect(badgeText(false, true)).toBe('TESTER MODE - progress not saved - GOD MODE (you take no damage)');
  });
});
