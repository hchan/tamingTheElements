import { seedSfc32, type Transport } from '@core/index';

/**
 * Dev/test-only link impairment for the input `Transport` (docs/WEBRTC-PLAN.md WP 11): `?netsim=lat:60,jitter:20,loss:10`.
 * `lat` is the one-way delay in ms added to every received packet (so the round trip grows by twice that when both sides use it),
 * `jitter` adds a random 0..jitter ms on top (which also reorders packets), `loss` is the percent of packets dropped. Optional
 * `dup` (percent duplicated) and `seed` (default 1). Drops, jitter and duplicates come from a seeded sfc32 stream, so a given
 * packet sequence is impaired the same way every run; only the wall-clock release time depends on the page.
 */
export interface NetsimConfig {
  readonly lat: number;
  readonly jitter: number;
  readonly loss: number;
  readonly dup: number;
  readonly seed: number;
}

const KEYS = new Set(['lat', 'jitter', 'loss', 'dup', 'seed']);

/** Parses the `netsim` query value (`lat:60,jitter:20,loss:10`); undefined when absent, empty, malformed or out of range. */
export function parseNetsim(value: string | null): NetsimConfig | undefined {
  if (value === null || value === '') return undefined;
  const cfg: Record<string, number> = { lat: 0, jitter: 0, loss: 0, dup: 0, seed: 1 };
  for (const part of value.split(',')) {
    const [k, v, ...rest] = part.split(':');
    if (k === undefined || v === undefined || rest.length > 0 || !KEYS.has(k) || !/^\d{1,5}$/.test(v)) return undefined;
    cfg[k] = Number(v);
  }
  const { lat = 0, jitter = 0, loss = 0, dup = 0, seed = 1 } = cfg;
  if (loss > 100 || dup > 100 || lat > 5000 || jitter > 5000) return undefined;
  return { lat, jitter, loss, dup, seed };
}

/** The config from the page address; only dev and test builds honour it. */
export function netsimFromSearch(search: string, devBuild: boolean): NetsimConfig | undefined {
  return devBuild ? parseNetsim(new URLSearchParams(search).get('netsim')) : undefined;
}

interface Held {
  readonly at: number;
  readonly packet: Uint8Array;
}

/** Wraps a transport: received packets are dropped, duplicated and held back per the config (sending is untouched). */
export class NetsimTransport implements Transport {
  private readonly rng;
  private readonly held: Held[] = [];
  /** Counters for the soak test's report. */
  dropped = 0;
  duplicated = 0;
  delivered = 0;

  constructor(
    private readonly inner: Transport,
    private readonly cfg: NetsimConfig,
    private readonly now: () => number = () => performance.now(),
  ) {
    this.rng = seedSfc32(cfg.seed, 'netsim');
  }

  send(packet: Uint8Array): void {
    this.inner.send(packet);
  }

  private pct(): number {
    return this.rng.nextU32() % 100;
  }

  private hold(packet: Uint8Array, t: number): void {
    const j = this.cfg.jitter > 0 ? this.rng.nextU32() % (this.cfg.jitter + 1) : 0;
    this.held.push({ at: t + this.cfg.lat + j, packet });
  }

  receive(): Uint8Array | undefined {
    const t = this.now();
    for (let p = this.inner.receive(); p !== undefined; p = this.inner.receive()) {
      if (this.pct() < this.cfg.loss) {
        this.dropped++;
        continue;
      }
      this.hold(p, t);
      if (this.pct() < this.cfg.dup) {
        this.duplicated++;
        this.hold(p, t);
      }
    }
    let best = -1;
    for (let i = 0; i < this.held.length; i++) {
      const h = this.held[i];
      if (h && h.at <= t && (best < 0 || h.at < (this.held[best]?.at ?? Infinity))) best = i;
    }
    if (best < 0) return undefined;
    this.delivered++;
    return this.held.splice(best, 1)[0]?.packet;
  }
}
