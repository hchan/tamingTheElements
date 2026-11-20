import { cleanRoomCode, ROOM_CODE_RE } from '../relay';
import { linkQuality, medianRtt, type LinkQuality } from '../link-quality';
import type { OnlineConfig } from './config';
import { WebSocketTransport, type SocketLike } from './transport';
import { BINARY_TYPE, inboundBytes } from './inbound';
import { encodeText } from './text-codec';
import { decodeFrame } from './wire';

/** Client of the relay service (docs/ONLINE-PROTOCOL.md section 3, 5, 7; docs/ONLINE-CLIENT.md). Network and clock are injected; nothing here throws. */
export const PROTOCOL_VERSION = 3;
/** Error code "relay resting" (`ErrorCode.resting` in src/core/relay/constants.ts; game code cannot import the relay package, a ws-int test pins the two equal). */
export const RESTING_CODE = 0x000b;
export const PING_MS = 2000;
/** [choice] Wait for WELCOME this long. */
export const HELLO_TIMEOUT_MS = 10_000;
/** [choice, spec section 7] Reconnect window in a match (the server's grace) and while only queued or idle. */
export const MATCH_GRACE_MS = 10_000;
export const IDLE_GRACE_MS = 60_000;
/** Spec section 5: `resting` with no retry time means one hour. */
export const DEFAULT_RESTING_SEC = 3600;
export const BACKOFF_MS = [0, 1000, 2000, 4000] as const;
export const BACKOFF_MAX_MS = 30_000;

export type OnlineFailure =
  | { readonly kind: 'not-configured' }
  | { readonly kind: 'network' }
  | { readonly kind: 'update-needed' }
  | { readonly kind: 'bad-response' }
  /** Kill switch: HTTP 503 from /session or /ticket, or (while connected) an ERROR 0x000B frame. `retryAfterSec` 0 means unknown (use `DEFAULT_RESTING_SEC`). */
  | { readonly kind: 'resting'; readonly retryAfterSec: number }
  /** Any other server error code of spec section 5 (HTTP status 0 for a frame). */
  | { readonly kind: 'server'; readonly code: number; readonly retryAfterSec: number; readonly status: number };
export type OnlineResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly failure: OnlineFailure };

export type OnlineEvent =
  | { readonly t: 'queue'; readonly waitingSec: number }
  | { readonly t: 'room-created'; readonly code: string; readonly ttlSec: number }
  | { readonly t: 'room-peer'; readonly joined: boolean }
  | { readonly t: 'match'; readonly matchId: number; readonly slot: number; readonly seed: number; readonly inputDelay: number; readonly simVersion: number; readonly batchEvery: number; readonly resumed: boolean }
  | { readonly t: 'peer'; readonly matchId: number; readonly status: 'disconnected' | 'back' | 'gone'; readonly graceMs: number }
  | { readonly t: 'result-ack'; readonly matchId: number; readonly status: number }
  | { readonly t: 'reconnecting'; readonly attempt: number }
  | { readonly t: 'reconnected'; readonly resumed: boolean }
  /** The service switched off while connected; the socket closes later. Hide the online entries until the time passes. */
  | { readonly t: 'resting'; readonly failure: OnlineFailure }
  /** A refused request (busy, no-room, full, ...); the connection stays. */
  | { readonly t: 'error'; readonly failure: OnlineFailure }
  /** Final: no more events. `failure` is undefined for a normal close. */
  | { readonly t: 'closed'; readonly failure: OnlineFailure | undefined };

export interface FetchResponseLike {
  readonly status: number;
  readonly headers: { get(name: string): string | null };
  json(): Promise<unknown>;
}
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<FetchResponseLike>;
/** The slice of the browser WebSocket used here; the transport needs a `SocketLike`. */
export interface WsLike extends SocketLike {
  close(code?: number): void;
  addEventListener(type: 'message', listener: (ev: { data: unknown }) => void): void;
  addEventListener(type: 'open' | 'error', listener: () => void): void;
  addEventListener(type: 'close', listener: (ev: { code?: number }) => void): void;
}
export type WsCtor = new (url: string) => WsLike;

export interface OnlineDeps {
  readonly config: OnlineConfig;
  readonly fetch: FetchLike;
  readonly WebSocket: WsCtor;
  readonly simVersion: number;
  /** Monotonic milliseconds. */
  readonly now: () => number;
  /** One-shot timer; returns its canceller. */
  readonly after: (ms: number, fn: () => void) => () => void;
  /** 0 <= x < 1, for backoff jitter. */
  readonly random: () => number;
}

/** Words for a person; never mentions a server address. Resting names the wait (default 1 h). */
export function friendlyMessage(f: OnlineFailure): string {
  switch (f.kind) {
    case 'not-configured': return 'Online play is not available in this build.';
    case 'network': return 'Could not reach the online service. Check your connection and try again.';
    case 'update-needed': return 'Update needed, reload the page.';
    case 'bad-response': return 'The online service sent something unexpected. Try again in a minute.';
    case 'resting': {
      const sec = restingSec(f);
      return `The game is resting. Please look again in about ${sec >= 3600 ? `${String(Math.round(sec / 3600))} h` : `${String(Math.max(1, Math.round(sec / 60)))} min`}.`;
    }
    case 'server':
      return SERVER_WORDS[f.code] ?? 'The online service had a problem. Try again in a moment.';
  }
}

const SERVER_WORDS: Readonly<Record<number, string>> = {
  4: 'The sign-in expired. Try again.',
  5: 'You are already waiting or in a room.',
  6: 'That room code was not found. Check it, or ask your friend for a new one.',
  7: 'That room already has two players.',
  8: 'The online service is full right now. Try again in a minute.',
  9: 'Too many tries. Wait a moment.',
  10: 'You and your friend run different versions. Reload the page.',
};

/** Seconds until the service may be asked again (the default hour when the server did not say). */
export function restingSec(f: { readonly retryAfterSec: number }): number {
  return f.retryAfterSec > 0 ? f.retryAfterSec : DEFAULT_RESTING_SEC;
}

const NET: OnlineFailure = { kind: 'network' };
const fail = (failure: OnlineFailure): { ok: false; failure: OnlineFailure } => ({ ok: false, failure });
const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

/** Lobby-side frames (spec section 4) that `wire.ts` does not carry. */
type Lobby =
  | { t: 'welcome'; ver: number; sessionId: number; resumed: boolean }
  | { t: 'queue'; waitingSec: number }
  | { t: 'room-created'; code: string; ttlSec: number }
  | { t: 'room-peer'; joined: boolean }
  | { t: 'match'; matchId: number; slot: number; seed: number; inputDelay: number; simVersion: number; batchEvery: number }
  | { t: 'peer'; matchId: number; status: 'disconnected' | 'back' | 'gone'; graceMs: number }
  | { t: 'result-ack'; matchId: number; status: number };
const LOBBY_SIZE: Readonly<Record<number, number>> = { 0x02: 9, 0x12: 3, 0x21: 9, 0x23: 2, 0x30: 11, 0x44: 5, 0x51: 3 };
const PEER = ['disconnected', 'back', 'gone'] as const;

/** `undefined` for a non-lobby type or a malformed one (wrong length, bad room code or event). */
export function decodeLobby(b: Uint8Array): Lobby | undefined {
  const type = b[0] ?? 0;
  if (LOBBY_SIZE[type] !== b.length) return undefined;
  const d = new DataView(b.buffer, b.byteOffset, b.byteLength);
  switch (type) {
    case 0x02: return { t: 'welcome', ver: d.getUint8(1), sessionId: d.getUint32(2), resumed: d.getUint8(6) === 1 };
    case 0x12: return { t: 'queue', waitingSec: d.getUint16(1) };
    case 0x21: {
      const code = String.fromCharCode(...b.subarray(1, 7));
      return ROOM_CODE_RE.test(code) ? { t: 'room-created', code, ttlSec: d.getUint16(7) } : undefined;
    }
    case 0x23: return d.getUint8(1) <= 1 ? { t: 'room-peer', joined: d.getUint8(1) === 0 } : undefined;
    case 0x30: return { t: 'match', matchId: d.getUint8(1), slot: d.getUint8(2), seed: d.getUint32(3), inputDelay: d.getUint8(7), simVersion: d.getUint16(8), batchEvery: d.getUint8(10) };
    case 0x44: {
      const status = PEER[d.getUint8(2)];
      return status === undefined ? undefined : { t: 'peer', matchId: d.getUint8(1), status, graceMs: d.getUint16(3) };
    }
    default: return { t: 'result-ack', matchId: d.getUint8(1), status: d.getUint8(2) };
  }
}

function hello(simVersion: number, resume: number): string {
  const b = new Uint8Array(8);
  const d = new DataView(b.buffer);
  b[0] = 0x01;
  b[1] = PROTOCOL_VERSION;
  d.setUint16(2, simVersion);
  d.setUint32(4, resume >>> 0);
  return encodeText(b);
}

/** Keeps one `SocketLike` for the transport across reconnects, so its `seq` counter and reorder state continue (spec section 7). */
class SocketHub implements SocketLike {
  cur: WsLike | undefined;
  readonly onMessage: ((ev: { data: unknown }) => void)[] = [];
  readonly onClose: (() => void)[] = [];
  get readyState(): number { return this.cur?.readyState === 1 ? 1 : 3; }
  send(data: string): void { this.cur?.send(data); }
  addEventListener(type: 'message' | 'close', listener: ((ev: { data: unknown }) => void) & (() => void)): void {
    (type === 'message' ? this.onMessage : this.onClose).push(listener);
  }
}

type Dialled = { ws: WsLike; sessionId: number; resumed: boolean };

/**
 * One online connection: `connect()` runs session, ticket, WebSocket and HELLO/WELCOME and resolves with a connected `WebSocketTransport`
 * for the session layer. Lobby calls (`joinQueue`, `createRoom`, ...) answer through `onEvent`. A dropped socket reconnects by itself
 * (new ticket, HELLO with the old session id, backoff 0/1/2/4 s with jitter) until the grace ends; version mismatch and `resting`
 * never retry. Call `close()` to leave.
 */
export class OnlineClient {
  readonly transport: WebSocketTransport;
  onEvent: (e: OnlineEvent) => void = () => undefined;
  private readonly hub = new SocketHub();
  private token: { value: string; until: number } | undefined;
  private restUntil = 0;
  private resting: OnlineFailure | undefined;
  /** The latest ERROR frame of this connection: the authority for what a following close means (the close code is a hint). */
  private lastError: { code: number; retryAfterSec: number } | undefined;
  private sessionId = 0;
  /** The last WELCOME said resumed: a MATCH_START with the running matchId is then the same match again (spec section 7). */
  private resumePending = false;
  private inMatch = false;
  private stopped = false;
  private reconnecting = false;
  /** Read through a method so a flag flipped by `close()` during an await is not narrowed away. */
  private over(): boolean { return this.stopped; }
  private cancelPing: (() => void) | undefined;

  constructor(private readonly d: OnlineDeps) {
    this.transport = new WebSocketTransport(this.hub, d.now);
  }

  /** Runs once. Never throws; every failure is a typed result. */
  async connect(): Promise<OnlineResult<WebSocketTransport>> {
    if (this.restUntil > this.d.now()) return fail({ kind: 'resting', retryAfterSec: Math.ceil((this.restUntil - this.d.now()) / 1000) });
    const r = await this.dial(0);
    if (!r.ok) return r;
    this.sessionId = r.value.sessionId;
    this.schedulePing();
    return ok(this.transport);
  }

  joinQueue(): boolean { return this.lobbyAction([0x10, 0]); }
  leaveQueue(): boolean { return this.sendLobby([0x11]); }
  createRoom(): boolean { return this.lobbyAction([0x20]); }
  /** False when the text cannot be a room code (spaces and case are forgiven) or the socket is down. */
  joinRoom(text: string): boolean {
    const code = cleanRoomCode(text);
    return code !== undefined && this.lobbyAction([0x22, ...Array.from({ length: code.length }, (_, i) => code.charCodeAt(i))]);
  }

  /** Median round trip of the latest pings, and its grade (spec section 4, Heartbeat). */
  rttMs(): number | undefined { return medianRtt(this.transport.rtts); }
  quality(): LinkQuality | undefined { return this.rttMs() === undefined ? undefined : linkQuality(this.rttMs() ?? 0); }

  /** Steam: the page to navigate to (spec section 3); no UI here. */
  steamStartUrl(): string | undefined {
    return this.d.config.configured ? `${this.d.config.httpUrl}/auth/openid/start` : undefined;
  }

  /** Steam: exchange the one-time code from the URL fragment for a session; the next connect uses it. */
  async signInWithSteam(code: string): Promise<OnlineResult<true>> {
    const r = await this.session({ kind: 'steam', code }, true);
    return r.ok ? ok(true) : r;
  }

  close(): void {
    this.end(undefined);
  }

  private async post(path: string, body: unknown, bearer?: string): Promise<OnlineResult<Record<string, unknown>>> {
    const cfg = this.d.config;
    if (!cfg.configured) return fail({ kind: 'not-configured' });
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearer !== undefined) headers['Authorization'] = `Bearer ${bearer}`;
    let res: FetchResponseLike;
    let json: Record<string, unknown> = {};
    try {
      res = await this.d.fetch(cfg.httpUrl + path, { method: 'POST', headers, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    } catch {
      return fail(NET);
    }
    try {
      json = rec(await res.json());
    } catch {
      // Body missing or not JSON: callers validate the fields they need.
    }
    const retry = num(json['retryAfterSec']) || Number.parseInt(res.headers.get('Retry-After') ?? '', 10) || 0;
    if (num(json['code']) === RESTING_CODE) return fail(this.rest(retry));
    if (res.status < 200 || res.status > 299) return fail({ kind: 'server', code: num(json['code']), retryAfterSec: retry, status: res.status });
    return ok(json);
  }

  private async session(body: unknown, force: boolean): Promise<OnlineResult<string>> {
    if (!force && this.token && this.token.until > this.d.now()) return ok(this.token.value);
    const r = await this.post('/session', body);
    if (!r.ok) return r;
    const value = r.value['session'];
    if (typeof value !== 'string' || value === '') return fail({ kind: 'bad-response' });
    this.token = { value, until: this.d.now() + (num(r.value['expiresIn']) || 60) * 1000 };
    return ok(value);
  }

  /** `{ticket, url}` of /ticket (wire v3): `url` is the full address to open, the ticket already in it. Anything else is a server fault. */
  private async ticket(again = false): Promise<OnlineResult<string>> {
    const s = await this.session({ kind: 'guest' }, false);
    if (!s.ok) return s;
    const r = await this.post('/ticket', undefined, s.value);
    if (!r.ok) {
      const f = r.failure;
      if (f.kind !== 'server' || f.status !== 401 || again) return r;
      this.token = undefined; // The session ran out early: one fresh guest session.
      return this.ticket(true);
    }
    const t = r.value['ticket'];
    const url = r.value['url'];
    return typeof t === 'string' && t !== '' && typeof url === 'string' && url.startsWith('wss://') ? ok(url) : fail({ kind: 'bad-response' });
  }

  private rest(retryAfterSec: number): OnlineFailure {
    this.restUntil = this.d.now() + restingSec({ retryAfterSec }) * 1000;
    return { kind: 'resting', retryAfterSec };
  }

  /**
   * Ticket, open, HELLO, WELCOME. Any failure before WELCOME gets ONE fresh ticket and a second try; a second failure is a failed
   * attempt (wire v3: the handshake never says "ticket invalid" or "resting"). A version mismatch or a resting hint is final at once.
   */
  private async dial(resume: number): Promise<OnlineResult<Dialled>> {
    for (let attempt = 0; ; attempt++) {
      const t = await this.ticket();
      if (!t.ok) return t;
      const r = await this.handshake(t.value, resume);
      if (r.ok || r.failure.kind === 'update-needed' || r.failure.kind === 'resting' || attempt >= 1) return r;
    }
  }

  private handshake(url: string, resume: number): Promise<OnlineResult<Dialled>> {
    this.lastError = undefined;
    return new Promise((resolve) => {
      let ws: WsLike;
      try {
        ws = new this.d.WebSocket(url);
      } catch {
        resolve(fail(NET));
        return;
      }
      ws.binaryType = BINARY_TYPE;
      let done = false;
      const cancel = this.d.after(HELLO_TIMEOUT_MS, () => { finish(fail(NET)); });
      const finish = (r: OnlineResult<Dialled>): void => {
        if (done) return;
        done = true;
        cancel();
        if (r.ok) {
          this.hub.cur = ws;
          this.resumePending = r.value.resumed;
        } else {
          try { ws.close(); } catch { /* already closed */ }
        }
        resolve(r);
      };
      ws.addEventListener('open', () => {
        try { ws.send(hello(this.d.simVersion, resume)); } catch { finish(fail(NET)); }
      });
      ws.addEventListener('error', () => { finish(fail(NET)); });
      ws.addEventListener('close', (ev) => {
        if (done) this.onClose(ws, ev.code);
        else finish(fail(closeFailure(ev.code))); // No ERROR frame arrived: the close code is only a hint.
      });
      ws.addEventListener('message', (ev) => {
        if (done) { this.onMessage(ws, ev.data); return; }
        const b = inboundBytes(ev.data);
        const w = b && decodeLobby(b);
        const e = b && decodeFrame(b);
        if (w?.t === 'welcome') finish(w.ver === PROTOCOL_VERSION ? ok({ ws, sessionId: w.sessionId, resumed: w.resumed }) : fail({ kind: 'update-needed' }));
        else if (e?.t === 'error') finish(fail(this.errorFailure(e.code, e.retryAfterSec)));
      });
    });
  }

  private errorFailure(code: number, retryAfterSec: number): OnlineFailure {
    if (code === 0x0003) return { kind: 'update-needed' };
    if (code === RESTING_CODE) return this.rest(retryAfterSec);
    return { kind: 'server', code, retryAfterSec, status: 0 };
  }

  /** Asking for a queue or a room means the last match is over: the idle reconnect budget applies again. */
  private lobbyAction(bytes: number[]): boolean {
    const sent = this.sendLobby(bytes);
    if (sent) this.leaveMatch();
    return sent;
  }

  private leaveMatch(): void {
    this.inMatch = false;
    this.resumePending = false;
  }

  private sendLobby(bytes: number[]): boolean {
    if (this.hub.readyState !== 1) return false;
    try {
      this.hub.send(encodeText(Uint8Array.from(bytes)));
      return true;
    } catch {
      return false;
    }
  }

  private onMessage(ws: WsLike, data: unknown): void {
    if (ws !== this.hub.cur || this.stopped) return;
    const b = inboundBytes(data);
    const w = b && decodeLobby(b);
    if (w) {
      this.lobby(w);
      return;
    }
    const e = b && decodeFrame(b);
    if (e?.t === 'error') {
      this.lastError = { code: e.code, retryAfterSec: e.retryAfterSec };
      this.serverError(e.code, e.retryAfterSec);
    }
    for (const l of this.hub.onMessage) l({ data }); // Match frames (and anything malformed, which the transport counts).
  }

  private lobby(w: Lobby): void {
    switch (w.t) {
      case 'welcome': break; // A duplicate answer is tolerated (spec section 6).
      case 'match': {
        // Same match again only after a resumed WELCOME and with the running matchId (a duplicate MATCH_START is tolerated); anything else is a new match.
        const resumed = this.resumePending && this.inMatch && w.matchId === this.transport.matchId;
        this.transport.startMatch(w.matchId, resumed);
        this.inMatch = true;
        this.onEvent({ ...w, resumed });
        break;
      }
      case 'result-ack':
        if (this.transport.matchId !== undefined && w.matchId !== this.transport.matchId) break; // Answer for an earlier match.
        this.transport.stopRetry();
        this.leaveMatch();
        this.onEvent(w);
        break;
      case 'peer':
        if (this.transport.matchId === undefined || w.matchId === this.transport.matchId) this.onEvent(w);
        break;
      default:
        this.onEvent(w);
    }
  }

  private serverError(code: number, retryAfterSec: number): void {
    const failure = this.errorFailure(code, retryAfterSec);
    if (failure.kind === 'update-needed') this.end(failure);
    else if (failure.kind === 'resting') {
      this.resting = failure;
      this.onEvent({ t: 'resting', failure });
    } else this.onEvent({ t: 'error', failure });
  }

  private onClose(ws: WsLike, code: number | undefined): void {
    if (ws !== this.hub.cur || this.stopped) return;
    // The ERROR frame decides; the close code is only a hint when no frame arrived (wire v3).
    const f = this.lastError ? this.errorFailure(this.lastError.code, this.lastError.retryAfterSec) : closeFailure(code);
    if (f.kind === 'update-needed' || f.kind === 'resting' || this.resting) this.end(this.resting ?? (f.kind === 'resting' ? this.rest(0) : f));
    else if (code === 1000 && !this.lastError) this.end(undefined);
    else void this.reconnect();
  }

  private async reconnect(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    const start = this.d.now();
    const budget = this.inMatch ? MATCH_GRACE_MS : IDLE_GRACE_MS;
    for (let n = 0; !this.over(); n++) {
      if (n > 0 && this.d.now() - start >= budget) break;
      const base = Math.min(BACKOFF_MAX_MS, BACKOFF_MS[n] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 0);
      if (base > 0) await new Promise<void>((r) => { this.d.after(Math.round(base * (1 + 0.25 * this.d.random())), r); });
      if (this.over()) break;
      this.onEvent({ t: 'reconnecting', attempt: n + 1 });
      const r = await this.dial(this.sessionId);
      if (this.over()) {
        if (r.ok) r.value.ws.close();
        break;
      }
      if (r.ok) {
        this.sessionId = r.value.sessionId;
        this.reconnecting = false;
        this.onEvent({ t: 'reconnected', resumed: r.value.resumed });
        return;
      }
      if (r.failure.kind !== 'network' && r.failure.kind !== 'server' && r.failure.kind !== 'bad-response') {
        this.reconnecting = false;
        this.end(r.failure);
        return;
      }
    }
    this.reconnecting = false;
    this.end(NET);
  }

  private schedulePing(): void {
    this.cancelPing = this.d.after(PING_MS, () => {
      if (this.stopped) return;
      if (this.hub.readyState === 1) this.transport.ping();
      this.schedulePing();
    });
  }

  /** Final state: stop timers, close the socket, tell the transport and the app once. */
  private end(failure: OnlineFailure | undefined): void {
    if (this.stopped) return;
    this.stopped = true;
    this.cancelPing?.();
    const ws = this.hub.cur;
    try { ws?.close(1000); } catch { /* already closed */ }
    for (const l of this.hub.onClose) l();
    this.onEvent({ t: 'closed', failure });
  }
}

/** Hint from a close code when no ERROR frame arrived (advisory in wire v3): 4003 update, 4011 resting; anything else is a network drop. */
function closeFailure(code: number | undefined): OnlineFailure {
  if (code === 4003) return { kind: 'update-needed' };
  if (code === 4011) return { kind: 'resting', retryAfterSec: 0 };
  return NET;
}
