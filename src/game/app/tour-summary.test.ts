import type { CharacterId } from '@core/index';
import { describe, expect, it } from 'vitest';
import { advance, gameOver, startRun, useContinue } from './tour-model';
import { runSummary } from './tour-summary';

const label = (id: CharacterId): string => id.toUpperCase();
const base = startRun(['fiara', 'rokcore', 'curomo'] as CharacterId[], 7);

describe('runSummary', () => {
  it('counts a finished tour as all nine stages', () => {
    const won = { ...base, stage: 8, continues: 2, status: 'won' as const };
    const s = runSummary(won, label);
    expect(s.cleared).toBe(9);
    expect(s.continuesUsed).toBe(1);
    expect(s.team).toEqual(['FIARA', 'ROKCORE', 'CUROMO']);
    expect(s.lines[0]).toBe('Stages cleared: 9 of 9.');
    expect(s.lines[1]).toContain('1 of 3');
    expect(s.lines[2]).toBe('Hero team: FIARA, ROKCORE, CUROMO.');
  });

  it('counts a game over by the stage it stopped at', () => {
    let r = advance(advance(base, true), true);
    r = { ...r, continues: 0 };
    r = gameOver(advance(r, false));
    expect(r.status).toBe('over');
    const s = runSummary(r, label);
    expect(s.cleared).toBe(2);
    expect(s.continuesUsed).toBe(3);
    expect(s.lines[1]).toContain('0 continues left');
  });

  it('spends nothing on a fresh run and uses the singular', () => {
    expect(runSummary(base, label).continuesUsed).toBe(0);
    expect(runSummary(useContinue(advance(base, false)), label).lines[1]).toContain('2 continues');
    expect(runSummary({ ...base, continues: 1 }, label).lines[1]).toContain('1 continue left');
  });
});
