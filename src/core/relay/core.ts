import { decodeFrame, encodeFrame, type Frame, type FrameFields } from './codec';
import {
  closeCodeFor,
  CLOSE_NORMAL,
  DEFAULT_BATCH_EVERY,
  DEFAULT_INPUT_DELAY,
  DISCONNECT_GRACE_MS,
  ErrorCode,
  MATCH_RECORD_TTL_MS,
  MAX_INPUTS_PER_BATCH,
  MAX_QUEUE,
  PeerStatusEvent,
  PROTOCOL_VERSION,
  RESTING_CLOSE_MS,
  ResultReason,
  ResultStatus,
  RoomPeerEvent,
} from './constants';
import { generateRoomCode, isRoomCode, MAX_ROOMS, ROOM_TTL_MS } from './rooms-rules';
import type { Json, RelayCtx, Sender, Store } from './store';

/** Observability hook; the relay itself never ranks or punishes (spec: no cheating arbiter). */
export type RelayEvent =
  | { readonly kind: 'match-start'; readonly match: string }
  | {
      readonly kind: 'desync';
      readonly match: string;
      readonly tick: number;
      readonly by: number | 'server';
    }
  | {
      readonly kind: 'result';
      readonly match: string;
      readonly agreed: boolean;
      readonly winner: number;
      readonly ticks: number;
      readonly finalHash: number;
    }
  | { readonly kind: 'peer-gone'; readonly match: string; readonly slot: number };

export interface RelayOptions {
  readonly inputDelay?: number;
  readonly batchEvery?: number;
  readonly onEvent?: (e: RelayEvent) => void;
}

/** 'closed': the socket is gone and the record is being torn down; no compare-and-set expecting another state can succeed on it. */
type ConnState = 'idle' | 'queued' | 'room' | 'match' | 'closed';
interface ConnRec {
  sid: number;
  sim: number;
  st: ConnState;
  room: string | null;
  match: string | null;
  slot: number;
  /** When queued (ms). */
  qAt: number;
  /** When the kill switch was first seen on this connection (ms), -1 = not yet. */
  restAt: number;
  /** Identity the host authenticated this connection as (`RelayCtx.identity`), '' = none. A resume must present the same one. */
  idn: string;
}
interface SessRec {
  conn: string;
  match: string | null;
  slot: number;
  idn: string;
}
interface RoomRec {
  host: string;
  sim: number;
  guest: string | null;
  exp: number;
}
type Res = readonly [winner: number, reason: number, ticks: number, finalHash: number];
interface MatchRec {
  matchId: number;
  seed: number;
  sim: number;
  conns: [string, string];
  sids: [number, number];
  /** Time each slot's socket dropped, -1 while connected. */
  disc: [number, number];
  gone: [number, number];
  /** Pending checkpoint hashes by tick: [slot0, slot1], -1 = not yet received. */
  hashes: [tick: number, h0: number, h1: number][];
  results: [Res | null, Res | null];
  live: boolean;
}
type QueueEntry = [conn: string, sim: number, at: number];
interface QueueRec {
  w: QueueEntry[];
}

const KEEP = Symbol('keep');
const CONN_TTL_MS = MATCH_RECORD_TTL_MS;
const MAX_PENDING_HASHES = 64;
const MATCH_COUNTER_KEY = 'matchctr';
const sessKey = (sid: number): string => `sess:${String(sid)}`;
const asJson = (v: unknown): Json => v as Json;

/**
 * The relay's whole behaviour (docs/ONLINE-PROTOCOL.md) as a pure state machine over a `Store` and a `Sender`. One call to `handle` is
 * one inbound frame; all state lives in the store (nothing is kept between calls), so concurrent invocations are safe as long as the
 * store honours conditional puts. Read-modify-write is a compare-and-set loop. It relays inputs and compares hashes; it never simulates.
 */
export class RelayCore {
  constructor(
    private readonly store: Store,
    private readonly sender: Sender,
    private readonly options: RelayOptions = {},
  ) {}

  /** One inbound WebSocket message from `conn`. Never throws; an internal fault is answered with ERROR internal. */
  async handle(conn: string, data: Uint8Array | string, ctx: RelayCtx): Promise<void> {
    try {
      const d = typeof data === 'string' ? undefined : decodeFrame(data, 'c2s');
      if (typeof data === 'string' || d === undefined)
        await this.fail(conn, ErrorCode.badFrame, true);
      else if (!d.ok) await this.fail(conn, d.code, true);
      else await this.dispatch(conn, d.frame, data, ctx);
    } catch {
      await this.sendError(conn, ErrorCode.internal);
    }
  }

  /** The socket of `conn` closed. */
  async handleClose(conn: string, ctx: RelayCtx): Promise<void> {
    // Flip the record to 'closed' first (compare-and-set): a racing pairing can no longer claim it, and `rec` is the authoritative old state.
    const rec = await this.claim(
      conn,
      ctx,
      (r) => r.st !== 'closed',
      (r) => {
        r.st = 'closed';
      },
    );
    if (rec === undefined) return;
    if (rec.st === 'queued') await this.unqueue(conn);
    else if (rec.st === 'room' && rec.room !== null) await this.store.delete(`room:${rec.room}`);
    else if (rec.st === 'match' && rec.match !== null) {
      const r = await this.mutate<MatchRec, { peer: string; matchId: number } | undefined>(
        `match:${rec.match}`,
        ctx.now() + MATCH_RECORD_TTL_MS,
        (m) => {
          if (m === undefined || !m.live || m.conns[rec.slot] !== conn || m.disc[rec.slot] !== -1)
            return [KEEP, undefined];
          m.disc[rec.slot] = ctx.now();
          return [m, { peer: m.conns[1 - rec.slot] as string, matchId: m.matchId }];
        },
      );
      if (r !== undefined)
        await this.tx(r.peer, {
          t: 'peerStatus',
          matchId: r.matchId,
          event: PeerStatusEvent.disconnected,
          graceMs: DISCONNECT_GRACE_MS,
        });
    }
    await this.store.delete(`conn:${conn}`);
  }

  /** Housekeeping, call every few seconds: ends the grace of dropped players (PEER_STATUS gone to the peer). */
  async sweep(ctx: RelayCtx): Promise<void> {
    for (const key of await this.store.keys('match:')) {
      const r = await this.mutate<
        MatchRec,
        { slot: number; peer: string; matchId: number; resolve: boolean }[]
      >(
        key,
        ctx.now() + MATCH_RECORD_TTL_MS,
        (m) => {
          if (m === undefined || !m.live) return [KEEP, []];
          const out: { slot: number; peer: string; matchId: number; resolve: boolean }[] = [];
          for (const s of [0, 1]) {
            if (
              m.disc[s] === -1 ||
              m.gone[s] === 1 ||
              ctx.now() - (m.disc[s] as number) < DISCONNECT_GRACE_MS
            )
              continue;
            m.gone[s] = 1;
            // The peer already submitted a RESULT that can now never be matched: resolve it instead of leaving it at 'waiting'.
            const resolve = m.results[s] === null && m.results[1 - s] !== null;
            if (resolve) m.live = false;
            out.push({ slot: s, peer: m.conns[1 - s] as string, matchId: m.matchId, resolve });
          }
          if (m.gone[0] === 1 && m.gone[1] === 1) m.live = false;
          return out.length === 0 ? [KEEP, out] : [m, out];
        },
      );
      for (const g of r) {
        this.options.onEvent?.({ kind: 'peer-gone', match: key.slice(6), slot: g.slot });
        await this.store.delete(sessKey(await this.sidOf(key, g.slot)));
        await this.tx(g.peer, {
          t: 'peerStatus',
          matchId: g.matchId,
          event: PeerStatusEvent.gone,
          graceMs: 0,
        });
        if (g.resolve)
          await this.tx(g.peer, {
            t: 'resultAck',
            matchId: g.matchId,
            status: ResultStatus.disagreed,
          });
      }
    }
  }

  // ---- dispatch -------------------------------------------------------------------------------------------------------------

  private async dispatch(conn: string, f: Frame, raw: Uint8Array, ctx: RelayCtx): Promise<void> {
    if (f.t === 'hello') return this.onHello(conn, f, ctx);
    const rec = await this.getConn(conn);
    if (rec === undefined) return this.fail(conn, ErrorCode.badFrame, true);
    if (rec.st === 'closed') return;
    if (ctx.resting !== undefined && (await this.restingTick(conn, rec, ctx))) return;
    switch (f.t) {
      case 'ping':
        await this.tx(conn, { t: 'pong', nonce: f.nonce });
        if (rec.st === 'queued')
          await this.tx(conn, {
            t: 'queueState',
            waitingSec: Math.min(0xfffe, Math.floor((ctx.now() - rec.qAt) / 1000)),
          });
        return;
      case 'queueJoin':
        return this.onQueueJoin(conn, ctx);
      case 'queueLeave':
        return this.onQueueLeave(conn, ctx);
      case 'roomCreate':
        return this.onRoomCreate(conn, ctx);
      case 'roomJoin':
        return this.onRoomJoin(conn, f.code, ctx);
      case 'setup':
      case 'batch':
      case 'pause':
        return this.onRelayFrame(conn, rec, f, raw);
      case 'hash':
        return this.onHash(conn, rec, f, ctx);
      case 'desync':
        return this.onDesync(conn, rec, f, ctx);
      case 'result':
        return this.onResult(conn, rec, f, ctx);
      default:
        return this.fail(conn, ErrorCode.badFrame, true);
    }
  }

  /** Kill switch on a live connection: tell it once, close when no match is running or after 60 s. True when the connection was closed. */
  private async restingTick(conn: string, rec: ConnRec, ctx: RelayCtx): Promise<boolean> {
    const resting = ctx.resting as NonNullable<RelayCtx['resting']>;
    const now = ctx.now();
    if (rec.restAt === -1) {
      const first = await this.claim(
        conn,
        ctx,
        (r) => r.restAt === -1,
        (r) => {
          r.restAt = now;
        },
      );
      rec.restAt = first === undefined ? ((await this.getConn(conn))?.restAt ?? now) : now;
      if (first !== undefined) await this.sendError(conn, ErrorCode.resting, resting.retryAfterSec);
    }
    const m = rec.st === 'match' && rec.match !== null ? await this.getMatch(rec.match) : undefined;
    if (m !== undefined && m.live && now - rec.restAt < RESTING_CLOSE_MS) return false;
    await this.closeConn(conn, ErrorCode.resting);
    return true;
  }

  // ---- hello ----------------------------------------------------------------------------------------------------------------

  private async onHello(conn: string, f: FrameFields['hello'], ctx: RelayCtx): Promise<void> {
    if (await this.getConn(conn)) return this.fail(conn, ErrorCode.badFrame, true);
    if (ctx.resting !== undefined) {
      await this.sendError(conn, ErrorCode.resting, ctx.resting.retryAfterSec);
      return this.closeConn(conn, ErrorCode.resting);
    }
    if (f.ver !== PROTOCOL_VERSION) {
      await this.sendError(conn, ErrorCode.versionMismatch, 0, PROTOCOL_VERSION);
      return this.closeConn(conn, ErrorCode.versionMismatch);
    }
    const rec: ConnRec = {
      sid: 0,
      sim: f.simVersion,
      st: 'idle',
      room: null,
      match: null,
      slot: 0,
      qAt: 0,
      restAt: -1,
      idn: ctx.identity ?? '',
    };
    const resumed =
      f.resumeSession === 0 ? undefined : await this.tryResume(conn, f.resumeSession, rec, ctx);
    if (resumed === undefined) {
      for (let i = 0; i < 8 && rec.sid === 0; i++) {
        const sid = ctx.randomInt(0xfffffffe) + 1;
        const sess: SessRec = { conn, match: null, slot: 0, idn: rec.idn };
        if (
          await this.store.put(sessKey(sid), asJson(sess), {
            ifVersion: 'absent',
            expiresAtMs: ctx.now() + CONN_TTL_MS,
          })
        )
          rec.sid = sid;
      }
      if (rec.sid === 0) throw new Error('no session id');
    }
    if (!(await this.putConn(conn, rec, ctx, true))) return this.fail(conn, ErrorCode.badFrame, true);
    await this.tx(conn, {
      t: 'welcome',
      ver: PROTOCOL_VERSION,
      sessionId: rec.sid,
      resumed: resumed === undefined ? 0 : 1,
      serverHint: MAX_INPUTS_PER_BATCH,
    });
    if (resumed !== undefined) {
      await this.tx(conn, this.matchStart(resumed.m, rec.slot));
      if (resumed.wasDown)
        await this.tx(resumed.peer, {
          t: 'peerStatus',
          matchId: resumed.m.matchId,
          event: PeerStatusEvent.back,
          graceMs: 0,
        });
    }
  }

  /**
   * Reclaim a held slot (spec section 7). Fills `rec`; undefined when there is nothing to resume (a new session is made instead).
   * The session must belong to the same authenticated identity (`ctx.identity`, the ticket's subject), so knowing a session id is not
   * enough. A slot whose socket still looks connected is taken over: the old socket is closed.
   */
  private async tryResume(
    conn: string,
    sid: number,
    rec: ConnRec,
    ctx: RelayCtx,
  ): Promise<{ m: MatchRec; peer: string; wasDown: boolean } | undefined> {
    const sess = await this.getJson<SessRec>(sessKey(sid));
    if (sess === undefined || sess.match === null || sess.idn !== rec.idn) return undefined;
    const slot = sess.slot;
    const r = await this.mutate<
      MatchRec,
      { m: MatchRec; old: string; wasDown: boolean } | undefined
    >(`match:${sess.match}`, ctx.now() + MATCH_RECORD_TTL_MS, (m) => {
      const at = m?.disc[slot] ?? -1;
      if (
        m === undefined ||
        !m.live ||
        m.sids[slot] !== sid ||
        m.gone[slot] === 1 ||
        (at !== -1 && ctx.now() - at >= DISCONNECT_GRACE_MS)
      )
        return [KEEP, undefined];
      const old = m.conns[slot] as string;
      m.conns[slot] = conn;
      m.disc[slot] = -1;
      return [m, { m: structuredCopy(m), old, wasDown: at !== -1 }];
    });
    if (r === undefined) return undefined;
    await this.store.delete(`conn:${r.old}`);
    if (!r.wasDown) await this.closeRaw(r.old, CLOSE_NORMAL);
    await this.store.put(sessKey(sid), asJson({ ...sess, conn }), {
      expiresAtMs: ctx.now() + CONN_TTL_MS,
    });
    rec.sid = sid;
    rec.sim = r.m.sim;
    rec.st = 'match';
    rec.match = sess.match;
    rec.slot = slot;
    return { m: r.m, peer: r.m.conns[1 - slot] as string, wasDown: r.wasDown };
  }

  // ---- queue and rooms --------------------------------------------------------------------------------------------------------

  /**
   * True when `conn` may start looking for a match. A room whose record vanished (expired) and a match that is over (not live, or its
   * peer gone for good) both count as idle again, so the same socket can play the next match.
   */
  private async idleRec(conn: string, ctx: RelayCtx): Promise<boolean> {
    const rec = await this.getConn(conn);
    if (rec === undefined) return false;
    if (rec.st === 'idle') return true;
    let stale = false;
    if (rec.st === 'room' && rec.room !== null)
      stale = (await this.getJson<RoomRec>(`room:${rec.room}`))?.host !== conn;
    else if (rec.st === 'match' && rec.match !== null) {
      const m = await this.getMatch(rec.match);
      stale = m === undefined || !m.live || m.gone[1 - rec.slot] === 1 || m.conns[rec.slot] !== conn;
    }
    if (!stale) return false;
    return (
      (await this.claim(
        conn,
        ctx,
        (r) => r.st === rec.st && r.room === rec.room && r.match === rec.match,
        (r) => Object.assign(r, { st: 'idle', room: null, match: null }),
      )) !== undefined || (await this.getConn(conn))?.st === 'idle'
    );
  }

  private async onQueueJoin(conn: string, ctx: RelayCtx): Promise<void> {
    if (!(await this.idleRec(conn, ctx))) return this.sendError(conn, ErrorCode.busy);
    // Claim the connection first (idle to queued) so two QUEUE_JOINs in flight cannot both queue it.
    const me = await this.claim(
      conn,
      ctx,
      (r) => r.st === 'idle',
      (r) => Object.assign(r, { st: 'queued', qAt: ctx.now() }),
    );
    if (me === undefined) return this.sendError(conn, ErrorCode.busy);
    for (let attempt = 0; attempt < 8; attempt++) {
      const r = await this.mutate<QueueRec, QueueEntry | 'queued' | 'full'>('queue', undefined, (q) => {
        const w = q?.w ?? [];
        const i = w.findIndex((e) => e[0] !== conn && e[1] === me.sim);
        if (i >= 0) return [{ w: w.filter((_, j) => j !== i) }, w[i] as QueueEntry];
        if (w.some((e) => e[0] === conn)) return [KEEP, 'queued'];
        if (w.length >= MAX_QUEUE) return [KEEP, 'full'];
        return [{ w: [...w, [conn, me.sim, ctx.now()]] }, 'queued'];
      });
      if (r === 'full') {
        await this.claim(
          conn,
          ctx,
          (x) => x.st === 'queued',
          (x) => {
            x.st = 'idle';
          },
        );
        return this.sendError(conn, ErrorCode.busy);
      }
      if (r === 'queued') return this.tx(conn, { t: 'queueState', waitingSec: 0 });
      const started = await this.commitMatch(
        r[0],
        conn,
        (x) => x.st === 'queued',
        (x) => x.st === 'queued',
        ctx,
      );
      if (typeof started === 'object') return this.announce(started.m, started.id);
      if (started === 'b') {
        // This connection vanished or left; the partner is queued again.
        await this.mutate<QueueRec, null>('queue', undefined, (q) => [
          { w: [r, ...(q?.w ?? []).filter((e) => e[0] !== r[0])] },
          null,
        ]);
        return;
      }
      // 'a': the partner was stale (left or closed); look for the next one.
    }
    throw new Error('queue contention');
  }

  private async onQueueLeave(conn: string, ctx: RelayCtx): Promise<void> {
    const prev = await this.claim(
      conn,
      ctx,
      (r) => r.st === 'queued',
      (r) => {
        r.st = 'idle';
      },
    );
    if (prev !== undefined) await this.unqueue(conn);
  }

  private async unqueue(conn: string): Promise<void> {
    await this.mutate<QueueRec, null>('queue', undefined, (q) =>
      q === undefined || !q.w.some((e) => e[0] === conn)
        ? [KEEP, null]
        : [{ w: q.w.filter((e) => e[0] !== conn) }, null],
    );
  }

  private async onRoomCreate(conn: string, ctx: RelayCtx): Promise<void> {
    if (!(await this.idleRec(conn, ctx))) return this.sendError(conn, ErrorCode.busy);
    if ((await this.store.keys('room:')).length >= MAX_ROOMS)
      return this.sendError(conn, ErrorCode.fullHouse, 30);
    const me = await this.getConn(conn);
    if (me === undefined) return;
    const exp = ctx.now() + ROOM_TTL_MS;
    const room: RoomRec = { host: conn, sim: me.sim, guest: null, exp };
    for (let i = 0; i < 8; i++) {
      const code = generateRoomCode((n) => ctx.randomInt(n));
      if (
        !(await this.store.put(`room:${code}`, asJson(room), {
          ifVersion: 'absent',
          expiresAtMs: exp,
        }))
      )
        continue;
      const prev = await this.claim(
        conn,
        ctx,
        (r) => r.st === 'idle',
        (r) => Object.assign(r, { st: 'room', room: code }),
      );
      if (prev === undefined) {
        await this.store.delete(`room:${code}`);
        return this.sendError(conn, ErrorCode.busy);
      }
      return this.tx(conn, { t: 'roomCreated', code, ttlSec: ROOM_TTL_MS / 1000 });
    }
    throw new Error('no free room code');
  }

  private async onRoomJoin(conn: string, code: string, ctx: RelayCtx): Promise<void> {
    if (!(await this.idleRec(conn, ctx))) return this.sendError(conn, ErrorCode.busy);
    const me = await this.getConn(conn);
    if (me === undefined) return;
    const key = `room:${code}`;
    const r = await this.mutate<RoomRec, ErrorCodeOrHost>(
      key,
      undefined,
      (room) => {
        if (room === undefined || room.exp <= ctx.now() || !isRoomCode(code))
          return [KEEP, { err: ErrorCode.noRoom }];
        if (room.guest !== null) return [KEEP, { err: ErrorCode.full }];
        if (room.sim !== me.sim) return [KEEP, { err: ErrorCode.simMismatch }];
        room.guest = conn;
        return [room, { host: room.host }];
      },
      true,
    );
    if ('err' in r) return this.sendError(conn, r.err);
    const started = await this.commitMatch(
      r.host,
      conn,
      (x) => x.st === 'room' && x.room === code,
      (x) => x.st === 'idle',
      ctx,
    );
    if (typeof started !== 'object') {
      // Host gone or this connection no longer idle: the room stays open for another guest if the host is still there.
      await this.mutate<RoomRec, null>(key, undefined, (room) =>
        room === undefined || room.guest !== conn ? [KEEP, null] : [{ ...room, guest: null }, null],
      );
      return this.sendError(conn, started === 'a' ? ErrorCode.noRoom : ErrorCode.busy);
    }
    await this.store.delete(key);
    await this.tx(r.host, { t: 'roomPeer', event: RoomPeerEvent.joined });
    await this.announce(started.m, started.id);
  }

  /**
   * Creates the match record and moves both connections into it, each by compare-and-set (`okA`/`okB` say which state may be claimed),
   * so a racing leave, close or second join cannot be overwritten. `a` gets slot 0. Returns 'a' or 'b' when that side was no longer
   * claimable (nothing is changed then).
   */
  private async commitMatch(
    a: string,
    b: string,
    okA: (r: ConnRec) => boolean,
    okB: (r: ConnRec) => boolean,
    ctx: RelayCtx,
  ): Promise<{ m: MatchRec; id: string } | 'a' | 'b'> {
    const ra = await this.getConn(a);
    if (ra === undefined || !okA(ra)) return 'a';
    const rb = await this.getConn(b);
    if (rb === undefined || !okB(rb)) return 'b';
    const m: MatchRec = {
      matchId: await this.nextMatchId(),
      seed: ctx.randomInt(0x100000000),
      sim: ra.sim,
      conns: [a, b],
      sids: [ra.sid, rb.sid],
      disc: [-1, -1],
      gone: [0, 0],
      hashes: [],
      results: [null, null],
      live: true,
    };
    let id: string;
    do id = `${ctx.randomInt(0x100000000).toString(16)}${ctx.randomInt(0x100000000).toString(16)}`;
    while (
      !(await this.store.put(`match:${id}`, asJson(m), {
        ifVersion: 'absent',
        expiresAtMs: ctx.now() + MATCH_RECORD_TTL_MS,
      }))
    );
    const toMatch =
      (slot: number) =>
      (r: ConnRec): void => {
        Object.assign(r, { st: 'match', room: null, match: id, slot });
      };
    const pa = await this.claim(a, ctx, okA, toMatch(0));
    if (pa === undefined) {
      await this.store.delete(`match:${id}`);
      return 'a';
    }
    const pb = await this.claim(b, ctx, okB, toMatch(1));
    if (pb === undefined) {
      await this.claim(a, ctx, (r) => r.st === 'match' && r.match === id, (r) => Object.assign(r, pa));
      await this.store.delete(`match:${id}`);
      return 'b';
    }
    for (const slot of [0, 1])
      await this.store.put(
        sessKey(m.sids[slot] as number),
        asJson({ conn: m.conns[slot], match: id, slot, idn: (slot === 0 ? pa : pb).idn }),
        { expiresAtMs: ctx.now() + CONN_TTL_MS },
      );
    return { m, id };
  }

  private async announce(m: MatchRec, id: string): Promise<void> {
    for (const slot of [0, 1]) await this.tx(m.conns[slot] as string, this.matchStart(m, slot));
    this.options.onEvent?.({ kind: 'match-start', match: id });
  }

  /** Per-store match counter, 1..255 (the wire `matchId` is a u8; 0 is never used), +1 per match. */
  private nextMatchId(): Promise<number> {
    return this.mutate<number, number>(MATCH_COUNTER_KEY, undefined, (cur) => {
      const n = ((cur ?? 0) % 255) + 1;
      return [n, n];
    });
  }

  private matchStart(m: MatchRec, slot: number): Frame {
    return {
      t: 'matchStart',
      matchId: m.matchId,
      slot,
      seed: m.seed,
      inputDelay: this.options.inputDelay ?? DEFAULT_INPUT_DELAY,
      simVersion: m.sim,
      batchEvery: this.options.batchEvery ?? DEFAULT_BATCH_EVERY,
    };
  }

  // ---- match phase ------------------------------------------------------------------------------------------------------------

  private async matchFor(conn: string, rec: ConnRec): Promise<MatchRec | undefined> {
    if (rec.st !== 'match' || rec.match === null) return undefined;
    const m = await this.getMatch(rec.match);
    return m?.conns[rec.slot] === conn ? m : undefined;
  }

  /** BATCH, PAUSE and SETUP go to the peer byte for byte (the server never renumbers `seq`); a stale matchId or an absent peer drops them. */
  private async onRelayFrame(conn: string, rec: ConnRec, f: Frame, raw: Uint8Array): Promise<void> {
    const m = await this.matchFor(conn, rec);
    if (m === undefined) return this.fail(conn, ErrorCode.badFrame, true);
    const matchId = f.t === 'batch' ? f.match : f.t === 'pause' ? f.matchId : m.matchId;
    const other = 1 - rec.slot;
    if (matchId !== m.matchId || m.disc[other] !== -1 || m.gone[other] === 1) return;
    await this.txRaw(m.conns[other] as string, raw);
  }

  private async onHash(
    conn: string,
    rec: ConnRec,
    f: FrameFields['hash'],
    ctx: RelayCtx,
  ): Promise<void> {
    const m0 = await this.matchFor(conn, rec);
    if (m0 === undefined) return this.fail(conn, ErrorCode.badFrame, true);
    if (f.matchId !== m0.matchId) return;
    const bad = await this.mutate<MatchRec, { conns: [string, string]; matchId: number } | undefined>(
      `match:${rec.match ?? ''}`,
      ctx.now() + MATCH_RECORD_TTL_MS,
      (m) => {
        if (m === undefined || !m.live) return [KEEP, undefined];
        let e = m.hashes.find((x) => x[0] === f.tick);
        if (e === undefined) {
          e = [f.tick, -1, -1];
          m.hashes.push(e);
        }
        e[1 + rec.slot] = f.hash;
        let diverged = false;
        if (e[1] !== -1 && e[2] !== -1) {
          m.hashes = m.hashes.filter((x) => x !== e);
          if (e[1] !== e[2]) diverged = true;
        }
        if (m.hashes.length > MAX_PENDING_HASHES) m.hashes = m.hashes.slice(-MAX_PENDING_HASHES);
        if (diverged) m.live = false;
        return [m, diverged ? { conns: m.conns, matchId: m.matchId } : undefined];
      },
    );
    if (bad === undefined) return;
    this.options.onEvent?.({
      kind: 'desync',
      match: rec.match as string,
      tick: f.tick,
      by: 'server',
    });
    // The spec has no frame for "the server saw your hashes differ"; RESULT_ACK disagreed (status 2) is the closest, sent to both slots.
    for (const c of bad.conns)
      await this.tx(c, { t: 'resultAck', matchId: bad.matchId, status: ResultStatus.disagreed });
  }

  private async onDesync(
    conn: string,
    rec: ConnRec,
    f: FrameFields['desync'],
    ctx: RelayCtx,
  ): Promise<void> {
    const m0 = await this.matchFor(conn, rec);
    if (m0 === undefined) return this.fail(conn, ErrorCode.badFrame, true);
    if (f.matchId !== m0.matchId) return;
    const first = await this.mutate<MatchRec, boolean>(
      `match:${rec.match ?? ''}`,
      ctx.now() + MATCH_RECORD_TTL_MS,
      (m) => {
        if (m === undefined || !m.live) return [KEEP, false];
        m.live = false;
        return [m, true];
      },
    );
    if (first)
      this.options.onEvent?.({
        kind: 'desync',
        match: rec.match as string,
        tick: f.tick,
        by: rec.slot,
      });
  }

  /** Both sides submit; equal winner, ticks and finalHash agree (RESULT_ACK 0 to both), otherwise 2. A retry gets the current status again. */
  private async onResult(
    conn: string,
    rec: ConnRec,
    f: FrameFields['result'],
    ctx: RelayCtx,
  ): Promise<void> {
    const m0 = await this.matchFor(conn, rec);
    if (m0 === undefined) return this.fail(conn, ErrorCode.badFrame, true);
    if (f.matchId !== m0.matchId) return;
    const mine: Res = [f.winner, f.reason, f.ticks, f.finalHash];
    const r = await this.mutate<MatchRec, { status: number; peer: string; completed: boolean }>(
      `match:${rec.match ?? ''}`,
      ctx.now() + MATCH_RECORD_TTL_MS,
      (m) => {
        const cur = m ?? m0;
        const had = cur.results[rec.slot] !== null;
        cur.results[rec.slot] ??= mine;
        const a = cur.results[0];
        const b = cur.results[1];
        const both = a !== null && b !== null;
        // A peer that is gone for good can never submit: resolve as disagreed at once instead of waiting for the record TTL.
        const peerGone = cur.gone[1 - rec.slot] === 1;
        const status = !both
          ? peerGone
            ? ResultStatus.disagreed
            : ResultStatus.waiting
          : a[0] === b[0] && a[2] === b[2] && a[3] === b[3]
            ? ResultStatus.agreed
            : ResultStatus.disagreed;
        if (both || peerGone) cur.live = false;
        return [
          had ? KEEP : cur,
          {
            status,
            peer: cur.conns[1 - rec.slot] as string,
            completed: (both || peerGone) && !had,
          },
        ];
      },
    );
    await this.tx(conn, { t: 'resultAck', matchId: m0.matchId, status: r.status });
    if (!r.completed) return;
    await this.tx(r.peer, { t: 'resultAck', matchId: m0.matchId, status: r.status });
    this.options.onEvent?.({
      kind: 'result',
      match: rec.match as string,
      agreed: r.status === ResultStatus.agreed,
      winner: f.winner,
      ticks: f.ticks,
      finalHash: f.finalHash,
    });
  }

  // ---- storage and sending helpers --------------------------------------------------------------------------------------------

  private async getJson<T>(key: string): Promise<T | undefined> {
    return (await this.store.get(key))?.value as T | undefined;
  }
  private getConn(conn: string): Promise<ConnRec | undefined> {
    return this.getJson<ConnRec>(`conn:${conn}`);
  }
  private getMatch(id: string): Promise<MatchRec | undefined> {
    return this.getJson<MatchRec>(`match:${id}`);
  }
  private putConn(conn: string, rec: ConnRec, ctx: RelayCtx, absentOnly = false): Promise<boolean> {
    return this.store.put(`conn:${conn}`, asJson(rec), {
      expiresAtMs: ctx.now() + CONN_TTL_MS,
      ...(absentOnly ? { ifVersion: 'absent' as const } : {}),
    });
  }
  /**
   * Compare-and-set on a connection record: when it exists and `expect` holds, `apply` edits it and it is written under the version
   * that was read (retried on conflict). Returns a copy of the record as it was BEFORE the edit, undefined when nothing was changed.
   * Connection records are never written any other way after HELLO, so a racing leave, close or pairing cannot be overwritten.
   */
  private claim(
    conn: string,
    ctx: RelayCtx,
    expect: (r: ConnRec) => boolean,
    apply: (r: ConnRec) => void,
  ): Promise<ConnRec | undefined> {
    return this.mutate<ConnRec, ConnRec | undefined>(
      `conn:${conn}`,
      ctx.now() + CONN_TTL_MS,
      (cur) => {
        if (cur === undefined || !expect(cur)) return [KEEP, undefined];
        const prev = structuredCopy(cur);
        apply(cur);
        return [cur, prev];
      },
    );
  }
  private async sidOf(matchKey: string, slot: number): Promise<number> {
    return (await this.getJson<MatchRec>(matchKey))?.sids[slot] ?? 0;
  }

  /** Compare-and-set loop. `fn` may mutate its argument; it returns the value to store (KEEP = no write, undefined = delete) and a result. */
  private async mutate<T, R>(
    key: string,
    expiresAtMs: number | undefined,
    fn: (cur: T | undefined) => readonly [T | undefined | typeof KEEP, R],
    forceAbsentOk = false,
  ): Promise<R> {
    for (let i = 0; i < 8; i++) {
      const item = await this.store.get(key);
      const cur = item === undefined ? undefined : (structuredCopy(item.value) as unknown as T);
      const [next, out] = fn(cur);
      if (next === KEEP) return out;
      if (next === undefined) {
        await this.store.delete(key);
        return out;
      }
      if (
        await this.store.put(key, asJson(next), {
          ifVersion: item === undefined ? 'absent' : item.version,
          ...(expiresAtMs === undefined ? {} : { expiresAtMs }),
        })
      )
        return out;
    }
    if (forceAbsentOk) return fn(undefined)[1];
    throw new Error('store contention');
  }

  private async tx(conn: string, f: Frame): Promise<void> {
    await this.txRaw(conn, encodeFrame(f));
  }
  private async txRaw(conn: string, data: Uint8Array): Promise<void> {
    try {
      await this.sender.send(conn, data);
    } catch {
      /* the peer is gone; its close event handles the rest */
    }
  }
  private sendError(conn: string, code: number, retryAfterSec = 0, detail = 0): Promise<void> {
    return this.tx(conn, { t: 'error', code, retryAfterSec, detail });
  }
  private async closeRaw(conn: string, wsCode: number): Promise<void> {
    try {
      await this.sender.close(conn, wsCode);
    } catch {
      /* already closed */
    }
  }
  private async closeConn(conn: string, code: number): Promise<void> {
    try {
      await this.sender.close(conn, closeCodeFor(code));
    } catch {
      /* already closed */
    }
  }
  private async fail(conn: string, code: number, close: boolean): Promise<void> {
    await this.sendError(conn, code);
    if (close) await this.closeConn(conn, code);
  }
}

type ErrorCodeOrHost = { readonly err: number } | { readonly host: string };
const structuredCopy = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
export { ResultReason };
