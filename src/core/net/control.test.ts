import { describe, expect, it } from 'vitest';
import { DEFAULT_SIM_FLAGS } from '../flags';
import { SIM_VERSION } from '../version';
import type { MatchSetup } from '../sim/match';
import { SetupHandshake, type ControlPipe } from './control';
import { encodeHello, helloOf } from './handshake';

const setup = (over: Partial<MatchSetup> = {}): MatchSetup =>
  ({
    simVersion: SIM_VERSION,
    seed: 7,
    flags: DEFAULT_SIM_FLAGS,
    chapter: 1,
    difficulty: 1,
    p1: [{ character: 'fire-mage', xp: 0 }],
    p2: [{ character: 'air-bat', xp: 0 }],
    ...over,
  }) as unknown as MatchSetup;

/** A reliable, ordered pair of pipes. */
function pair(): [ControlPipe, ControlPipe, Uint8Array[], Uint8Array[]] {
  const a: Uint8Array[] = [];
  const b: Uint8Array[] = [];
  return [
    { send: (m) => void b.push(m), receive: () => a.shift() },
    { send: (m) => void a.push(m), receive: () => b.shift() },
    a,
    b,
  ];
}

function run(x: SetupHandshake, y: SetupHandshake): void {
  for (let i = 0; i < 6; i++) {
    x.poll();
    y.poll();
  }
}

describe('SetupHandshake', () => {
  it('both peers reach go when the setups agree', () => {
    const [pa, pb] = pair();
    const x = new SetupHandshake(pa, helloOf(setup()));
    const y = new SetupHandshake(pb, helloOf(setup()));
    expect(x.poll()).toBe('waiting-hello');
    run(x, y);
    expect([x.phase, y.phase]).toEqual(['go', 'go']);
  });

  it('a mismatch rejects both sides and names the reason on the one that saw it', () => {
    const [pa, pb] = pair();
    const x = new SetupHandshake(pa, helloOf(setup()));
    const y = new SetupHandshake(pb, helloOf(setup({ seed: 8 })));
    run(x, y);
    expect([x.phase, y.phase]).toEqual(['rejected', 'rejected']);
    expect(x.reason).toBe('seed');
    expect(y.reason).toBe('seed');
  });

  it('a peer that rejects first is reported as peer-rejected on a side that has not decided', () => {
    const [, pb, , toB] = pair();
    const y = new SetupHandshake(pb, helloOf(setup()));
    toB.push(Uint8Array.of(3, 0));
    expect(y.poll()).toBe('rejected');
    expect(y.reason).toBe('peer-rejected');
  });

  it('never throws on garbage and keeps a decided phase', () => {
    const junk: Uint8Array[] = [Uint8Array.of(), Uint8Array.of(99), Uint8Array.of(1, 2, 3), Uint8Array.of(2)];
    for (const m of junk) {
      const [, pb, , toB] = pair();
      const y = new SetupHandshake(pb, helloOf(setup()));
      toB.push(m);
      expect(y.poll()).toBe('rejected');
      expect(y.reason).toBe('malformed');
      toB.push(encodeHello(helloOf(setup())));
      expect(y.poll()).toBe('rejected');
    }
  });
});
