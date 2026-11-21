import { describe, expect, it } from 'vitest';
import { characterId } from '../../core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../core/flags';
import { DEFAULT_PAUSE_TIMEOUT_TICKS, DEFAULT_TIMEOUT_TICKS, LockstepSession } from '../../core/net/session';
import {
  DISCONNECT_GRACE_MS,
  decodeText,
  encodeFrame,
  FrameType,
  encodeText,
  PROTOCOL_VERSION,
  ResultReason,
  ResultStatus,
  RelayCore,
  type Frame,
  type RelayCtx,
  type RelayEvent,
} from '../../core/relay';
import { InMemoryStore, LoopbackSender } from '../../core/relay/testing';
import { hash } from '../../core/sim/hash';
import { createMatch, type MatchSetup } from '../../core/sim/match';
import type { SimWorld } from '../../core/sim/world';
import { SIM_VERSION } from '../../core/version';
import { WebSocketTransport } from '../../game/net/ws/transport';
import { FakeSocket } from './fake-relay';
import { botScripts, type Script } from './net-match';

/**
 * Online scenarios on a virtual 50 Hz clock: two LockstepSessions over WebSocketTransport, the real RelayCore, InMemoryStore and
 * LoopbackSender (no network, no real addresses). Figures are measurements of this harness, not of a backend.
 */
const TICK_MS = 20;
const BASE = 1_000_000;
const TICKS = 300;
const TIMEOUT_TICKS = DEFAULT_TIMEOUT_TICKS;
const PAUSE_TIMEOUT_TICKS = DEFAULT_PAUSE_TIMEOUT_TICKS;

interface Side {
  readonly sock: FakeSocket;
  readonly transport: WebSocketTransport;
  /** Connection name the relay knows this side by (changes on resume). */
  conn: string;
  sessionId: number;
}
interface Game {
  readonly matchId: number;
  readonly setup: MatchSetup;
  readonly script: Script;
  readonly worlds: readonly [SimWorld, SimWorld];
  readonly sessions: readonly [LockstepSession, LockstepSession];
  readonly hashed: [number, number];
}

class Rig {
  readonly clock = { ms: 0 };
  readonly sender = new LoopbackSender();
  readonly events: RelayEvent[] = [];
  readonly core: RelayCore;
  readonly sides: readonly [Side, Side];
  readonly ctx: RelayCtx = { now: () => BASE + this.clock.ms, randomInt: (n) => { this.lcg = (Math.imul(this.lcg, 1103515245) + 12345) >>> 0; return this.lcg % n; } };
  private lcg = 7;
  /** Frames each side sent, by bytes, in order (BATCH seq lives in bytes 1..4). */
  readonly sentBy: [Uint8Array[], Uint8Array[]] = [[], []];
  private up: Array<{ conn: string; bytes: Uint8Array }> = [];

  constructor() {
    this.core = new RelayCore(new InMemoryStore(() => this.ctx.now()), this.sender, { onEvent: (e) => this.events.push(e) });
    const mk = (conn: string): Side => {
      const sock = new FakeSocket();
      return { sock, transport: new WebSocketTransport(sock, () => this.clock.ms), conn, sessionId: 0 };
    };
    this.sides = [mk('a'), mk('b')];
    this.sides.forEach((s, i) => { this.wire(s, i as 0 | 1); });
  }

  private wire(s: Side, i: 0 | 1): void {
    this.sender.listen(s.conn, (text) => { this.toSocket(s, text); });
    s.sock.onSend = (bytes) => { this.sentBy[i].push(bytes); this.up.push({ conn: s.conn, bytes }); };
  }

  /** Like the real client: only match frames reach the transport; WELCOME, MATCH_START, PEER_STATUS and RESULT_ACK are the client's own. */
  toSocket(s: Side, text: string): void {
    const t = decodeText(text)?.[0];
    if (t === FrameType.batch || t === FrameType.pause || t === FrameType.setup || t === FrameType.pong || t === FrameType.error) s.sock.deliver(text);
  }

  async flush(): Promise<void> {
    while (this.up.length > 0) {
      const u = this.up.shift() as { conn: string; bytes: Uint8Array };
      await this.core.handle(u.conn, encodeText(u.bytes), this.ctx);
    }
  }

  private async frame(conn: string, f: Frame): Promise<void> {
    await this.core.handle(conn, encodeText(encodeFrame(f)), this.ctx);
  }

  framesFor(conn: string): Frame[] { return this.sender.framesFor(conn); }

  async hello(): Promise<void> {
    for (const s of this.sides) await this.frame(s.conn, { t: 'hello', ver: PROTOCOL_VERSION, simVersion: SIM_VERSION, resumeSession: 0 });
    this.sides.forEach((s) => {
      const w = this.framesFor(s.conn).find((f) => f.t === 'welcome');
      if (w?.t !== 'welcome') throw new Error('no welcome');
      s.sessionId = w.sessionId;
    });
  }

  /** QUEUE_JOIN on both sockets, then a fresh world and session per side from the MATCH_START each got. */
  async newMatch(): Promise<Game> {
    this.sender.clear();
    for (const s of this.sides) await this.frame(s.conn, { t: 'queueJoin', mode: 0 });
    const starts = this.sides.map((s) => this.framesFor(s.conn).find((f) => f.t === 'matchStart'));
    const ms = starts[0];
    if (ms?.t !== 'matchStart' || starts[1]?.t !== 'matchStart') throw new Error('no match started');
    const setup: MatchSetup = {
      simVersion: SIM_VERSION, seed: ms.seed, flags: DEFAULT_SIM_FLAGS, chapter: 1, difficulty: 1,
      p1: [{ character: characterId('lavax'), xp: 20 }], p2: [{ character: characterId('pax'), xp: 20 }],
    };
    for (const s of this.sides) s.transport.startMatch(ms.matchId, false);
    const worlds = [createMatch(setup), createMatch(setup)] as const;
    const sessions = ([0, 1] as const).map(
      (side) => new LockstepSession({ world: worlds[side], side, transport: this.sides[side].transport, match: ms.matchId, inputDelay: ms.inputDelay, tickLimit: TICKS, adaptive: false, rollbackWindow: 6, batchEvery: ms.batchEvery }),
    ) as [LockstepSession, LockstepSession];
    return { matchId: ms.matchId, setup, script: botScripts(setup, TICKS + 200), worlds, sessions, hashed: [0, 0] };
  }

  /** One wall tick: advance the clock, update the sessions in `who`, send new checkpoints as HASH, let the relay handle it all. */
  async tick(g: Game, who: readonly (0 | 1)[] = [0, 1]): Promise<void> {
    this.clock.ms += TICK_MS;
    for (const i of who) {
      const s = g.sessions[i];
      s.update(g.script[i][s.nextStampTick] ?? 0);
      const cps = s.checkpoints();
      for (; g.hashed[i] < cps.length; g.hashed[i]++) {
        const [tick, h] = cps[g.hashed[i]] as readonly [number, number];
        this.sides[i].transport.sendHash(g.matchId, tick, h);
      }
    }
    await this.flush();
  }

  async play(g: Game, until: () => boolean = () => g.sessions.every((s) => s.status === 'ended'), max = TICKS * 10): Promise<number> {
    let n = 0;
    while (n < max && !until()) { n++; await this.tick(g); }
    return n;
  }

  /** Both sides report the natural end; the relay compares winner, ticks and final hash. */
  async report(g: Game): Promise<void> {
    for (const i of [0, 1] as const) {
      const s = g.sessions[i];
      this.sides[i].transport.sendResult(g.matchId, s.winner ?? 2, ResultReason.natural, s.simTick, hash(g.worlds[i].state));
    }
    await this.flush();
  }

  acks(conn: string): number[] {
    return this.framesFor(conn).flatMap((f) => (f.t === 'resultAck' ? [f.status] : []));
  }

  batchSeqs(i: 0 | 1): number[] {
    return this.sentBy[i].flatMap((b) => (b[0] === 0x40 ? [new DataView(b.buffer, b.byteOffset).getUint32(1)] : []));
  }
}

const hashes = (g: Game): [number, number] => [hash(g.worlds[0].state), hash(g.worlds[1].state)];

describe('online scenarios on a virtual clock (measurement, in-process relay)', () => {
  it('1. resumes mid-match after a socket drop: seq continues, hashes equal, no second match', async () => {
    const r = new Rig();
    await r.hello();
    const g = await r.newMatch();
    const a = r.sides[0];
    await r.play(g, () => g.sessions[0].simTick >= 100);
    const before = r.batchSeqs(0);
    const lastBefore = before[before.length - 1] as number;
    expect(before[0]).toBe(0);

    // Drop A's socket for 2 s (inside the relay's grace), B keeps playing alone.
    const DROP_MS = 2000;
    expect(DROP_MS).toBeLessThan(DISCONNECT_GRACE_MS);
    a.sock.readyState = 3;
    await r.core.handleClose(a.conn, r.ctx);
    for (let t = 0; t < DROP_MS; t += TICK_MS) await r.tick(g);
    expect(r.framesFor('b').some((f) => f.t === 'peerStatus')).toBe(true);
    const sentWhileDown = r.batchSeqs(0).length;

    // Reconnect: new connection, same session id; the transport and sessions are kept.
    a.conn = 'a2';
    a.sock.readyState = 1;
    r.sender.listen('a2', (text) => { r.toSocket(a, text); });
    await r.core.handle('a2', encodeText(encodeFrame({ t: 'hello', ver: PROTOCOL_VERSION, simVersion: SIM_VERSION, resumeSession: a.sessionId })), r.ctx);
    const welcome = r.framesFor('a2').find((f) => f.t === 'welcome');
    const restart = r.framesFor('a2').find((f) => f.t === 'matchStart');
    expect(welcome?.t === 'welcome' && welcome.resumed).toBe(1);
    expect(restart?.t === 'matchStart' && restart.matchId).toBe(g.matchId);
    a.transport.startMatch(g.matchId, true);
    expect(r.framesFor('b').some((f) => f.t === 'peerStatus' && f.event === 1)).toBe(true);

    await r.play(g);
    const after = r.batchSeqs(0).slice(sentWhileDown);
    expect(after.length).toBeGreaterThan(0);
    expect(after[0]).toBeGreaterThan(lastBefore); // Continues; a reset would send 0 again.
    expect(g.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
    expect(g.sessions[0].desync ?? g.sessions[1].desync).toBeUndefined();
    const [h0, h1] = hashes(g);
    expect(h0).toBe(h1);
    expect(r.events.filter((e) => e.kind === 'peer-gone')).toHaveLength(0);
    await r.report(g);
    expect(r.events.find((e) => e.kind === 'result')).toMatchObject({ agreed: true });
    expect(r.sides.every((s) => s.transport.malformed === 0)).toBe(true);
  });

  it('2. a silent peer is forfeited after 250 update ticks without a packet', async () => {
    const r = new Rig();
    await r.hello();
    const g = await r.newMatch();
    await r.play(g, () => g.sessions[0].simTick >= 40);
    // B goes silent (its updates stop); only A keeps calling update.
    let silent = 0;
    while (g.sessions[0].status !== 'forfeit' && silent < TIMEOUT_TICKS * 2) { silent++; await r.tick(g, [0]); }
    // The first silent update still receives B's last packet, so the count restarts there: forfeit on the update after TIMEOUT_TICKS more.
    expect(silent).toBe(1 + TIMEOUT_TICKS + 1);
    expect(g.sessions[0].forfeitReason).toBe('timeout');
    expect(g.sessions[0].winner).toBe(0);
    r.sides[0].transport.sendResult(g.matchId, 0, ResultReason.timeout, g.sessions[0].simTick, hash(g.worlds[0].state));
    await r.flush();
    expect(r.acks('a')).toEqual([ResultStatus.waiting]); // B never reports.
  });

  it('3. a hidden peer survives 1500 ticks; a silent one that did not say it is hidden does not', async () => {
    const r = new Rig();
    await r.hello();
    const g = await r.newMatch();
    await r.play(g, () => g.sessions[0].simTick >= 40);
    g.sessions[1].setHidden(true);
    await r.flush();
    let n = 0;
    for (; n < PAUSE_TIMEOUT_TICKS * 2 && g.sessions[0].status !== 'forfeit'; n++) await r.tick(g, [0]);
    expect(n).toBe(1 + PAUSE_TIMEOUT_TICKS + 1); // Same off-by-one as scenario 2: the first update hears the PAUSE flag.
    expect(g.sessions[0].forfeitReason).toBe('timeout'); // Hidden long enough is still gone.

    // A hidden tab that updates once a second never times out and the match ends with equal hashes.
    const r2 = new Rig();
    await r2.hello();
    const g2 = await r2.newMatch();
    await r2.play(g2, () => g2.sessions[0].simTick >= 40);
    g2.sessions[1].setHidden(true);
    for (let k = 0; k < PAUSE_TIMEOUT_TICKS; k++) await r2.tick(g2, k % 50 === 0 ? [0, 1] : [0]);
    expect(g2.sessions[0].status).not.toBe('forfeit');
    g2.sessions[1].setHidden(false);
    await r2.play(g2);
    expect(g2.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
    expect(hashes(g2)[0]).toBe(hashes(g2)[1]);
  });

  it('4. a desync gets an unsolicited RESULT_ACK disagreed on both sockets', async () => {
    const r = new Rig();
    await r.hello();
    const g = await r.newMatch();
    await r.play(g, () => g.sessions[0].simTick >= 55);
    expect(r.acks('a')).toEqual([]);
    const x = g.worlds[1].state.x;
    x[0] = (x[0] ?? 0) + 1;
    await r.play(g, () => g.sessions.every((s) => s.status === 'desync' || s.status === 'ended'), 400);
    expect(g.sessions.map((s) => s.status)).toEqual(['desync', 'desync']);
    expect(g.sessions[0].desync?.tick).toBe(g.sessions[1].desync?.tick);
    expect(r.events.find((e) => e.kind === 'desync')).toMatchObject({ by: 'server' });
    // Neither side sent a RESULT: both acks are unsolicited.
    expect(r.sentBy.flat().some((b) => b[0] === 0x50)).toBe(false);
    expect(r.acks('a')).toEqual([ResultStatus.disagreed]);
    expect(r.acks('b')).toEqual([ResultStatus.disagreed]);
    expect(r.sides.every((s) => s.transport.malformed === 0)).toBe(true);
  });

  it('5. a rematch on the same sockets gets a new matchId and restarts seq at 0', async () => {
    const r = new Rig();
    await r.hello();
    const g1 = await r.newMatch();
    await r.play(g1);
    expect(hashes(g1)[0]).toBe(hashes(g1)[1]);
    await r.report(g1);
    expect(r.acks('a')).toEqual([ResultStatus.waiting, ResultStatus.agreed]); // A reported first.
    expect(r.acks('b')).toEqual([ResultStatus.agreed]);
    const seqs1 = r.batchSeqs(0);
    expect(seqs1.length).toBeGreaterThan(1);
    const sentBefore = r.sentBy[0].length;

    const g2 = await r.newMatch();
    expect(g2.matchId).not.toBe(g1.matchId);
    await r.play(g2);
    expect(g2.sessions.map((s) => s.status)).toEqual(['ended', 'ended']);
    expect(hashes(g2)[0]).toBe(hashes(g2)[1]);
    const second = r.sentBy[0].slice(sentBefore).filter((b) => b[0] === 0x40);
    expect(new DataView(second[0]?.buffer as ArrayBuffer, second[0]?.byteOffset).getUint32(1)).toBe(0);
    expect(r.sides.every((s) => s.transport.staleMatch === 0 && s.transport.malformed === 0)).toBe(true);
    await r.report(g2);
    expect(r.events.filter((e) => e.kind === 'result')).toHaveLength(2);
    expect(r.events.filter((e) => e.kind === 'result')).toEqual([expect.objectContaining({ agreed: true }), expect.objectContaining({ agreed: true })]);
  });
});
