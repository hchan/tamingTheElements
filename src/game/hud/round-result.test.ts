import { describe, expect, it } from 'vitest';
import { SnagEvent, SimEventKind, TrapReason, type SimEvent } from '@core/index';
import { ResultTally, emptyTally, healthPct, resultCard, toneOf, type ResultInput } from './round-result';

const ev = (kind: SimEvent['kind'], extra: Record<string, number> = {}, tick = 10): SimEvent => ({ ...extra, tick, sourceId: 0, kind, seq: 0 });
/** Entities 0 and 1 are team 0 (you), 2 and 3 team 1. */
const teamOf = (id: number): number => (id < 0 ? -1 : id < 2 ? 0 : 1);

describe('ResultTally', () => {
  it('counts damage, hits, longest combo, snags, traps and supers per side, and resets the round at a round start', () => {
    const t = new ResultTally();
    const feed = (...es: SimEvent[]): void => { es.forEach((e) => { t.consume(e, teamOf); }); };
    feed(
      ev(SimEventKind.roundStarted, { round: 1 }),
      ev(SimEventKind.hitConfirmed, { target: 2, attacker: 0, amount: 30, combo: 1 }),
      ev(SimEventKind.hitConfirmed, { target: 2, attacker: 0, amount: 20, combo: 2 }),
      ev(SimEventKind.hitConfirmed, { target: 0, attacker: 2, amount: 15, combo: 1 }),
      ev(SimEventKind.snag, { id: 2, reason: SnagEvent.rooted }),
      ev(SimEventKind.snag, { id: 2, reason: SnagEvent.expired }),
      ev(SimEventKind.snag, { id: 0, reason: SnagEvent.rooted }),
      ev(SimEventKind.trapTriggered, { team: 0, reason: TrapReason.overlap }),
      ev(SimEventKind.trapTriggered, { team: 0, reason: TrapReason.timeout }),
      ev(SimEventKind.trapTriggered, { team: 1, reason: TrapReason.overlap }),
      ev(SimEventKind.superStarted, { caster: 1 }),
      ev(SimEventKind.superStarted, { caster: 3 }),
      ev(SimEventKind.ko, { team: 1, perfect: 0 }),
    );
    expect(t.round).toEqual({ dealt: 50, taken: 15, hits: 2, combo: 2, snags: 1, traps: 1, supers: 1 });
    expect(t.how).toBe('ko');
    feed(ev(SimEventKind.roundStarted, { round: 2 }), ev(SimEventKind.hitConfirmed, { target: 3, attacker: 1, amount: 5, combo: 1 }));
    expect(t.round).toEqual({ ...emptyTally(), dealt: 5, hits: 1, combo: 1 });
    expect(t.match).toMatchObject({ dealt: 55, taken: 15, hits: 3, combo: 2 });
    expect(t.how).toBe('');
  });

  it('reads how a round ended: knockout, perfect, double knockout, time', () => {
    const t = new ResultTally();
    t.consume(ev(SimEventKind.ko, { team: 1, perfect: 1 }), teamOf);
    expect([t.how, t.perfect]).toEqual(['ko', true]);
    t.consume(ev(SimEventKind.roundStarted), teamOf);
    t.consume(ev(SimEventKind.ko, { team: -1, perfect: 0 }), teamOf);
    expect(t.how).toBe('double');
    t.consume(ev(SimEventKind.roundStarted), teamOf);
    t.consume(ev(SimEventKind.timeOver), teamOf);
    expect([t.how, t.perfect]).toEqual(['time', false]);
  });
});

describe('healthPct', () => {
  it('is the roster hp over the roster max, whole percent, never negative', () => {
    expect(healthPct([{ hp: 50, maxHp: 100 }, { hp: 0, maxHp: 100 }, { hp: -5, maxHp: 100 }])).toBe(17);
    expect(healthPct([])).toBe(0);
  });
});

describe('resultCard', () => {
  const base: ResultInput = {
    round: 2, winner: 0, won: [1, 1], how: 'ko', perfect: false, healthPct: 62,
    tally: { dealt: 140.4, taken: 38, hits: 6, combo: 4, snags: 0, traps: 0, supers: 0 },
  };

  it('maps the winner to a tone and title', () => {
    expect([0, 1, -1].map(toneOf)).toEqual(['win', 'lose', 'draw']);
    expect([0, 1, -1].map((winner) => resultCard({ ...base, winner }).title)).toEqual(['ROUND 2 WON', 'ROUND 2 LOST', 'ROUND 2 DRAW']);
    expect([0, 1, -1].map((winner) => resultCard({ ...base, round: 0, winner }).title)).toEqual(['YOU WIN', 'YOU LOSE', 'DRAW']);
  });

  it('shows the round, how it ended with the score, and the stat lines', () => {
    const c = resultCard(base);
    expect(c).toMatchObject({ tone: 'win', kicker: 'ROUNDS 1 - 1', title: 'ROUND 2 WON', headline: 'K.O.' });
    expect(c.lines).toEqual(['HEALTH LEFT 62%', 'DAMAGE 140 DEALT  /  38 TAKEN', 'LONGEST COMBO 4  /  6 HITS']);
    expect(c.detail).toBe('Knockout. Health left 62 percent. Dealt 140 damage, took 38. Longest combo 4.');
  });

  it('adds snags, traps and supers only when there were some', () => {
    const c = resultCard({ ...base, tally: { ...base.tally, snags: 1, traps: 2, supers: 1 }, how: 'time' });
    expect(c.lines[3]).toBe('SNAGS 1  /  TRAPS 2  /  SUPERS 1');
    expect(c.headline).toBe('TIME OVER');
    expect(c.detail).toContain('1 snag. 2 traps sprung. 1 super.');
  });

  it('says perfect, double knockout and the match card', () => {
    expect(resultCard({ ...base, perfect: true }).headline).toBe('PERFECT K.O.');
    const lost = resultCard({ ...base, perfect: true, winner: 1 });
    expect(lost.headline).toBe('K.O.');
    expect(lost.detail).not.toMatch(/perfect/i);
    expect(resultCard({ ...base, how: 'double', winner: -1 }).headline).toBe('DOUBLE K.O.');
    const m = resultCard({ ...base, round: 0, won: [2, 1] });
    expect(m).toMatchObject({ kicker: 'MATCH', title: 'YOU WIN', headline: 'FINAL ROUNDS 2 - 1' });
  });

  it('never uses the words players must not see', () => {
    const all = JSON.stringify([0, 1, -1].map((winner) => [resultCard({ ...base, winner }), resultCard({ ...base, winner, round: 0 })]));
    expect(all).not.toMatch(/classic|arcade|ruleset|capture/i);
  });
});
