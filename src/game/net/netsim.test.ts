import { describe, expect, it } from 'vitest';
import type { Transport } from '@core/index';
import { NetsimTransport, netsimFromSearch, parseNetsim, type NetsimConfig } from './netsim';

class Pipe implements Transport {
  readonly q: Uint8Array[] = [];
  send(): void {}
  receive(): Uint8Array | undefined {
    return this.q.shift();
  }
}

const cfg = (o: Partial<NetsimConfig> = {}): NetsimConfig => ({ lat: 0, jitter: 0, loss: 0, dup: 0, seed: 1, ...o });

function drain(c: NetsimConfig, n: number): { out: number[]; net: NetsimTransport } {
  const pipe = new Pipe();
  let t = 0;
  const net = new NetsimTransport(pipe, c, () => t);
  const out: number[] = [];
  for (let i = 0; i < n; i++) pipe.q.push(Uint8Array.of(i & 255, i >> 8));
  const push = (p: Uint8Array): number => out.push((p[0] ?? 0) + ((p[1] ?? 0) << 8));
  const first = net.receive(); // pulls everything in at t = 0 (and may release one)
  if (first) push(first);
  t = 10_000;
  for (let p = net.receive(); p !== undefined; p = net.receive()) push(p);
  return { out, net };
}

const seq = (n: number): number[] => Array.from({ length: n }, (_, i) => i);

describe('netsim parsing', () => {
  it('parses the documented form and defaults the rest', () => {
    expect(parseNetsim('lat:60,jitter:20,loss:10')).toEqual({ lat: 60, jitter: 20, loss: 10, dup: 0, seed: 1 });
    expect(parseNetsim('seed:7,dup:5')).toMatchObject({ seed: 7, dup: 5, lat: 0 });
  });
  it('rejects malformed or out-of-range values', () => {
    for (const bad of [null, '', 'lat', 'lat:x', 'loss:101', 'foo:1', 'lat:1:2', 'lat:-1', 'lat:9999999']) expect(parseNetsim(bad)).toBeUndefined();
  });
  it('is ignored outside dev and test builds', () => {
    expect(netsimFromSearch('?netsim=lat:10', false)).toBeUndefined();
    expect(netsimFromSearch('?netsim=lat:10', true)?.lat).toBe(10);
  });
});

describe('NetsimTransport', () => {
  it('is a pass-through with zero settings', () => {
    expect(drain(cfg(), 50).out).toEqual(seq(50));
  });
  it('holds packets until the latency has passed', () => {
    const pipe = new Pipe();
    let t = 0;
    const net = new NetsimTransport(pipe, cfg({ lat: 60 }), () => t);
    pipe.q.push(Uint8Array.of(1));
    expect(net.receive()).toBeUndefined();
    t = 59;
    expect(net.receive()).toBeUndefined();
    t = 60;
    expect(net.receive()).toEqual(Uint8Array.of(1));
  });
  it('drops about the loss percentage, the same way for the same seed', () => {
    const a = drain(cfg({ loss: 10 }), 2000);
    expect(a.out.length).toBeGreaterThan(1650);
    expect(a.out.length).toBeLessThan(1950);
    expect(a.net.dropped + a.out.length).toBe(2000);
    expect(drain(cfg({ loss: 10 }), 2000).out).toEqual(a.out);
    expect(drain(cfg({ loss: 10, seed: 2 }), 2000).out).not.toEqual(a.out);
  });
  it('jitter reorders but loses nothing; dup adds copies', () => {
    const j = drain(cfg({ jitter: 50 }), 200).out;
    expect([...j].sort((x, y) => x - y)).toEqual(seq(200));
    expect(j).not.toEqual(seq(200));
    const d = drain(cfg({ dup: 50 }), 200);
    expect(d.out.length).toBe(200 + d.net.duplicated);
    expect(d.net.duplicated).toBeGreaterThan(0);
  });
});
