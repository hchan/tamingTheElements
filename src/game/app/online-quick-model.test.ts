import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_RESTING_SEC, type OnlineFailure } from '../net/ws/online-client';
import {
  BUSY_TEXT, CHECKING_TEXT, CONNECTING_TEXT, controlsFor, checkMatch, endText, failureView, GENERIC_TEXT, IDLE_TEXT, MATCHED_TEXT,
  netStatusText, OPPONENT_AWAY_TEXT, OPPONENT_LEFT_TEXT, reconnectText, REST_KEY, resetRestMemory, restStore, rejectText, UPDATE_TEXT,
  WAITING_PICK_TEXT, waitText, GATEWAY_NOTICE_TEXT, type QuickState,
} from './online-quick-model';

const FORBIDDEN = /\b(classic|arcade|ruleset|capture|room|friend)\b/i;
const STATES: readonly QuickState[] = ['idle', 'connecting', 'queued', 'matched', 'waiting-pick', 'checking', 'playing', 'ended', 'resting', 'update', 'busy', 'failed', 'unavailable'];

const match = (o: Partial<{ slot: number; inputDelay: number; batchEvery: number; simVersion: number }> = {}) => ({
  t: 'match' as const, matchId: 1, slot: 0, seed: 5, inputDelay: 2, simVersion: 86, batchEvery: 1, resumed: false, ...o,
});

describe('online quick match model', () => {
  it('shows some control in every state and Back never during a match', () => {
    for (const s of STATES) expect(controlsFor(s).length).toBeGreaterThan(0);
    expect(controlsFor('playing')).not.toContain('quickBack');
    expect(controlsFor('resting')).toEqual(['quickBack']);
    expect(controlsFor('update')).not.toContain('quickRetry');
    expect(controlsFor('unavailable')).toEqual(['quickBack']);
  });

  it('formats the wait as m:ss', () => {
    expect(waitText(0)).toBe('Looking for an opponent... 0:00');
    expect(waitText(12)).toBe('Looking for an opponent... 0:12');
    expect(waitText(125)).toBe('Looking for an opponent... 2:05');
  });

  it('maps failures to a state and words', () => {
    const server = (code: number): OnlineFailure => ({ kind: 'server', code, retryAfterSec: 0, status: 0 });
    expect(failureView({ kind: 'update-needed' }).state).toBe('update');
    expect(failureView(server(10)).state).toBe('update');
    expect(failureView(server(5))).toEqual({ state: 'busy', text: BUSY_TEXT });
    expect(failureView(server(8)).state).toBe('busy');
    expect(failureView(server(6))).toEqual({ state: 'failed', text: GENERIC_TEXT });
    expect(failureView(server(7)).text).toBe(GENERIC_TEXT);
    expect(failureView({ kind: 'resting', retryAfterSec: 0 }).text).toContain('about 1 h');
    expect(failureView({ kind: 'network' }).state).toBe('failed');
    expect(failureView({ kind: 'bad-response' }).state).toBe('failed');
    expect(failureView({ kind: 'not-configured' }).state).toBe('unavailable');
  });

  it('never shows forbidden words for any failure, server code or state text', () => {
    const fs: OnlineFailure[] = [
      { kind: 'not-configured' }, { kind: 'network' }, { kind: 'update-needed' }, { kind: 'bad-response' },
      { kind: 'resting', retryAfterSec: 0 }, { kind: 'resting', retryAfterSec: 90 },
    ];
    for (let code = 0; code <= 14; code++) fs.push({ kind: 'server', code, retryAfterSec: 0, status: 0 });
    for (const f of fs) expect(failureView(f).text, JSON.stringify(f)).not.toMatch(FORBIDDEN);
    const words = [IDLE_TEXT, CONNECTING_TEXT, MATCHED_TEXT, WAITING_PICK_TEXT, CHECKING_TEXT, UPDATE_TEXT, BUSY_TEXT, GENERIC_TEXT,
      OPPONENT_AWAY_TEXT, OPPONENT_LEFT_TEXT, GATEWAY_NOTICE_TEXT, waitText(7), reconnectText(2), rejectText('simVersion'), rejectText('roster'), rejectText(undefined),
      endText(-1, 0, undefined), endText(0, 0, [2, 1]), endText(1, 0, [0, 2]), netStatusText('desync', undefined) ?? '',
      netStatusText('forfeit', 'timeout') ?? '', netStatusText('forfeit', undefined) ?? '', netStatusText('remote-paused', undefined) ?? ''];
    for (const w of words) expect(w).not.toMatch(FORBIDDEN);
  });

  it('words the end of a match from the player side', () => {
    expect(endText(0, 0, [2, 1])).toBe('You won the match! Rounds 2-1.');
    expect(endText(0, 1, [2, 1])).toBe('Your opponent won the match. Rounds 1-2.');
    expect(endText(-1, 0, undefined)).toBe('The match was a draw.');
  });

  it('checks MATCH_START', () => {
    expect(checkMatch(match(), 86)).toEqual({ ok: true, slot: 0, inputDelay: 2, batchEvery: 1 });
    expect(checkMatch(match({ slot: 1, inputDelay: 0, batchEvery: 8 }), 86).ok).toBe(true);
    expect(checkMatch(match({ simVersion: 85 }), 86)).toEqual({ ok: false, failure: { kind: 'update-needed' } });
    for (const bad of [{ slot: 2 }, { inputDelay: 9 }, { inputDelay: -1 }, { inputDelay: 1.5 }, { batchEvery: 0 }, { batchEvery: 9 }]) {
      expect(checkMatch(match(bad), 86), JSON.stringify(bad)).toEqual({ ok: false, failure: { kind: 'bad-response' } });
    }
  });
});

describe('rest store', () => {
  const mem = (): Storage => {
    const m = new Map<string, string>();
    return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); }, clear: () => { m.clear(); }, key: () => null, length: 0 };
  };
  beforeEach(resetRestMemory);

  it('rests for the failure retry time, then clears itself', () => {
    const s = mem();
    const store = restStore(s);
    expect(store.remainingMs(1000)).toBe(0);
    store.rest({ retryAfterSec: 60 }, 1000);
    expect(store.remainingMs(1000)).toBe(60_000);
    expect(restStore(s).remainingMs(31_000)).toBe(30_000);
    expect(restStore(s).remainingMs(61_000)).toBe(0);
    expect(s.getItem(REST_KEY)).toBeNull();
  });

  it('uses the default hour for an unknown retry time', () => {
    const store = restStore(mem());
    store.rest({ retryAfterSec: 0 }, 0);
    expect(store.remainingMs(0)).toBe(DEFAULT_RESTING_SEC * 1000);
  });

  it('drops corrupt or absurd values', () => {
    const s = mem();
    s.setItem(REST_KEY, 'abc');
    expect(restStore(s).remainingMs(0)).toBe(0);
    expect(s.getItem(REST_KEY)).toBeNull();
    s.setItem(REST_KEY, String(10 * 24 * 3600 * 1000));
    expect(restStore(s).remainingMs(0)).toBe(0);
    s.setItem(REST_KEY, '');
    expect(restStore(s).remainingMs(0)).toBe(0);
  });

  it('falls back to memory when storage throws or is missing', () => {
    const base = mem();
    const boom: Storage = { getItem: () => { throw new Error('no'); }, setItem: () => { throw new Error('no'); }, removeItem: () => { throw new Error('no'); }, clear: () => { base.clear(); }, key: () => null, length: 0 };
    const a = restStore(boom);
    a.rest({ retryAfterSec: 10 }, 0);
    expect(a.remainingMs(1000)).toBe(9000);
    resetRestMemory();
    const b = restStore(undefined);
    b.rest({ retryAfterSec: 10 }, 0);
    expect(restStore(undefined).remainingMs(0)).toBe(10_000);
    b.clear();
    expect(b.remainingMs(0)).toBe(0);
  });
});
