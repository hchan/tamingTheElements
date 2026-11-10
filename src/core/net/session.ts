import { CMD_RESERVED_MASK, type Command, NO_COMMAND } from '../sim/commands';
import type { SimEvent } from '../sim/events';
import { hash } from '../sim/hash';
import { matchWinner, hasEnded } from '../sim/systems/end';
import { World } from '../sim/state';
import { step } from '../sim/step';
import type { SimWorld } from '../sim/world';
import { decodePacket, encodePacket, MAX_HASHES_PER_PACKET, MAX_INPUTS_PER_PACKET, PacketFlag, type HashEntry } from './packet';
import type { Transport } from './transport';

export type SessionStatus = 'running' | 'waiting' | 'remote-paused' | 'ended' | 'desync' | 'forfeit';

export interface LockstepOptions {
  /** The shared world; both peers build it from the same MatchSetup. */
  readonly world: SimWorld;
  /** Which command slot this peer owns. */
  readonly side: 0 | 1;
  readonly transport: Transport;
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
}

export interface UpdateResult {
  readonly status: SessionStatus;
  /** True when the shared sim advanced one tick during this update. */
  readonly stepped: boolean;
  /** True when the local command was stamped for a future tick (false while stalled ahead). */
  readonly inputAccepted: boolean;
  readonly events: readonly SimEvent[];
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
  /** Inputs put on the wire again after an earlier send (loss recovery). */
  resentInputs: number;
  /** Worst gap between update calls (wall ticks) and sim ticks done; bounds latency lockstep absorbed with no rollback. */
  maxLagTicks: number;
  delayRaises: number;
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
const INPUT_MASK = 0xffff & ~CMD_RESERVED_MASK;

/**
 * Two-player deterministic lockstep over an unreliable, unordered `Transport`.
 *
 * The host calls `update(localCommand)` once per wall 50 Hz tick. The session stamps the command
 * for tick `simTick + inputDelay`, sends every input the peer has not acked (plus recent state
 * hashes) in one packet, and steps the shared world only when both sides' inputs for the current
 * tick are present. Otherwise it reports `waiting` and the world does not move. It never reads a
 * wall clock: timeouts count `update` calls.
 *
 * Rollback is not implemented. `captureSnapshot()` is the hook: with the world snapshot ring it is
 * what a later predict/rollback layer restores before re-simulating (see docs/NETCODE.md).
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
    resentInputs: 0,
    maxLagTicks: 0,
    delayRaises: 0,
  };
  /** First hash mismatch found, if any. Once set the session stops stepping. */
  desync: DesyncInfo | undefined;
  /** Winning team, -1 for a draw, null while undecided. */
  winner: number | null = null;
  forfeitReason: 'timeout' | 'conceded' | 'remote-conceded' | undefined;

  private readonly world: SimWorld;
  private readonly transport: Transport;
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

  constructor(opts: LockstepOptions) {
    this.world = opts.world;
    this.side = opts.side;
    this.transport = opts.transport;
    this.delay = opts.inputDelay ?? 2;
    this.maxDelay = Math.max(this.delay, opts.maxInputDelay ?? 4);
    this.adaptive = opts.adaptive ?? true;
    this.hashInterval = opts.hashInterval ?? 50;
    this.timeoutTicks = opts.timeoutTicks ?? 250;
    this.pauseTimeoutTicks = opts.pauseTimeoutTicks ?? 1500;
    this.tickLimit = opts.tickLimit ?? Number.POSITIVE_INFINITY;
    if (!Number.isInteger(this.delay) || this.delay < 0) throw new RangeError('inputDelay must be an integer >= 0');
    if (!Number.isInteger(this.hashInterval) || this.hashInterval < 1) throw new RangeError('hashInterval must be >= 1');
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

    if (live) {
      if (this.local.length <= this.simTick + this.delay) {
        this.local.push(localCommand & INPUT_MASK);
        inputAccepted = true;
      }
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
      this.stats.maxLagTicks = Math.max(this.stats.maxLagTicks, this.clock - this.startClock - this.simTick);
      if (this.clock - this.lastHeard > (this.remotePaused ? this.pauseTimeoutTicks : this.timeoutTicks) && !this.ended) {
        this.forfeitReason = 'timeout';
        this.winner = this.side;
      }
    }
    this.sendPacket();
    return { status: this.status, stepped, inputAccepted, events };
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

  private recordHash(tick: number): void {
    if (this.localHashes.has(tick)) return;
    this.localHashes.set(tick, hash(this.world.state));
    this.hashTicks.push(tick);
    this.compare(tick);
  }

  private compare(tick: number): void {
    const l = this.localHashes.get(tick);
    const r = this.remoteHashes.get(tick);
    if (l === undefined || r === undefined || l === r) return;
    if (this.desync === undefined || tick < this.desync.tick) this.desync = { tick, local: l, remote: r };
  }

  private receiveAll(): void {
    for (let raw = this.transport.receive(); raw !== undefined; raw = this.transport.receive()) {
      const p = decodePacket(raw);
      if (p === undefined) {
        this.stats.packetsMalformed++;
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
      const now = this.simTick;
      p.inputs.forEach((cmd, i) => {
        const tick = p.firstTick + i;
        if (tick < now || tick >= now + MAX_AHEAD || this.remote[tick] !== undefined) return;
        this.remote[tick] = cmd & INPUT_MASK;
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
    this.transport.send(encodePacket({ flags, ack: this.remoteNeeded, firstTick: first, inputs, hashes }));
    this.stats.packetsSent++;
  }
}
