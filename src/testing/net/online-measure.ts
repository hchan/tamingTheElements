import { LockstepSession } from '../../core/net/session';
import { characterId } from '../../core/data/ids';
import { DEFAULT_SIM_FLAGS } from '../../core/flags';
import { seedSfc32 } from '../../core/rng/seed';
import {
  encodeFrame,
  PROTOCOL_VERSION,
  RelayCore,
  type Frame,
  type RelayCtx,
  type RelayEvent,
} from '../../core/relay';
import { InMemoryStore, LoopbackSender } from '../../core/relay/testing';
import { hash } from '../../core/sim/hash';
import { createMatch, type MatchSetup } from '../../core/sim/match';
import { SIM_VERSION } from '../../core/version';
import { linkQuality, medianRtt, type LinkQuality } from '../../game/net/link-quality';
import { WebSocketTransport } from '../../game/net/ws/transport';
import { FakeSocket } from './fake-relay';
import { botScripts, referenceHash } from './net-match';

/** What the numbers mean: virtual 50 Hz clock, in-process relay, no real network. */
export const MEASUREMENT_LABEL = 'measurement (local harness, virtual clock)';
/** Figures from docs/ONLINE-PROTOCOL.md section 9; they are guesses about a backend, not results of this harness. */
export const ESTIMATES = {
  label: 'estimate',
  billedMsgsPerSecPerMatch: 'about 67 billed msgs/s per match',
  oneWayLatencyServerless: '90-120 ms one-way on serverless',
} as const;

/** One-way client-to-client delay through the relay, split evenly over the two legs. Percentages are 0..100. */
export interface LinkProfile {
  readonly latencyMs: number;
  readonly jitterMs: number;
  /** Frames delivered twice (each leg). */
  readonly dupPct: number;
  /** Frames held back an extra 2 ticks on the relay-to-client leg (so they arrive out of order). */
  readonly reorderPct: number;
  /** Frames dropped (each leg); a real WebSocket is reliable, so keep 0 except to stress the reorder buffer. */
  readonly lossPct: number;
}

export const PROFILES: Readonly<Record<'ideal' | 'typical' | 'bad', LinkProfile>> = {
  ideal: { latencyMs: 0, jitterMs: 0, dupPct: 0, reorderPct: 0, lossPct: 0 },
  typical: { latencyMs: 100, jitterMs: 20, dupPct: 0, reorderPct: 0, lossPct: 0 },
  bad: { latencyMs: 120, jitterMs: 60, dupPct: 2, reorderPct: 5, lossPct: 0 },
};

export interface MeasureOptions {
  /** Match length in sim ticks (default 500 = 10 s). */
  readonly ticks?: number;
  readonly profile?: LinkProfile;
  /** Ticks between packets, given to the relay (MATCH_START carries it) and to both sessions (default 1). */
  readonly batchEvery?: number;
  readonly inputDelay?: number;
  readonly rollbackWindow?: number;
  /** Seeds the link impairments and the relay's random numbers. */
  readonly netSeed?: number;
}

export interface Dist {
  readonly samples: number;
  readonly p50: number;
  readonly p95: number;
  readonly max: number;
}
export interface Rate {
  readonly count: number;
  readonly perSec: number;
}

export interface MeasureReport {
  readonly label: typeof MEASUREMENT_LABEL;
  readonly options: { readonly ticks: number; readonly batchEvery: number; readonly inputDelay: number; readonly rollbackWindow: number; readonly profile: LinkProfile };
  /** Sim seconds from the first update until both sessions ended. */
  readonly durationSec: number;
  readonly oneWayMs: Dist;
  readonly messages: { readonly total: Rate; readonly clientToRelay: Rate; readonly relayToClient: Rate; readonly bySlot: readonly [Rate, Rate] };
  readonly bytes: { readonly total: Rate; readonly clientToRelay: Rate; readonly relayToClient: Rate };
  readonly sessions: readonly { readonly stalls: number; readonly rollbacks: number; readonly resimTicks: number; readonly maxRollbackDepth: number; readonly packetsSent: number }[];
  readonly rollbacks: number;
  readonly stalls: number;
  readonly finalHashes: readonly [number, number];
  readonly finalHashEqual: boolean;
  readonly matchesOfflineReference: boolean;
  readonly relayAgreed: boolean;
  readonly link: { readonly medianRttMs: number | undefined; readonly grade: LinkQuality | undefined };
  readonly estimates: typeof ESTIMATES;
}

const TICK_MS = 20;
const PING_MS = 2000;
const BATCH = 0x40;
const SLOT_CONN = ['a', 'b'] as const;

function dist(xs: readonly number[]): Dist {
  if (xs.length === 0) return { samples: 0, p50: 0, p95: 0, max: 0 };
  const s = [...xs].sort((a, b) => a - b);
  const at = (q: number): number => s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)] as number;
  return { samples: s.length, p50: at(0.5), p95: at(0.95), max: s[s.length - 1] as number };
}

interface Due {
  readonly at: number;
  readonly order: number;
  /** 'up': client to relay (call `handle`); 'down': relay to client (socket delivery). */
  readonly up: boolean;
  readonly slot: 0 | 1;
  readonly bytes: Uint8Array;
}

/** Plays one match between two LockstepSessions over WebSocketTransport, RelayCore, InMemoryStore and LoopbackSender on a virtual clock. */
export async function measureMatch(o: MeasureOptions = {}): Promise<MeasureReport> {
  const ticks = o.ticks ?? 500;
  const profile = o.profile ?? PROFILES.typical;
  const batchEvery = o.batchEvery ?? 1;
  const rollbackWindow = o.rollbackWindow ?? 6;
  const rng = seedSfc32(o.netSeed ?? 11, 'online-measure');
  const clock = { ms: 0 };
  const BASE = 1_000_000;
  const ctx: RelayCtx = { now: () => BASE + clock.ms, randomInt: (n) => rng.nextU32() % n };
  const events: RelayEvent[] = [];
  const sender = new LoopbackSender();
  const core = new RelayCore(new InMemoryStore(() => ctx.now()), sender, {
    batchEvery,
    ...(o.inputDelay === undefined ? {} : { inputDelay: o.inputDelay }),
    onEvent: (e) => events.push(e),
  });

  // Prelude (no impairment, not measured): HELLO and the queue until MATCH_START.
  const send = (conn: string, f: Frame): Promise<void> => core.handle(conn, encodeFrame(f), ctx);
  for (const c of SLOT_CONN) await send(c, { t: 'hello', ver: PROTOCOL_VERSION, simVersion: SIM_VERSION, resumeSession: 0 });
  for (const c of SLOT_CONN) await send(c, { t: 'queueJoin', mode: 0 });
  const starts = SLOT_CONN.map((c) => sender.framesFor(c).find((f) => f.t === 'matchStart'));
  const ms = starts[0];
  if (ms?.t !== 'matchStart' || starts[1]?.t !== 'matchStart') throw new Error('relay did not start a match');
  const setup: MatchSetup = {
    simVersion: SIM_VERSION,
    seed: ms.seed,
    flags: DEFAULT_SIM_FLAGS,
    chapter: 1,
    difficulty: 1,
    p1: [{ character: characterId('lavax'), xp: 20 }],
    p2: [{ character: characterId('pax'), xp: 20 }],
  };
  const matchId = ms.matchId;
  const inputDelay = ms.inputDelay;
  const script = botScripts(setup, ticks + 200);

  // Network: every frame becomes a Due entry after the profile's leg delay.
  const queue: Due[] = [];
  let order = 0;
  const leg = (extra = 0): number => Math.round(profile.latencyMs / 2) + (profile.jitterMs > 0 ? rng.int(Math.round(profile.jitterMs / 2) + 1) : 0) + extra;
  const pct = (p: number): boolean => p > 0 && rng.int(100) < p;
  const schedule = (up: boolean, slot: 0 | 1, bytes: Uint8Array): void => {
    if (pct(profile.lossPct)) return;
    const extra = !up && pct(profile.reorderPct) ? 2 * TICK_MS : 0;
    queue.push({ at: clock.ms + leg(extra), order: order++, up, slot, bytes });
    if (pct(profile.dupPct)) queue.push({ at: clock.ms + leg(extra), order: order++, up, slot, bytes });
  };

  const sockets = [new FakeSocket(), new FakeSocket()] as const;
  const transports = sockets.map((s) => new WebSocketTransport(s, () => clock.ms)) as [WebSocketTransport, WebSocketTransport];
  for (const t of transports) t.startMatch(matchId, false);
  const sentAt = new Map<string, number>();
  const seen = new Set<string>();
  const latencies: number[] = [];
  const msgs: { up: [number, number]; down: [number, number] } = { up: [0, 0], down: [0, 0] };
  const bytes = { up: 0, down: 0 };
  const seqOf = (b: Uint8Array): number => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(1);

  SLOT_CONN.forEach((conn, i) => {
    const slot = i as 0 | 1;
    sockets[slot].onSend = (b) => {
      if (b[0] === BATCH) sentAt.set(`${String(slot)}:${String(seqOf(b))}`, clock.ms);
      schedule(true, slot, b);
    };
    sender.listen(conn, (b) => {
      msgs.down[slot]++;
      bytes.down += b.length;
      schedule(false, slot, b);
    });
  });

  const drain = async (): Promise<void> => {
    for (;;) {
      let best = -1;
      for (let i = 0; i < queue.length; i++) {
        const d = queue[i] as Due;
        if (d.at > clock.ms) continue;
        const b = best < 0 ? undefined : (queue[best] as Due);
        if (b === undefined || d.at < b.at || (d.at === b.at && d.order < b.order)) best = i;
      }
      if (best < 0) return;
      const d = queue.splice(best, 1)[0] as Due;
      if (d.up) {
        msgs.up[d.slot]++;
        bytes.up += d.bytes.length;
        await core.handle(SLOT_CONN[d.slot], d.bytes.slice(), ctx);
      } else {
        if (d.bytes[0] === BATCH) {
          const key = `${String(1 - d.slot)}:${String(seqOf(d.bytes))}`;
          const t0 = sentAt.get(key);
          if (t0 !== undefined && !seen.has(`${String(d.slot)}|${key}`)) {
            seen.add(`${String(d.slot)}|${key}`);
            latencies.push(clock.ms - t0);
          }
        }
        sockets[d.slot].deliver(d.bytes.buffer.slice(d.bytes.byteOffset, d.bytes.byteOffset + d.bytes.byteLength));
      }
    }
  };

  const worlds = [createMatch(setup), createMatch(setup)] as const;
  const sessions = ([0, 1] as const).map(
    (side) => new LockstepSession({ world: worlds[side], side, transport: transports[side], match: matchId, inputDelay, tickLimit: ticks, adaptive: false, rollbackWindow, batchEvery }),
  ) as [LockstepSession, LockstepSession];
  const hashed = [0, 0];
  const done = (): boolean => sessions.every((s) => s.status === 'ended' || s.status === 'desync' || s.status === 'forfeit');

  let wall = 0;
  const maxWall = ticks * 20;
  while (wall < maxWall && !done()) {
    wall++;
    const target = wall * TICK_MS;
    while (clock.ms < target) {
      clock.ms++;
      await drain();
    }
    if (clock.ms % PING_MS === 0) for (const t of transports) t.ping();
    for (const s of sessions) {
      s.update(script[s.side][s.nextStampTick] ?? 0);
      const cps = s.checkpoints();
      for (; (hashed[s.side] as number) < cps.length; hashed[s.side] = (hashed[s.side] as number) + 1) {
        const [tick, h] = cps[hashed[s.side] as number] as readonly [number, number];
        transports[s.side].sendHash(matchId, tick, h);
      }
    }
    await drain();
  }
  const durationSec = (wall * TICK_MS) / 1000;

  // Both sides report the result, then the clock runs on until the relay has compared them (bounded).
  const finalHashes = [hash(worlds[0].state), hash(worlds[1].state)] as const;
  for (const s of sessions) transports[s.side].sendResult(matchId, s.winner ?? 2, 0, s.simTick, finalHashes[s.side]);
  for (let i = 0; i < 2000 && !events.some((e) => e.kind === 'result'); i++) {
    clock.ms++;
    await drain();
  }

  const rate = (count: number): Rate => ({ count, perSec: durationSec > 0 ? Math.round((count / durationSec) * 100) / 100 : 0 });
  const up = msgs.up[0] + msgs.up[1];
  const down = msgs.down[0] + msgs.down[1];
  const rtt = medianRtt([...transports[0].rtts, ...transports[1].rtts]);
  const stats = sessions.map((s) => s.stats);
  const result = events.find((e) => e.kind === 'result');
  return {
    label: MEASUREMENT_LABEL,
    options: { ticks, batchEvery, inputDelay, rollbackWindow, profile },
    durationSec,
    oneWayMs: dist(latencies),
    messages: {
      total: rate(up + down),
      clientToRelay: rate(up),
      relayToClient: rate(down),
      bySlot: [rate(msgs.up[0] + msgs.down[0]), rate(msgs.up[1] + msgs.down[1])],
    },
    bytes: { total: rate(bytes.up + bytes.down), clientToRelay: rate(bytes.up), relayToClient: rate(bytes.down) },
    sessions: stats.map((x) => ({ stalls: x.stalls, rollbacks: x.rollbacks, resimTicks: x.resimTicks, maxRollbackDepth: x.maxRollbackDepth, packetsSent: x.packetsSent })),
    rollbacks: stats.reduce((n, x) => n + x.rollbacks, 0),
    stalls: stats.reduce((n, x) => n + x.stalls, 0),
    finalHashes,
    finalHashEqual: finalHashes[0] === finalHashes[1],
    matchesOfflineReference: finalHashes[0] === referenceHash(setup, script, ticks, inputDelay),
    relayAgreed: result?.kind === 'result' && result.agreed,
    link: { medianRttMs: rtt, grade: rtt === undefined ? undefined : linkQuality(rtt, stats[0]) },
    estimates: ESTIMATES,
  };
}

/** A short table: every measured figure carries the measurement label, the estimates are marked as such. */
export function formatReport(r: MeasureReport): string {
  const m = `[${r.label}]`;
  const p = r.options.profile;
  const row = (k: string, v: string): string => `${k.padEnd(34)}${v}`;
  return [
    `online-measure: ${String(r.options.ticks)} ticks, batchEvery ${String(r.options.batchEvery)}, input delay ${String(r.options.inputDelay)}, rollback window ${String(r.options.rollbackWindow)}`,
    `link profile: ${String(p.latencyMs)} ms one-way, jitter ${String(p.jitterMs)} ms, dup ${String(p.dupPct)}%, reorder ${String(p.reorderPct)}%, loss ${String(p.lossPct)}%`,
    row('one-way latency p50/p95/max', `${String(r.oneWayMs.p50)} / ${String(r.oneWayMs.p95)} / ${String(r.oneWayMs.max)} ms (${String(r.oneWayMs.samples)} batches) ${m}`),
    row('messages/s per match (total)', `${String(r.messages.total.perSec)} ${m}`),
    row('  client to relay / relay to client', `${String(r.messages.clientToRelay.perSec)} / ${String(r.messages.relayToClient.perSec)} ${m}`),
    row('bytes/s (total, up, down)', `${String(r.bytes.total.perSec)}, ${String(r.bytes.clientToRelay.perSec)}, ${String(r.bytes.relayToClient.perSec)} ${m}`),
    row('rollbacks / stalls', `${String(r.rollbacks)} / ${String(r.stalls)} ${m}`),
    row('final hashes equal', `${String(r.finalHashEqual)} (relay agreed: ${String(r.relayAgreed)}, offline reference: ${String(r.matchesOfflineReference)}) ${m}`),
    row('link grade', `${r.link.grade ?? 'n/a'} (median RTT ${String(r.link.medianRttMs ?? 'n/a')} ms) ${m}`),
    row('billed msgs/s per match', `${ESTIMATES.billedMsgsPerSecPerMatch} (${ESTIMATES.label}, docs/ONLINE-PROTOCOL.md section 9)`),
    row('one-way latency, serverless', `${ESTIMATES.oneWayLatencyServerless} (${ESTIMATES.label})`),
  ].join('\n');
}
