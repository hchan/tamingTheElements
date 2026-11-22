import { describe, expect, it } from 'vitest';
import { MatchReporter, RESULT_REASON, RESULT_WINNER_NONE, type ReportLink, type ReportSession } from './match-report';

function rig(over: Partial<ReportSession> = {}) {
  const results: unknown[][] = [];
  const desyncs: unknown[][] = [];
  const link: ReportLink = {
    sendHash: () => undefined,
    sendDesync: (...a: unknown[]) => { desyncs.push(a); },
    sendResult: (...a: unknown[]) => { results.push(a); },
  };
  const s: ReportSession = { simTick: 120, forfeitReason: undefined, desync: undefined, checkpoints: () => [], hashAt: () => 77, ...over };
  return { r: new MatchReporter(link, 1, () => 0), s, results, desyncs };
}

describe('MatchReporter end record', () => {
  it('has none before the end', () => {
    expect(rig().r.end).toBeUndefined();
  });

  it('natural end: sim-end, winner kept, result sent', () => {
    const { r, s, results } = rig();
    r.finish(s, 1);
    expect(r.end).toEqual({ reason: 0, detail: 'sim-end', tick: 120, winner: 1, resultSent: true });
    expect(results).toHaveLength(1);
  });

  it('tick limit reached is named', () => {
    const { r, s } = rig();
    r.finish(s, -1, 120);
    expect(r.end).toMatchObject({ reason: 0, detail: 'tick-limit', winner: RESULT_WINNER_NONE });
  });

  it('we conceded / they conceded', () => {
    const a = rig({ forfeitReason: 'conceded' });
    a.r.finish(a.s, 1);
    expect(a.r.end).toMatchObject({ reason: 1, detail: 'conceded' });
    const b = rig({ forfeitReason: 'remote-conceded' });
    b.r.finish(b.s, 0);
    expect(b.r.end).toMatchObject({ reason: 1, detail: 'opponent-conceded' });
  });

  it('timeout is stalled, or relay-closed after noteLink', () => {
    const a = rig({ forfeitReason: 'timeout' });
    a.r.finish(a.s, 0);
    expect(a.r.end).toMatchObject({ reason: RESULT_REASON.timeout, detail: 'stalled' });
    const b = rig({ forfeitReason: 'timeout' });
    b.r.noteLink('relay-closed');
    b.r.finish(b.s, 0);
    expect(b.r.end).toMatchObject({ reason: 2, detail: 'relay-closed' });
  });

  it('opponent left: forfeit, nothing sent', () => {
    const { r, results } = rig();
    r.left(90);
    expect(r.end).toEqual({ reason: 1, detail: 'opponent-left', tick: 90, winner: RESULT_WINNER_NONE, resultSent: false });
    expect(results).toHaveLength(0);
  });

  it('desync records the check name on the first sight and keeps it', () => {
    const { r, s, results } = rig({ desync: { tick: 40, local: 0, remote: 0, check: 'batch-ack' } });
    r.update(s);
    expect(r.end).toEqual({ reason: 3, detail: 'batch-ack', tick: 40, winner: RESULT_WINNER_NONE, resultSent: true });
    r.update({ ...s, desync: { tick: 10, local: 1, remote: 2, check: 'hash' } });
    r.finish(s, 0);
    expect(r.end?.detail).toBe('batch-ack');
    expect(results).toHaveLength(1);
  });

  it('a hash desync without a check field is named hash', () => {
    const { r, s } = rig({ desync: { tick: 50, local: 1, remote: 2 } });
    r.update(s);
    expect(r.end?.detail).toBe('hash');
  });

  it('the first cause is kept: left, then a timeout', () => {
    const { r, s } = rig({ forfeitReason: 'timeout' });
    r.left(5);
    r.finish(s, 0);
    expect(r.end?.detail).toBe('opponent-left');
  });
});

describe('MatchReporter forfeit end (mp-result-timeout)', () => {
  it('a timeout the Arena never ends naturally sends exactly one RESULT, reason timeout, winner from the session', () => {
    const { r, s, results } = rig({ forfeitReason: 'timeout' });
    r.finishForfeit({ ...s, winner: 1 });
    r.finishForfeit({ ...s, winner: 1 });
    expect(results).toEqual([[1, 1, RESULT_REASON.timeout, 0, 0]]);
  });

  it('a concession sends reason forfeit; a later natural finish adds nothing', () => {
    const { r, s, results } = rig({ forfeitReason: 'remote-conceded' });
    r.finishForfeit({ ...s, winner: 0 });
    r.finish(s, 0);
    expect(results).toEqual([[1, 0, RESULT_REASON.forfeit, 0, 0]]);
  });

  it('no winner on the session reports nobody; no forfeit reason sends nothing', () => {
    const a = rig({ forfeitReason: 'timeout' });
    a.r.finishForfeit({ ...a.s, winner: null });
    expect(a.results[0]?.[1]).toBe(RESULT_WINNER_NONE);
    const b = rig();
    b.r.finishForfeit({ ...b.s, winner: 0 });
    expect(b.results).toHaveLength(0);
  });
});
