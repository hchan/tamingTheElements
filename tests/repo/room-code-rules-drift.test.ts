import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOM_CODE_RE } from '../../src/game/net/relay';
import * as pkg from '../../src/core/relay/rooms-rules';
import * as sig from '../../tools/signal-relay/rooms';

// The relay package (src/core/relay) and the WebRTC signalling relay (tools/signal-relay) each keep their own copy of the
// room-code rules; this test fails if they drift apart (docs/RELAY-PACKAGE.md).
const root = resolve(import.meta.dirname, '../..');

/** Seeded xorshift32 as `randomInt`; non-zero seeds only (not a counter, so every alphabet index is reachable). */
function gen(seed: number): (n: number) => number {
  let x = seed | 0;
  return (n) => {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) % n;
  };
}
const host = JSON.stringify({ t: 'host' });
const join = (code: string): string => JSON.stringify({ t: 'join', code });
const fresh = (now: () => number = () => 0, seed = 12345): sig.Rooms =>
  new sig.Rooms({ now, randomInt: gen(seed) });
const last = <T>(a: T[]): T | undefined => a[a.length - 1];
const codeOf = (r: sig.Rooms): string => (r.message('h', host)[0]?.msg as { code: string }).code;

describe('room-code rules: relay package vs signalling relay', () => {
  it('share the constants', () => {
    expect(sig.CODE_ALPHABET).toBe(pkg.CODE_ALPHABET);
    expect(sig.CODE_LENGTH).toBe(pkg.CODE_LENGTH);
    expect(sig.ROOM_TTL_MS).toBe(pkg.ROOM_TTL_MS);
    expect(sig.MAX_ROOMS).toBe(pkg.MAX_ROOMS);
  });

  it.each([1, 7, 99, 123456789, 0xdeadbeef])('generate the same code for seed %i', (seed) => {
    const out = fresh(() => 0, seed).message('h', host);
    expect(out).toEqual([{ to: 'h', msg: { t: 'room', code: pkg.generateRoomCode(gen(seed)) } }]);
  });

  it('expire a room at exactly the TTL', () => {
    let now = 5000;
    const a = fresh(() => now);
    const codeA = codeOf(a);
    now = 5000 + pkg.ROOM_TTL_MS - 1;
    expect(last(a.message('g', join(codeA)))?.msg).toEqual({ t: 'joined' });

    now = 0;
    const b = fresh(() => now);
    const codeB = codeOf(b);
    now = pkg.ROOM_TTL_MS;
    expect(last(b.message('g', join(codeB)))?.msg).toEqual({ t: 'error', reason: 'no-room' });
  });

  it('cap rooms at MAX_ROOMS', () => {
    const r = fresh(() => 0);
    for (let i = 0; i < pkg.MAX_ROOMS; i++) {
      expect(last(r.message('c' + String(i), host))?.msg.t).toBe('room');
    }
    expect(last(r.message('extra', host))?.msg).toEqual({ t: 'error', reason: 'full-house' });
  });

  it('normalise typed codes the same way', () => {
    const r = fresh();
    const code = codeOf(r);
    expect(pkg.normalizeRoomCode(` ${code.toLowerCase()} `)).toBe(code);
    expect(last(r.message('g', join(` ${code.toLowerCase()} `)))?.msg).toEqual({ t: 'joined' });
  });

  it('accept the same code shapes', () => {
    const samples = [
      'abcdef',
      ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').flatMap((c) => [5, 6, 7].map((n) => c.repeat(n))),
    ];
    for (const s of samples) expect(ROOM_CODE_RE.test(s), s).toBe(pkg.isRoomCode(s));
  });

  it('keeps the signalling relay free of the relay package', () => {
    const dir = resolve(root, 'tools/signal-relay');
    const files = [
      ...readdirSync(dir)
        .filter((f) => f.endsWith('.ts'))
        .map((f) => resolve(dir, f)),
      resolve(root, 'src/game/net/relay.ts'),
    ];
    for (const f of files) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\bfrom\s+'([^']+)'/g)) {
        expect(m[1], f).not.toMatch(/core\/relay|@tamingtheelements\/relay/);
      }
    }
  });
});
