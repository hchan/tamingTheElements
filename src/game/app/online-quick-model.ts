import { startInputDelay } from '../net/online-tuning';
import type { SessionStatus } from '@core/index';
import { friendlyMessage, restingSec, type OnlineEvent, type OnlineFailure } from '../net/ws/online-client';

/**
 * Pure parts of the Online quick-match screen (docs/ONLINE-CLIENT.md "Screen"): the state table, every word a player sees,
 * the failure mapping, the MATCH_START check and the "resting" deadline store. No DOM, no network, no clock of its own.
 * Never use the words room, friend, Classic, Arcade, ruleset or Capture here (a test pins it).
 */
export type QuickState =
  | 'idle' | 'connecting' | 'queued' | 'matched' | 'waiting-pick' | 'checking' | 'playing'
  | 'ended' | 'resting' | 'update' | 'busy' | 'failed'
  /** Online play is not built into this version: retrying cannot help, so no Try again. */
  | 'unavailable';

export type ControlId =
  | 'quickFind' | 'quickCancel' | 'quickPick' | 'quickReady' | 'quickRetry' | 'quickReload'
  | 'quickAgain' | 'quickLeave' | 'quickBack' | 'quickLink';

/** The controls shown in each state (everything else is hidden); the first is focused. */
export function controlsFor(state: QuickState): readonly ControlId[] {
  switch (state) {
    case 'idle': return ['quickFind', 'quickBack'];
    case 'connecting':
    case 'queued': return ['quickCancel'];
    case 'matched': return ['quickReady', 'quickPick', 'quickLeave'];
    case 'waiting-pick':
    case 'checking': return ['quickLeave'];
    case 'playing': return ['quickLeave', 'quickLink'];
    case 'ended': return ['quickAgain', 'quickBack'];
    case 'resting':
    case 'unavailable': return ['quickBack'];
    case 'update': return ['quickReload', 'quickBack'];
    case 'busy':
    case 'failed': return ['quickRetry', 'quickBack'];
  }
}

export const IDLE_TEXT = 'Find an opponent online. No account needed.';
export const CONNECTING_TEXT = 'Connecting...';
export const MATCHED_TEXT = 'Opponent found. Choose your heroes, then press Ready.';
export const WAITING_PICK_TEXT = 'Waiting for your opponent to choose...';
export const CHECKING_TEXT = 'Checking that both games match...';
export const UPDATE_TEXT = 'Update needed, reload the page.';
export const BUSY_TEXT = 'The online service is busy right now. Try again in a minute.';
export const GENERIC_TEXT = 'Something went wrong online. Try again.';
export const RECONNECTING_PREFIX = 'Connection lost. Reconnecting';
export const OPPONENT_AWAY_TEXT = "Your opponent's connection dropped. Waiting for them...";
export const RESULT_DISAGREE_TEXT = 'The two games ended differently. You can save a report.';
export const OPPONENT_LEFT_TEXT = 'Your opponent left.';
/** A timeout stalled the match and nobody can say who left: no winner (never starts with RECONNECTING_PREFIX). */
export const CONNECTION_LOST_TEXT = 'Connection lost. The match ended with no winner.';
/** Shown when the service's gateway sent a failure notice; the raw notice text is for logs, not for players. */
export const GATEWAY_NOTICE_TEXT = 'The online service is having trouble. Hang on...';

/** "Looking for an opponent... 0:12" (m:ss). */
export function waitText(waitingSec: number): string {
  const s = Math.max(0, Math.floor(waitingSec));
  return `Looking for an opponent... ${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, '0')}`;
}

export function reconnectText(attempt: number): string {
  return `${RECONNECTING_PREFIX} (try ${String(attempt)})...`;
}

/** Words for a finished match from `side`'s point of view: never colour alone. */
export function endText(winner: number, side: 0 | 1, rounds: readonly [number, number] | undefined): string {
  const verdict = winner < 0 ? 'The match was a draw.' : winner === side ? 'You won the match!' : 'Your opponent won the match.';
  if (rounds === undefined) return verdict;
  return `${verdict} Rounds ${String(rounds[side])}-${String(rounds[side === 0 ? 1 : 0])}.`;
}

/** Words for a stopped match (the lockstep status); undefined for a status that needs none. */
export function netStatusText(status: SessionStatus, reason: string | undefined): string | undefined {
  if (status === 'desync') return 'The two games disagree about the match, so it was stopped. Please play again.';
  if (status === 'forfeit') return reason === 'timeout' ? CONNECTION_LOST_TEXT : 'The match ended: a player left.';
  if (status === 'remote-paused') return 'Your opponent switched tabs; waiting for them.';
  return undefined;
}

/** Words for a rejected setup handshake. */
export function rejectText(reason: string | undefined): string {
  return reason === 'simVersion'
    ? 'Connected, but your opponent runs a different version of the game. Reload the page.'
    : `Connected, but the games do not match (${reason ?? 'unknown'}).`;
}

export interface FailureView {
  readonly state: 'busy' | 'update' | 'failed' | 'resting' | 'unavailable';
  readonly text: string;
}

/** Which state and words a failure leads to. Server codes: 5 and 8 busy, 10 update, 6 and 7 (room codes) generic. */
export function failureView(f: OnlineFailure): FailureView {
  if (f.kind === 'update-needed') return { state: 'update', text: UPDATE_TEXT };
  if (f.kind === 'resting') return { state: 'resting', text: friendlyMessage(f) };
  if (f.kind === 'server') {
    if (f.code === 5 || f.code === 8) return { state: 'busy', text: BUSY_TEXT };
    if (f.code === 10) return { state: 'update', text: UPDATE_TEXT };
    if (f.code === 6 || f.code === 7) return { state: 'failed', text: GENERIC_TEXT };
  }
  if (f.kind === 'not-configured') return { state: 'unavailable', text: friendlyMessage(f) };
  return { state: 'failed', text: friendlyMessage(f) };
}

type MatchEvent = Extract<OnlineEvent, { t: 'match' }>;
export type MatchCheck =
  | { readonly ok: true; readonly slot: 0 | 1; readonly inputDelay: number; readonly batchEvery: number }
  | { readonly ok: false; readonly failure: OnlineFailure };

const isInt = (n: number, lo: number, hi: number): boolean => Number.isInteger(n) && n >= lo && n <= hi;

/** Is a MATCH_START usable here? Another sim version needs an update; out-of-range numbers are a bad response. */
export function checkMatch(e: MatchEvent, simVersion: number): MatchCheck {
  if (e.simVersion !== simVersion) return { ok: false, failure: { kind: 'update-needed' } };
  if ((e.slot !== 0 && e.slot !== 1) || !isInt(e.inputDelay, 0, 8) || !isInt(e.batchEvery, 1, 8)) {
    return { ok: false, failure: { kind: 'bad-response' } };
  }
  return { ok: true, slot: e.slot, inputDelay: startInputDelay(e.inputDelay), batchEvery: e.batchEvery };
}

/** The "resting" deadline survives a reload (localStorage) and a screen remount (module copy). */
export const REST_KEY = 'tte.online.restUntil.v1';
const MAX_REST_MS = 24 * 3600 * 1000;
let memoryRest: number | undefined;

export interface RestStore {
  /** Remaining milliseconds of rest, or 0 when none (a stale or corrupt value is cleared). */
  remainingMs(wallNow: number): number;
  /** Start resting for the failure's retry time. */
  rest(f: { readonly retryAfterSec: number }, wallNow: number): void;
  clear(): void;
}

export function restStore(storage: Storage | undefined): RestStore {
  const read = (): number | undefined => {
    if (storage !== undefined) {
      try {
        const raw = storage.getItem(REST_KEY);
        if (raw === null) return memoryRest;
        const n = Number(raw);
        return raw.trim() !== '' && Number.isFinite(n) ? n : NaN;
      } catch {
        return memoryRest;
      }
    }
    return memoryRest;
  };
  const write = (v: number | undefined): void => {
    memoryRest = v;
    if (storage === undefined) return;
    try {
      if (v === undefined) storage.removeItem(REST_KEY);
      else storage.setItem(REST_KEY, String(v));
    } catch {
      /* memory copy only */
    }
  };
  return {
    remainingMs(wallNow) {
      const until = read();
      if (until === undefined) return 0;
      const left = until - wallNow;
      if (!Number.isFinite(left) || left > MAX_REST_MS) {
        write(undefined);
        return 0;
      }
      if (left <= 0) {
        write(undefined);
        return 0;
      }
      return left;
    },
    rest(f, wallNow) {
      write(wallNow + restingSec(f) * 1000);
    },
    clear() {
      write(undefined);
    },
  };
}

/** Test hook: forget the module-level copy. */
export function resetRestMemory(): void {
  memoryRest = undefined;
}
