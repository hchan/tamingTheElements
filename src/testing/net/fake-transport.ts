import type { Transport } from '../../core/net/transport';
import { seedSfc32 } from '../../core/rng/seed';
import type { Sfc32 } from '../../core/rng/sfc32';

export interface NetConditions {
  /** Base one-way delay in ticks. */
  readonly latency: number;
  /** Extra uniform random delay 0..jitter ticks per packet (this alone reorders packets). */
  readonly jitter: number;
  /** Probability a packet is dropped, 0..1. */
  readonly loss: number;
  /** Probability a packet is delivered twice. */
  readonly duplicate: number;
  /** Probability a packet is held back an extra `reorderDelay` ticks. */
  readonly reorder: number;
  readonly reorderDelay: number;
}

export const PERFECT_NET: NetConditions = { latency: 0, jitter: 0, loss: 0, duplicate: 0, reorder: 0, reorderDelay: 0 };

interface InFlight {
  readonly at: number;
  readonly seq: number;
  readonly data: Uint8Array;
}

/** One direction of the link. */
class Endpoint implements Transport {
  readonly inbox: InFlight[] = [];
  peer: Endpoint | undefined;

  constructor(private readonly net: FakeNetwork) {}

  send(packet: Uint8Array): void {
    this.net.route(this.peer as Endpoint, packet);
  }

  receive(): Uint8Array | undefined {
    const now = this.net.now;
    let best = -1;
    for (let i = 0; i < this.inbox.length; i++) {
      const m = this.inbox[i] as InFlight;
      if (m.at > now) continue;
      const b = best < 0 ? undefined : (this.inbox[best] as InFlight);
      if (b === undefined || m.at < b.at || (m.at === b.at && m.seq < b.seq)) best = i;
    }
    if (best < 0) return undefined;
    return this.inbox.splice(best, 1)[0]?.data;
  }
}

/**
 * Seeded in-memory link between two peers. Time is virtual: the harness calls `advance()` once per
 * tick, and a packet sent at tick `t` becomes receivable at `t + latency + jitter`. Same seed and
 * same send sequence give the same loss, duplication and order.
 */
export class FakeNetwork {
  now = 0;
  sent = 0;
  dropped = 0;
  delivered = 0;
  private seq = 0;
  private readonly rng: Sfc32;
  readonly a: Transport;
  readonly b: Transport;

  constructor(
    seed: number,
    readonly conditions: NetConditions = PERFECT_NET,
  ) {
    this.rng = seedSfc32(seed, 'fake-net');
    const ea = new Endpoint(this);
    const eb = new Endpoint(this);
    ea.peer = eb;
    eb.peer = ea;
    this.a = ea;
    this.b = eb;
  }

  advance(): void {
    this.now++;
  }

  /** Swap in new conditions mid-match (e.g. a lag spike). */
  setConditions(c: NetConditions): void {
    (this as { conditions: NetConditions }).conditions = c;
  }

  /** Cuts the link: everything sent from now on is dropped. */
  cut(): void {
    this.setConditions({ ...this.conditions, loss: 1 });
  }

  route(to: Endpoint, data: Uint8Array): void {
    const c = this.conditions;
    this.sent++;
    if (this.rng.chance(c.loss)) {
      this.dropped++;
      return;
    }
    const copies = this.rng.chance(c.duplicate) ? 2 : 1;
    for (let i = 0; i < copies; i++) {
      let delay = c.latency + (c.jitter > 0 ? this.rng.int(c.jitter + 1) : 0);
      if (c.reorder > 0 && this.rng.chance(c.reorder)) delay += c.reorderDelay;
      to.inbox.push({ at: this.now + delay, seq: this.seq++, data: data.slice() });
      this.delivered++;
    }
  }
}

/** Convenience: a seeded network and its two transports. */
export function createFakePair(seed: number, conditions: NetConditions = PERFECT_NET): FakeNetwork {
  return new FakeNetwork(seed, conditions);
}
