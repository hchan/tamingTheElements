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
