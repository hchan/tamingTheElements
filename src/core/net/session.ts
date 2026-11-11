import { flagsFromBits } from '../flags';
import { type Command, inputMaskFor, NO_COMMAND } from '../sim/commands';
import type { SimEvent } from '../sim/events';
import { hash } from '../sim/hash';
import { matchWinner, hasEnded } from '../sim/systems/end';
import { SnapshotRing } from '../sim/snapshot';
import { World } from '../sim/state';
import { step } from '../sim/step';
import type { SimWorld } from '../sim/world';
import {
  decodePacket,
  encodePacket,
  MAX_HASHES_PER_PACKET,
  MAX_INPUTS_PER_PACKET,
  PacketFlag,
  type HashEntry,
} from './packet';
import type { Transport } from './transport';

export type SessionStatus =
  'running' | 'waiting' | 'remote-paused' | 'ended' | 'desync' | 'forfeit';

export interface LockstepOptions {
  /** The shared world; both peers build it from the same MatchSetup. */
  readonly world: SimWorld;
  /** Which command slot this peer owns. */
  readonly side: 0 | 1;
  readonly transport: Transport;
  /** Match number on this link (default 0); packets carrying another number are dropped (a rematch uses the next one). */
  readonly match?: number;
  /** Initial input delay in ticks (default 2). */
  readonly inputDelay?: number;
  /** Upper bound for adaptive delay (default 4). */
  readonly maxInputDelay?: number;
  /** Raise the delay by one when stalls pile up (default true). */
  readonly adaptive?: boolean;
  /** Exchange a state hash every N ticks (default 50). */
  readonly hashInterval?: number;
  /** Update calls without any packet before the remote is forfeited (default 250 = 5 s at 50 Hz). */
  readonly timeoutTicks?: number;
  /** Same, while the remote has announced it is paused or hidden (default 1500 = 30 s). */
  readonly pauseTimeoutTicks?: number;
  /** Stop (as `ended`, no winner) when the sim reaches this tick: the match time limit. */
  readonly tickLimit?: number;
  /**
   * Opt-in rollback: when a remote input is missing, predict it (repeat the last remote command) and step ahead
   * by up to this many ticks; when the real input differs, restore the snapshot and re-simulate. 0 or absent keeps
   * plain lockstep (default). Beyond the window the session stalls as lockstep does.
   */
  readonly rollbackWindow?: number;
}

export interface UpdateResult {
  readonly status: SessionStatus;
  /** True when the shared sim advanced one tick during this update. */
  readonly stepped: boolean;
  /** True when the local command was stamped for a future tick (false while stalled ahead). */
  readonly inputAccepted: boolean;
  /**
   * Events to show. With rollback each stable id (tick, sourceId, kind, seq) is surfaced once: re-simulation
   * re-emits only events that are new or whose payload changed (a correction).
   */
  readonly events: readonly SimEvent[];
  /** Rollback only: events shown earlier that the corrected timeline no longer produces. */
  readonly retracted: readonly SimEvent[];
}

export interface DesyncInfo {
  /** First checkpoint tick at which the two hashes differ. */
  readonly tick: number;
  readonly local: number;
  readonly remote: number;
}

export interface SessionStats {
  updates: number;
  /** Updates that could not step because a remote input was missing. */
  stalls: number;
  maxStallRun: number;
  packetsSent: number;
  packetsReceived: number;
  packetsMalformed: number;
  packetsStale: number;
  /** Inputs put on the wire again after an earlier send (loss recovery). */
  resentInputs: number;
  /** Worst gap between update calls (wall ticks) and sim ticks done; bounds latency lockstep absorbed with no rollback. */
  maxLagTicks: number;
  delayRaises: number;
  /** Rollback: steps taken with a predicted remote input. */
  predictedSteps: number;
  /** Rollback: restore-and-resimulate runs, and the ticks they replayed. */
  rollbacks: number;
  resimTicks: number;
  maxRollbackDepth: number;
}

/** Plain-data copy of the session bookkeeping; pairs with a world `SnapshotRing` entry for rollback. */
export interface SessionSnapshot {
  readonly simTick: number;
  readonly inputDelay: number;
  readonly local: readonly Command[];
  readonly remote: readonly (Command | undefined)[];
  readonly remoteAck: number;
  readonly remoteNeeded: number;
  readonly hashes: readonly HashEntry[];
}

/** Remote inputs further ahead than this many ticks are ignored (bounds memory against a hostile peer). */
const MAX_AHEAD = 2 * MAX_INPUTS_PER_PACKET;
const ADAPT_WINDOW = 50;
const ADAPT_STALLS = 5;

/**
 * Two-player deterministic lockstep over an unreliable, unordered `Transport`.
 *
 * The host calls `update(localCommand)` once per wall 50 Hz tick. The session stamps the command
 * for tick `simTick + inputDelay`, sends every input the peer has not acked (plus recent state
 * hashes) in one packet, and steps the shared world only when both sides' inputs for the current
 * tick are present. Otherwise it reports `waiting` and the world does not move. It never reads a
 * wall clock: timeouts count `update` calls.
 *
 * With `rollbackWindow > 0` a missing remote input is predicted (last remote command repeated) and the sim
 * steps ahead; a differing real input restores the ring snapshot of that tick and re-simulates to the
 * present. Only confirmed ticks (all inputs before them real) are hashed, compared or allowed to end the
 * match (see docs/NETCODE.md).
 */
export class LockstepSession {
  readonly side: 0 | 1;
  readonly stats: SessionStats = {
    updates: 0,
    stalls: 0,
    maxStallRun: 0,
    packetsSent: 0,
    packetsReceived: 0,
    packetsMalformed: 0,
    packetsStale: 0,
    resentInputs: 0,
    maxLagTicks: 0,
    delayRaises: 0,
    predictedSteps: 0,
    rollbacks: 0,
    resimTicks: 0,
    maxRollbackDepth: 0,
  };
  /** First hash mismatch found, if any. Once set the session stops stepping. */
  desync: DesyncInfo | undefined;
  /** Winning team, -1 for a draw, null while undecided. */
  winner: number | null = null;
  forfeitReason: 'timeout' | 'conceded' | 'remote-conceded' | undefined;

  private readonly world: SimWorld;
  /** Command bits this match accepts (inputMaskFor its world flags); the rest are dropped on both sides. */
  private readonly inputMask: number;
  private readonly transport: Transport;
  private readonly match: number;
  private readonly maxDelay: number;
  private readonly adaptive: boolean;
  private readonly hashInterval: number;
  private readonly timeoutTicks: number;
  private readonly pauseTimeoutTicks: number;
  private readonly tickLimit: number;
  private delay: number;
  private readonly local: Command[] = [];
  private readonly remote: (Command | undefined)[] = [];
  /** Next remote tick not yet held contiguously (what we ack). */
  private remoteNeeded = 0;
  /** Next local tick the peer has not acked. */
  private remoteAck = 0;
  /** Highest local tick already put on the wire plus one. */
  private sentUpTo = 0;
  private readonly localHashes = new Map<number, number>();
  private readonly remoteHashes = new Map<number, number>();
  private readonly hashTicks: number[] = [];
  private clock = 0;
  private startClock = -1;
  private lastHeard = 0;
  private remotePaused = false;
  private hidden = false;
  private stallRun = 0;
  private windowStalls = 0;
  private forfeited = false;
  private ended = false;

  // Rollback bookkeeping (unused when rollbackWindow is 0).
  private readonly rbWindow: number;
  private readonly ring: SnapshotRing | undefined;
  /** Remote command actually fed to the sim at each tick (real or predicted); overwritten by re-simulation. */
  private readonly used: Command[] = [];
  /** Ticks below this were stepped with real remote inputs only: final, never rolled back. */
  private confirmed = 0;
  /** State hashes of checkpoint ticks reached but not yet confirmed. */
  private readonly specHashes = new Map<number, number>();
  /** The sim reached its end (win or tick limit) on a not yet confirmed timeline. */
  private endPending = false;
  /** Events already surfaced per unconfirmed tick, for de-duplication. */
  private readonly delivered = new Map<number, readonly SimEvent[]>();

  constructor(opts: LockstepOptions) {
    this.world = opts.world;
    this.inputMask = inputMaskFor(flagsFromBits(opts.world.state.world[World.flags] ?? 0));
    this.side = opts.side;
    this.transport = opts.transport;
    this.match = (opts.match ?? 0) & 0xff;
    this.delay = opts.inputDelay ?? 2;
    this.maxDelay = Math.max(this.delay, opts.maxInputDelay ?? 4);
    this.adaptive = opts.adaptive ?? true;
    this.hashInterval = opts.hashInterval ?? 50;
    this.timeoutTicks = opts.timeoutTicks ?? 250;
    this.pauseTimeoutTicks = opts.pauseTimeoutTicks ?? 1500;
    this.tickLimit = opts.tickLimit ?? Number.POSITIVE_INFINITY;
    this.rbWindow = opts.rollbackWindow ?? 0;
    if (!Number.isInteger(this.rbWindow) || this.rbWindow < 0)
      throw new RangeError('rollbackWindow must be an integer >= 0');
    this.ring =
      this.rbWindow > 0 ? new SnapshotRing(this.world.state, this.rbWindow + 2) : undefined;
    if (!Number.isInteger(this.delay) || this.delay < 0)
      throw new RangeError('inputDelay must be an integer >= 0');
    if (!Number.isInteger(this.hashInterval) || this.hashInterval < 1)
      throw new RangeError('hashInterval must be >= 1');
    for (let i = 0; i < this.delay; i++) this.local.push(NO_COMMAND);
  }

  get simTick(): number {
    return this.world.state.world[World.tick] ?? 0;
  }

  /** Tick the next accepted local command will be stamped for (scripted drivers index by it). */
  get nextStampTick(): number {
    return this.local.length;
  }

  /** Command pair applied by the most recent step, in (side 0, side 1) order. */
  lastCommands: readonly [Command, Command] = [NO_COMMAND, NO_COMMAND];

  /** Local state hash recorded at a checkpoint tick, if any. */
  hashAt(tick: number): number | undefined {
    return this.localHashes.get(tick);
  }

  get inputDelay(): number {
    return this.delay;
  }

  get status(): SessionStatus {
    if (this.forfeitReason !== undefined) return 'forfeit';
    if (this.desync !== undefined) return 'desync';
    if (this.ended) return 'ended';
    if (this.stallRun > 0) return this.remotePaused ? 'remote-paused' : 'waiting';
    return 'running';
  }

  /** Tab went hidden (or the player paused): tell the peer immediately so it extends its timeout instead of forfeiting us. */
  setHidden(hidden: boolean): void {
    this.hidden = hidden;
    this.sendPacket();
  }

  /** Concede. The peer is told at once; it also learns by timeout if the packet is lost. */
  forfeit(): void {
    if (this.forfeitReason !== undefined) return;
    this.forfeited = true;
    this.forfeitReason = 'conceded';
    this.winner = 1 - this.side;
    this.sendPacket();
  }

  /** Raises the delay (never lowers it, to keep stamped ticks unique). Gap ticks carry no input. */
  raiseInputDelay(to: number): void {
    const target = Math.min(to, this.maxDelay);
    while (this.delay < target) {
      this.delay++;
      this.local.push(NO_COMMAND);
      this.stats.delayRaises++;
    }
  }

  /** One wall tick: receive, stamp the local command, step if both inputs are present, check timeout, send. */
  update(localCommand: Command): UpdateResult {
    this.clock++;
    this.stats.updates++;
    if (this.startClock < 0) this.startClock = this.clock;
    this.receiveAll();

    const live = this.forfeitReason === undefined && this.desync === undefined && !this.ended;
    let inputAccepted = false;
    let stepped = false;
    let events: readonly SimEvent[] = [];
    const retracted: SimEvent[] = [];

    if (live) {
      if (this.local.length <= this.simTick + this.delay) {
        this.local.push(localCommand & this.inputMask);
        inputAccepted = true;
      }
      if (this.ring !== undefined) {
        const out: SimEvent[] = [];
        this.reconcile(out, retracted);
        const t = this.simTick;
        const mine = this.local[t];
        const canStep =
          mine !== undefined &&
          !this.endPending &&
          (this.remote[t] !== undefined || t - this.confirmed < this.rbWindow);
        if (canStep) {
          this.stepOne(out, retracted);
          stepped = true;
          this.stallRun = 0;
          this.settle();
        } else if (!this.endPending || this.confirmed < t) {
          this.noteStall();
        }
        events = out;
      } else {
        const t = this.simTick;
        const mine = this.local[t];
        const theirs = this.remote[t];
        if (mine !== undefined && theirs !== undefined) {
          this.lastCommands = this.side === 0 ? [mine, theirs] : [theirs, mine];
          events = step(this.world, this.lastCommands);
          stepped = true;
          this.stallRun = 0;
          this.afterStep();
        } else {
          this.noteStall();
        }
      }
      this.stats.maxLagTicks = Math.max(
        this.stats.maxLagTicks,
        this.clock - this.startClock - this.simTick,
      );
      if (
        this.clock - this.lastHeard >
          (this.remotePaused ? this.pauseTimeoutTicks : this.timeoutTicks) &&
        !this.ended
      ) {
        this.forfeitReason = 'timeout';
        this.winner = this.side;
      }
    }
    this.sendPacket();
    return { status: this.status, stepped, inputAccepted, events, retracted };
  }

  /** Plain-data copy of the bookkeeping for a future rollback layer. */
  captureSnapshot(): SessionSnapshot {
    return {
      simTick: this.simTick,
      inputDelay: this.delay,
      local: this.local.slice(),
      remote: this.remote.slice(),
      remoteAck: this.remoteAck,
      remoteNeeded: this.remoteNeeded,
      hashes: this.hashTicks.map((tick) => ({ tick, hash: this.localHashes.get(tick) as number })),
    };
  }

  private noteStall(): void {
    this.stats.stalls++;
    this.stallRun++;
    this.stats.maxStallRun = Math.max(this.stats.maxStallRun, this.stallRun);
    this.windowStalls++;
    if (this.adaptive && this.windowStalls >= ADAPT_STALLS) {
      this.windowStalls = 0;
      this.raiseInputDelay(this.delay + 1);
    }
    if (this.clock % ADAPT_WINDOW === 0) this.windowStalls = 0;
  }

  /** Steps one tick, predicting the remote command if it is missing; surfaces the events once. */
  private stepOne(out: SimEvent[], retracted: SimEvent[]): boolean {
    const ring = this.ring as SnapshotRing;
    const t = this.simTick;
    const real = this.remote[t];
    const theirs = real ?? this.used[t - 1] ?? NO_COMMAND;
    if (real === undefined) this.stats.predictedSteps++;
    this.used[t] = theirs;
    const mine = this.local[t] as Command;
    ring.push(this.world.state, t);
    this.lastCommands = this.side === 0 ? [mine, theirs] : [theirs, mine];
    const evs = step(this.world, this.lastCommands);
    this.surface(t, evs, out, retracted);
    const now = this.simTick;
    this.endPending = hasEnded(this.world.state) || now >= this.tickLimit;
    if (this.endPending || now % this.hashInterval === 0)
      this.specHashes.set(now, hash(this.world.state));
    return this.endPending;
  }

  /** De-duplicates by stable event id: only new or changed events reach `out`; vanished ones go to `retracted`. */
  private surface(
    tick: number,
    evs: readonly SimEvent[],
    out: SimEvent[],
    retracted: SimEvent[],
  ): void {
    const prev = this.delivered.get(tick);
    const id = (e: SimEvent): string => `${String(e.sourceId)}:${String(e.kind)}:${String(e.seq)}`;
    const old = new Map<string, SimEvent>();
    for (const e of prev ?? []) old.set(id(e), e);
    for (const e of evs) {
      const o = old.get(id(e));
      old.delete(id(e));
      if (o === undefined || !sameEvent(o, e)) out.push(e);
    }
    for (const e of old.values()) retracted.push(e);
    this.delivered.set(tick, evs.slice());
  }

  /** Compares arrived real inputs with what was predicted; on the first difference rewinds and re-simulates. */
  private reconcile(out: SimEvent[], retracted: SimEvent[]): void {
    const ring = this.ring as SnapshotRing;
    const target = this.simTick;
    let bad = -1;
    for (let t = this.confirmed; t < target; t++) {
      const r = this.remote[t];
      if (r !== undefined && r !== this.used[t]) {
        bad = t;
        break;
      }
    }
    if (bad >= 0 && !ring.restoreTick(this.world.state, bad)) {
      // Cannot happen while the ring holds window + 2 snapshots; fail loudly instead of drifting to a later hash mismatch.
      if (this.desync === undefined || bad < this.desync.tick) this.desync = { tick: bad, local: 0, remote: 0 };
    } else if (bad >= 0) {
      this.stats.rollbacks++;
      this.stats.maxRollbackDepth = Math.max(this.stats.maxRollbackDepth, target - bad);
      for (const k of [...this.specHashes.keys()]) if (k > bad) this.specHashes.delete(k);
      this.endPending = false;
      while (this.simTick < target) {
        const ended = this.stepOne(out, retracted);
        this.stats.resimTicks++;
        if (ended) break;
      }
      // Ticks the corrected timeline no longer reaches produced events that must be withdrawn.
      for (let t = this.simTick; t < target; t++) {
        for (const e of this.delivered.get(t) ?? []) retracted.push(e);
        this.delivered.delete(t);
      }
    }
    this.settle();
  }

  /** Advances the confirmed frontier, commits the hashes it covers and finalises a confirmed match end. */
  private settle(): void {
    const now = this.simTick;
    while (this.confirmed < now && this.remote[this.confirmed] !== undefined) {
      this.delivered.delete(this.confirmed);
      this.confirmed++;
    }
    for (const [tick, h] of [...this.specHashes]) {
      if (tick > this.confirmed) continue;
      this.specHashes.delete(tick);
      this.recordHash(tick, h);
    }
    if (this.endPending && this.confirmed >= now && !this.ended) {
      this.ended = true;
      this.winner = hasEnded(this.world.state) ? matchWinner(this.world.state) : null;
    }
  }

  private afterStep(): void {
    if (this.clock % ADAPT_WINDOW === 0) this.windowStalls = 0;
    const t = this.simTick;
    if (hasEnded(this.world.state) || t >= this.tickLimit) {
      this.ended = true;
      this.winner = hasEnded(this.world.state) ? matchWinner(this.world.state) : null;
      this.recordHash(t);
    } else if (t % this.hashInterval === 0) {
      this.recordHash(t);
    }
  }

  private recordHash(tick: number, h: number = hash(this.world.state)): void {
    if (this.localHashes.has(tick)) return;
    this.localHashes.set(tick, h);
    this.hashTicks.push(tick);
    this.compare(tick);
  }

  private compare(tick: number): void {
    const l = this.localHashes.get(tick);
    const r = this.remoteHashes.get(tick);
    if (l === undefined || r === undefined || l === r) return;
    if (this.desync === undefined || tick < this.desync.tick)
      this.desync = { tick, local: l, remote: r };
  }

  private receiveAll(): void {
    for (let raw = this.transport.receive(); raw !== undefined; raw = this.transport.receive()) {
      const p = decodePacket(raw);
      if (p === undefined) {
        this.stats.packetsMalformed++;
        continue;
      }
      if (p.match !== this.match) {
        this.stats.packetsStale++;
        continue;
      }
      this.stats.packetsReceived++;
      this.lastHeard = this.clock;
      this.remotePaused = (p.flags & PacketFlag.paused) !== 0;
      if ((p.flags & PacketFlag.forfeit) !== 0 && this.forfeitReason === undefined && !this.ended) {
        this.forfeitReason = 'remote-conceded';
        this.winner = this.side;
      }
      this.remoteAck = Math.min(Math.max(this.remoteAck, p.ack), this.local.length);
      const now = this.ring === undefined ? this.simTick : this.confirmed;
      p.inputs.forEach((cmd, i) => {
        const tick = p.firstTick + i;
        if (tick < now || tick >= now + MAX_AHEAD || this.remote[tick] !== undefined) return;
        this.remote[tick] = cmd & this.inputMask;
      });
      while (this.remote[this.remoteNeeded] !== undefined) this.remoteNeeded++;
      for (const h of p.hashes) {
        if (!this.remoteHashes.has(h.tick)) this.remoteHashes.set(h.tick, h.hash);
        this.compare(h.tick);
      }
    }
  }

  private sendPacket(): void {
    const first = Math.min(this.remoteAck, this.local.length);
    const inputs = this.local.slice(first, first + MAX_INPUTS_PER_PACKET);
    this.stats.resentInputs += Math.max(0, Math.min(this.sentUpTo, first + inputs.length) - first);
    this.sentUpTo = Math.max(this.sentUpTo, first + inputs.length);
    const hashes = this.hashTicks
      .slice(-MAX_HASHES_PER_PACKET)
      .map((tick) => ({ tick, hash: this.localHashes.get(tick) as number }));
    const flags = (this.hidden ? PacketFlag.paused : 0) | (this.forfeited ? PacketFlag.forfeit : 0);
    this.transport.send(
      encodePacket({
        match: this.match,
        flags,
        ack: this.remoteNeeded,
        firstTick: first,
        inputs,
        hashes,
      }),
    );
    this.stats.packetsSent++;
  }
}

function sameEvent(a: SimEvent, b: SimEvent): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every((k) => a[k] === b[k]);
}
