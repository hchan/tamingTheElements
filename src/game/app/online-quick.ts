import { SIM_VERSION, type MatchSetup } from '@core/index';
import { navigateHash } from '@ui/dom';
import type { Screen } from '@ui/screens/screen';
import { buildDesyncReport } from '../net/desync-report';
import { linkLine } from '../net/link-quality';
import { ACK_STATUS, MatchReporter } from '../net/ws/match-report';
import { END_DETAIL, type MatchEndRecord } from '../net/match-end';
import { onlineConfig } from '../net/ws/config';
import { friendlyMessage, OnlineClient, restingSec, type OnlineEvent, type OnlineFailure } from '../net/ws/online-client';
import type { ArenaLaunch } from '../scenes/launch';
import { downloadReport } from './download';
import { destroyGame } from './game-handle';
import { launchOnlineArena, type OnlineArena } from './online-arena';
import {
  checkMatch, CHECKING_TEXT, GATEWAY_NOTICE_TEXT, CONNECTING_TEXT, endText, failureView, IDLE_TEXT, MATCHED_TEXT, netStatusText, OPPONENT_AWAY_TEXT,
  OPPONENT_LEFT_TEXT, GENERIC_TEXT, reconnectText, RESULT_DISAGREE_TEXT, rejectText, restStore, waitText, WAITING_PICK_TEXT, type QuickState,
} from './online-quick-model';
import { QuickSetup } from './online-quick-setup';
import { createQuickView, type QuickView } from './online-quick-view';

/**
 * The Online screen of a build with an online service configured (docs/ONLINE-CLIENT.md "Screen"): guest-first quick match.
 * Find an opponent, pick three heroes, play. One `gen` counter guards every async continuation, so a screen that was left
 * (or a client that was replaced) never touches the page again. Network, clocks and storage come in through `QuickDeps`.
 */
export interface QuickDeps {
  readonly client: () => OnlineClient;
  readonly simVersion: number;
  /** Monotonic milliseconds. */
  readonly now: () => number;
  /** Wall-clock milliseconds (the resting deadline survives a reload). */
  readonly wallNow: () => number;
  /** One-shot timer; returns its canceller. */
  readonly after: (ms: number, fn: () => void) => () => void;
  readonly storage: Storage | undefined;
}

/** The slice of a session `onStatus` reports (the same one the desync report is built from). */
type Session = Parameters<NonNullable<NonNullable<ArenaLaunch['net']>['onStatus']>>[1];
type MatchEvent = Extract<OnlineEvent, { t: 'match' }>;

/** Poll period of the hero pick and the setup handshake. */
const TICK_MS = 50;
const LINK_MS = 1000;

function browserDeps(): QuickDeps {
  const config = onlineConfig();
  return {
    client: () => new OnlineClient({
      config,
      fetch: (u, i) => fetch(u, i),
      WebSocket,
      simVersion: SIM_VERSION,
      now: () => performance.now(),
      after: (ms, fn) => {
        const id = setTimeout(fn, ms);
        return () => { clearTimeout(id); };
      },
      random: () => Math.random(),
    }),
    simVersion: SIM_VERSION,
    now: () => performance.now(),
    wallNow: () => Date.now(),
    after: (ms, fn) => {
      const id = setTimeout(fn, ms);
      return () => { clearTimeout(id); };
    },
    storage: safeStorage(),
  };
}

function safeStorage(): Storage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function quickMatchScreen(deps: QuickDeps = browserDeps()): Screen {
  let gen = 0;
  let view: QuickView | undefined;
  let state: QuickState = 'idle';
  let stoppedMatch = -1; // the match id the lockstep session stopped (forfeit or desync): its end line is already on screen
  let client: OnlineClient | undefined;
  /** The socket is open (connect() succeeded and no final close yet). */
  let connected = false;
  let queueConfirmed = false;
  /** The text the state shows; overlays (reconnecting, opponent away) put it back when they clear. */
  let base = IDLE_TEXT;
  let ticker: (() => void) | undefined;
  let linkTimer: (() => void) | undefined;
  let restTimer: (() => void) | undefined;
  let qs: QuickSetup | undefined;
  let current: MatchEvent | undefined;
  let setup: MatchSetup | undefined;
  let side: 0 | 1 = 0;
  let arena: OnlineArena | undefined;
  let session: Session | undefined;
  /** The relay said the peer is disconnected; applied to the session (now, or on its first status if the arena is not up yet). */
  let peerAway = false;
  let reporter: MatchReporter | undefined;
  /** How the last match ended; survives dropMatch (which clears the live reporter). */
  let lastEnd: MatchEndRecord | undefined;
  /** A resting notice that arrived during a match: shown when it ends. */
  let restAfter = false;
  let onPageHide: (() => void) | undefined;
  const store = restStore(deps.storage);

  const set = (s: QuickState, text?: string): void => {
    state = s;
    if (text !== undefined) base = text;
    view?.say(base);
    view?.show(s);
  };
  const stopTicker = (): void => {
    ticker?.();
    ticker = undefined;
  };
  const stopArena = (): void => {
    linkTimer?.();
    linkTimer = undefined;
    if (arena) destroyGame(arena.game, arena.holder);
    arena = undefined;
    session = undefined;
    peerAway = false;
    view?.root.classList.remove('onlineLive');
    view?.reportButton(false);
  };
  /** Play again was asked: the arena lingers (hidden) until the queue frame is actually out, so RESULT can still be ACKed (see ResultPoll.defer). */
  let dropPending = false;
  const dropMatch = (): void => {
    dropPending = false;
    lastEnd = reporter?.end ?? lastEnd;
    reporter = undefined;
    stopTicker();
    stopArena();
    qs = undefined;
    setup = undefined;
    current = undefined;
  };
  const closeClient = (): void => {
    const c = client;
    client = undefined;
    connected = false;
    queueConfirmed = false;
    c?.close();
  };

  const showRest = (): void => {
    const left = store.remainingMs(deps.wallNow());
    dropMatch();
    closeClient();
    restTimer?.();
    restTimer = undefined;
    const text = friendlyMessage({ kind: 'resting', retryAfterSec: Math.max(1, Math.ceil(left / 1000)) });
    view?.fail('');
    set('resting', text);
    const g = gen;
    restTimer = deps.after(left, () => {
      if (g === gen && state === 'resting') set('idle', IDLE_TEXT);
    });
  };
  const failWith = (f: OnlineFailure): void => {
    if (f.kind === 'resting') {
      store.rest(f, deps.wallNow());
      showRest();
      return;
    }
    const v = failureView(f);
    dropMatch();
    if (v.state === 'update' || f.kind === 'network' || f.kind === 'bad-response' || f.kind === 'not-configured') closeClient();
    view?.fail(v.text);
    set(v.state === 'resting' ? 'failed' : v.state, v.text);
  };

  const tickOnce = (g: number): void => {
    if (g !== gen || client === undefined || qs === undefined) return;
    client.transport.tick();
    const r = qs.poll();
    if (r === 'waiting') {
      if (state === 'waiting-pick' && qs.opponentPicked) set('checking', CHECKING_TEXT);
      return;
    }
    stopTicker();
    if (r.t === 'rejected') {
      closeClient();
      dropMatch();
      view?.fail(rejectText(r.reason));
      set(r.reason === 'simVersion' ? 'update' : 'failed', rejectText(r.reason));
      return;
    }
    void startArena(g, r.setup);
  };

  const startArena = async (g: number, s: MatchSetup | undefined): Promise<void> => {
    const c = client;
    const m = current;
    const ok = m === undefined ? undefined : checkMatch(m, deps.simVersion);
    if (s === undefined || c === undefined || m === undefined || ok === undefined || !ok.ok) return;
    setup = s;
    side = ok.slot;
    const rep = new MatchReporter(c.transport, m.matchId, deps.now);
    reporter = rep;
    lastEnd = undefined;
    set('playing', '');
    view?.fail('');
    const a = await launchOnlineArena({
      node: view?.root ?? document.body,
      setup: s,
      side: ok.slot,
      match: m.matchId,
      input: c.transport,
      inputDelay: ok.inputDelay,
      batchEvery: ok.batchEvery,
      onEnd: (end) => {
        if (g !== gen || current !== m) return;
        if (session !== undefined) rep.finish(session, end.winner);
        // The finished arena stays up (its session keeps answering the opponent) until the next match or the screen closes.
        if (restAfter) {
          restAfter = false;
          showRest();
          return;
        }
        set('ended', endText(end.winner, side, end.rounds));
      },
      onStatus: (st, sess) => {
        if (g !== gen || current !== m) return;
        const first = session === undefined;
        session = sess;
        if (first && peerAway) sess.setPeerAway(true);
        rep.update(sess);
        if (st === 'forfeit') rep.finishForfeit(sess);
        if (st === 'forfeit' || st === 'desync') stoppedMatch = m.matchId;
        const t = netStatusText(st, sess.forfeitReason);
        if (t !== undefined) view?.say(t);
        if (st === 'desync') view?.reportButton(true);
      },
    });
    if (g !== gen || current !== m) {
      destroyGame(a.game, a.holder);
      return;
    }
    arena = a;
    const refresh = (): void => {
      if (g !== gen || arena !== a) return;
      view?.link(linkLine(c.rttMs(), session?.stats));
      linkTimer = deps.after(LINK_MS, refresh);
    };
    refresh();
  };

  const onMatch = (e: MatchEvent, g: number): void => {
    if (e.resumed || (current !== undefined && current.matchId === e.matchId)) {
      // The same match again after a reconnect: only the note goes away.
      if (current !== undefined) view?.say(base);
      return;
    }
    // A new match: whatever was running (pick or play) is over.
    dropMatch();
    const ok = checkMatch(e, deps.simVersion);
    if (!ok.ok) {
      failWith(ok.failure);
      return;
    }
    if (client === undefined) return;
    current = e;
    side = ok.slot;
    qs = new QuickSetup(client.transport.control, ok.slot, e.seed);
    queueConfirmed = false;
    set('matched', MATCHED_TEXT);
    view?.lockPick(false);
    ticker = deps.after(TICK_MS, function again() {
      tickOnce(g);
      if (g === gen && qs !== undefined && ticker !== undefined) ticker = deps.after(TICK_MS, again);
    });
  };

  const onEvent = (e: OnlineEvent, c: OnlineClient, g: number): void => {
    if (g !== gen || c !== client) return;
    switch (e.t) {
      case 'queue':
        queueConfirmed = true;
        if (dropPending) dropMatch(); // The deferred queue frame went out: the old match is over.
        if (state === 'queued') set('queued', waitText(e.waitingSec));
        break;
      case 'match':
        onMatch(e, g);
        break;
      case 'peer':
        if (current === undefined || e.matchId !== current.matchId) break;
        if (state === 'ended' || e.matchId === stoppedMatch) break; // the match is over and its end line stands (a late gone or away must not replace it)
        if (e.status === 'disconnected') {
          peerAway = true;
          session?.setPeerAway(true);
          view?.say(OPPONENT_AWAY_TEXT);
        } else if (e.status === 'back') {
          peerAway = false;
          session?.setPeerAway(false);
          view?.say(base);
        } else {
          reporter?.left(session?.simTick ?? 0);
          dropMatch();
          set('ended', OPPONENT_LEFT_TEXT);
        }
        break;
      case 'result-ack':
        // The relay compared both RESULTs (or the hashes): 0 agreed, 2 the games disagree; 1 (waiting) changes nothing.
        if (current === undefined || e.matchId !== current.matchId || dropPending) break; // A stale answer (the match was dropped or left) must not touch this screen.
        if (e.status === ACK_STATUS.disagreed) {
          view?.say(RESULT_DISAGREE_TEXT);
          view?.reportButton(true);
        }
        break;
      case 'gateway-notice':
        if (state === 'ended') break; // a throttle notice after the end must not replace the end line
        view?.say(GATEWAY_NOTICE_TEXT);
        break;
      case 'reconnecting':
        view?.say(reconnectText(e.attempt));
        break;
      case 'reconnected':
        if (e.resumed) {
          view?.say(base);
        } else if (state === 'queued' || state === 'connecting') {
          queueConfirmed = false;
          c.joinQueue();
          view?.say(base);
        } else if (current !== undefined) {
          // The service lost our match while we were away.
          failWith({ kind: 'network' });
        }
        break;
      case 'resting':
        store.rest(e.failure.kind === 'resting' ? e.failure : { retryAfterSec: 0 }, deps.wallNow());
        if (state === 'playing') restAfter = true;
        else showRest();
        break;
      case 'error':
        if (e.failure.kind === 'server' && e.failure.code === 5 && queueConfirmed) break;
        if (state === 'playing') break;
        failWith(e.failure);
        break;
      case 'closed':
        connected = false;
        if (state === 'playing') reporter?.noteLink(END_DETAIL.relayClosed);
        if (state === 'playing' || state === 'ended' || state === 'idle') break;
        failWith(e.failure ?? { kind: 'network' });
        break;
      default:
        break;
    }
  };

  const find = (): void => {
    if (store.remainingMs(deps.wallNow()) > 0) {
      showRest();
      return;
    }
    const g = ++gen;
    dropMatch();
    closeClient();
    view?.fail('');
    set('connecting', CONNECTING_TEXT);
    const c = deps.client();
    client = c;
    c.onEvent = (e) => { onEvent(e, c, g); };
    void c.connect().then((r) => {
      if (g !== gen || c !== client) return;
      if (!r.ok) {
        failWith(r.failure);
        return;
      }
      connected = true;
      set('queued', waitText(0));
      c.joinQueue();
    });
  };

  /** Try again: on a live socket just ask the queue again, else start over. */
  const retry = (): void => {
    if (connected && client !== undefined && state === 'busy') {
      view?.fail('');
      queueConfirmed = false;
      set('queued', waitText(0));
      client.joinQueue();
      return;
    }
    find();
  };
  const cancel = (): void => {
    if (state === 'queued') client?.leaveQueue();
    gen++;
    closeClient();
    set('idle', IDLE_TEXT);
  };
  const again = (): void => {
    if (connected && client !== undefined) {
      dropPending = current !== undefined; // Keep the arena alive (hidden by the queued state) until the deferred join is sent.
      queueConfirmed = false;
      set('queued', waitText(0));
      client.joinQueue();
    } else {
      dropMatch();
      find();
    }
  };
  const leave = (): void => {
    teardown();
    navigateHash('main');
  };
  const ready = (): void => {
    if (qs === undefined || view === undefined || state !== 'matched') return;
    qs.ready(view.pick());
    view.lockPick(true);
    set('waiting-pick', WAITING_PICK_TEXT);
  };
  const saveReport = (): void => {
    if (setup !== undefined && session !== undefined) downloadReport(buildDesyncReport(setup, session, reporter?.end ?? lastEnd));
  };

  const teardown = (): void => {
    gen++;
    if (onPageHide) window.removeEventListener('pagehide', onPageHide);
    onPageHide = undefined;
    if (state === 'queued') client?.leaveQueue();
    restTimer?.();
    restTimer = undefined;
    dropMatch();
    closeClient();
    view?.root.remove();
    view = undefined;
  };

  return {
    mount(container) {
      gen++;
      state = 'idle';
      restAfter = false;
      view = createQuickView({ find, cancel, ready, retry, reload: () => { window.location.reload(); }, again, leave, report: saveReport });
      container.append(view.root);
      set('idle', IDLE_TEXT);
      if (store.remainingMs(deps.wallNow()) > 0) showRest();
      onPageHide = () => {
        if (state === 'queued') client?.leaveQueue();
        client?.close();
      };
      window.addEventListener('pagehide', onPageHide);
    },
    unmount: teardown,
  };
}

let active: Screen | undefined;
export function mountQuickMatch(container: HTMLElement): void {
  active?.unmount();
  active = quickMatchScreen();
  active.mount(container);
}
export function unmountQuickMatch(): void {
  active?.unmount();
  active = undefined;
}

export { GENERIC_TEXT, restingSec };
