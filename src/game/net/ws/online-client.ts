import { cleanRoomCode } from '../relay';
import { linkQuality, medianRtt, type LinkQuality } from '../link-quality';
import { closeFailure } from './close-failure';
import { ResultPoll } from './result-poll';
import { WebSocketTransport, type SocketLike } from './transport';
import { DEFAULT_RESTING_SEC, type FetchResponseLike, type OnlineDeps, type OnlineEvent, type OnlineFailure, type OnlineResult, type WsLike } from './online-types';
import { decodeLobby, type Lobby } from './lobby-codec';
import { BINARY_TYPE, gatewayEvent, inboundBytes } from './inbound';
import { encodeText } from './text-codec';
import { decodeFrame } from './wire';
import { CHAT_CAP_BIT, CHAT_MAX_BYTES, CHAT_TYPE, validateChatText } from './chat-rules';
import { chatErrorSeq, decodeChat, encodeChat } from './chat-wire';

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
export const BACKOFF_MS = [0, 1000, 2000, 4000] as const;
export const BACKOFF_MAX_MS = 30_000;

// Public types and the person-facing texts live in sibling modules; re-exported so imports of this file stay valid.
export { DEFAULT_RESTING_SEC };
export type { FetchLike, FetchResponseLike, OnlineDeps, OnlineEvent, OnlineFailure, OnlineResult, WsCtor, WsLike } from './online-types';
import { restingSec } from './failure-text';
export { friendlyMessage, restingSec } from './failure-text';
export { decodeLobby };

const NET: OnlineFailure = { kind: 'network' };
const fail = (failure: OnlineFailure): { ok: false; failure: OnlineFailure } => ({ ok: false, failure });
const ok = <T>(value: T): { ok: true; value: T } => ({ ok: true, value });
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const rec = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {});

function hello(simVersion: number, resume: number): string {
  const b = Uint8Array.of(0x01, PROTOCOL_VERSION, 0, 0, 0, 0, 0, 0);
  const d = new DataView(b.buffer);
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

type Dialled = { ws: WsLike; sessionId: number; resumed: boolean; caps: number };

/** A peer line (validated text) and a refused own line (docs/ONLINE-PROTOCOL.md 4a: tagged ERROR, `seq` = the line's chatSeq, the socket stays open). */
export interface ChatIn { readonly seq: number; readonly text: string }
export interface ChatRefused { readonly seq: number; readonly code: number; readonly retryAfterSec: number }

/**
 * One online connection: `connect()` runs session, ticket, WebSocket and HELLO/WELCOME and resolves with a connected `WebSocketTransport`
 * for the session layer. Lobby calls (`joinQueue`, `createRoom`, ...) answer through `onEvent`. A dropped socket reconnects by itself
 * (new ticket, HELLO with the old session id, backoff 0/1/2/4 s with jitter) until the grace ends; version mismatch and `resting`
 * never retry. Call `close()` to leave.
 */
export class OnlineClient {
  readonly transport: WebSocketTransport;
  onEvent: (e: OnlineEvent) => void = () => undefined;
  /** Chat lines never enter the transport, the lockstep or the seq space. */
  onChat: (m: ChatIn) => void = () => undefined;
  onChatError: (e: ChatRefused) => void = () => undefined;
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
  /** WELCOME byte 7 of the live connection (bit0 = chat). */
  private caps = 0;
  /** Chat is open for this matchId from MATCH_START until the client leaves (queue, room, close): it outlives RESULT. */
  private chatMatch: number | undefined;
  private chatSeq = 0;
  private stopped = false;
  private reconnecting = false;
  /** Read through a method so a flag flipped by `close()` during an await is not narrowed away. */
  private over(): boolean { return this.stopped; }
  private cancelPing: (() => void) | undefined;
  private readonly result: ResultPoll; // RESULT timers owned by the client, not the arena

  constructor(private readonly d: OnlineDeps) {
    this.transport = new WebSocketTransport(this.hub, d.now);
    this.result = new ResultPoll(this.transport, d); this.transport.onResultSent = () => { this.result.begin(); };
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

  /** The relay offers chat (WELCOME caps bit0); read again after 'reconnected'. */
  chatSupported(): boolean { return (this.caps & CHAT_CAP_BIT) !== 0; }

  /**
   * Sends one line to the peer: the chatSeq used (u8, counts per match, wraps) or `undefined` when nothing was sent (no chat cap, not in
   * a match, socket down, text invalid or over 120 UTF-8 bytes). Rate and per-match caps are the caller's and the relay's.
   */
  sendChat(text: string): number | undefined {
    if (!this.chatSupported() || this.chatMatch === undefined || this.hub.readyState !== 1) return undefined;
    const bytes = new TextEncoder().encode(text);
    if (bytes.length > CHAT_MAX_BYTES || !validateChatText(bytes, 0, bytes.length)) return undefined;
    const frame = encodeChat(this.chatMatch, this.chatSeq, bytes);
    if (frame === undefined || !this.sendLobby(Array.from(frame))) return undefined;
    const seq = this.chatSeq;
    this.chatSeq = (seq + 1) & 0xff;
    return seq;
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
    if (!force) {
      const kept = this.d.guestStore?.load();
      if (kept !== undefined) {
        this.token = { value: kept, until: Number.POSITIVE_INFINITY };
        return ok(kept);
      }
    }
    const r = await this.post('/session', body);
    if (!r.ok) return r;
    const value = r.value['session'];
    if (typeof value !== 'string' || value === '') return fail({ kind: 'bad-response' });
    const ttlMs = (num(r.value['expiresIn']) || 60) * 1000;
    this.token = { value, until: this.d.now() + ttlMs };
    this.d.guestStore?.save(value, ttlMs);
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
      this.token = undefined;
      this.d.guestStore?.clear(); // The session ran out early: one fresh guest session.
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
          this.caps = r.value.caps;
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
        const gw = gatewayEvent(ev.data); if (gw) { this.onEvent(gw); finish(fail(NET)); return; } // A gateway notice instead of WELCOME: this attempt fails fast.
        const b = inboundBytes(ev.data);
        const w = b && decodeLobby(b);
        const e = b && decodeFrame(b);
        if (w?.t === 'welcome') finish(w.ver === PROTOCOL_VERSION ? ok({ ws, sessionId: w.sessionId, resumed: w.resumed, caps: w.caps }) : fail({ kind: 'update-needed' }));
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
    if (this.hub.readyState !== 1) return false;
    let sync = true; // An immediate failure is the return value; only a held action reports through the event.
    const accepted = this.result.defer(
      () => {
        this.transport.endMatch(); // Before the send: a MATCH_START answering it must start the next match.
        if (!this.sendLobby(bytes)) return false;
        this.result.stop();
        this.leaveMatch();
        this.chatMatch = undefined; // Queue or room: the pair is over (RESULT alone keeps chat open).
        return true;
      },
      (ok) => { if (!ok && !sync) this.onEvent({ t: 'error', failure: NET }); },
    );
    sync = false;
    return accepted;
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
    const gw = gatewayEvent(data); if (gw) { this.onEvent(gw); return; } // Not a frame: the transport never sees it, so it is not malformed.
    const b = inboundBytes(data);
    if (b?.[0] === CHAT_TYPE) { this.chatIn(b); return; }
    const w = b && decodeLobby(b);
    if (w) {
      this.lobby(w);
      return;
    }
    const e = b && decodeFrame(b);
    const tagged = e?.t === 'error' ? chatErrorSeq(e.detail) : undefined;
    if (e?.t === 'error' && tagged !== undefined) { this.onChatError({ seq: tagged, code: e.code, retryAfterSec: e.retryAfterSec }); return; } // One refused line: not a server error, no close.
    if (e?.t === 'error') {
      this.lastError = { code: e.code, retryAfterSec: e.retryAfterSec };
      this.serverError(e.code, e.retryAfterSec);
    }
    for (const l of this.hub.onMessage) l({ data }); // Match frames (and anything malformed, which the transport counts).
  }

  /** A peer line: only for the running match, strict length and UTF-8; anything else is dropped without a trace (not malformed, not fatal). */
  private chatIn(b: Uint8Array): void {
    const f = decodeChat(b);
    if (f === undefined || f.match !== this.chatMatch || !validateChatText(f.bytes, 0, f.bytes.length)) return;
    this.onChat({ seq: f.seq, text: new TextDecoder('utf-8', { ignoreBOM: true }).decode(f.bytes) });
  }

  private lobby(w: Lobby): void {
    switch (w.t) {
      case 'welcome': this.caps = w.caps; break; // A duplicate answer is tolerated (spec section 6).
      case 'match': {
        // Same match again only after a resumed WELCOME and with the running matchId (a duplicate MATCH_START is tolerated); anything else is a new match.
        const resumed = this.resumePending && this.inMatch && w.matchId === this.transport.matchId;
        if (!resumed) this.result.reset();
        this.transport.startMatch(w.matchId, resumed);
        this.chatMatch = w.matchId;
        if (!resumed) this.chatSeq = 0;
        this.inMatch = true;
        this.onEvent({ ...w, resumed });
        break;
      }
      case 'result-ack':
        if (this.transport.matchId !== undefined && w.matchId !== this.transport.matchId) break; // Answer for an earlier match.
        this.transport.stopRetry();
        this.result.onAck(w.status); // 1 = waiting for the peer's RESULT: keep the match open (linger BATCH still flows) and re-poll.
        if (w.status !== 1) { this.transport.endMatch(); this.leaveMatch(); }
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
    const start = this.d.now(), budget = this.inMatch ? MATCH_GRACE_MS : IDLE_GRACE_MS;
    let hintSec = 0; // retryAfterSec of the last failure: a floor for the next wait
    for (let n = 0; !this.over(); n++) {
      if (n > 0 && this.d.now() - start >= budget) break;
      const base = Math.min(BACKOFF_MAX_MS, Math.max(BACKOFF_MS[n] ?? BACKOFF_MS[BACKOFF_MS.length - 1] ?? 0, hintSec * 1000));
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
      hintSec = r.failure.kind === 'server' ? r.failure.retryAfterSec : 0;
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
    this.chatMatch = undefined;
    this.cancelPing?.();
    this.result.reset();
    const ws = this.hub.cur;
    try { ws?.close(1000); } catch { /* already closed */ }
    for (const l of this.hub.onClose) l();
    this.onEvent({ t: 'closed', failure });
  }
}
