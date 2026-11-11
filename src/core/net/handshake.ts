import { flagBits, hasTesterFlags } from '../flags';
import type { MatchSetup } from '../sim/match';

/** Magic prefix of a handshake message ("TTE" + 1), so a stray datagram is never taken for one. */
const MAGIC = 0x54544501;
const MAX_ROSTER = 4;

export type HandshakeMismatch = 'simVersion' | 'flags' | 'cheats' | 'seed' | 'chapter' | 'difficulty' | 'roster';

/** What each peer announces before tick 0; both must derive the identical MatchSetup, so the exchange is a pure equality check. */
export interface Hello {
  readonly simVersion: number;
  readonly flags: number;
  readonly cheats: boolean;
  readonly seed: number;
  readonly chapter: number;
  readonly difficulty: number;
  readonly p1: readonly { readonly character: string; readonly xp: number }[];
  readonly p2: readonly { readonly character: string; readonly xp: number }[];
}

export function helloOf(setup: MatchSetup): Hello {
  return {
    simVersion: setup.simVersion,
    flags: flagBits(setup.flags),
    cheats: hasTesterFlags(setup.flags),
    seed: setup.seed >>> 0,
    chapter: setup.chapter,
    difficulty: setup.difficulty,
    p1: setup.p1.map((m) => ({ character: m.character, xp: m.xp })),
    p2: setup.p2.map((m) => ({ character: m.character, xp: m.xp })),
  };
}

const MAX_SLUG = 40;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Wire: magic u32, simVersion u16, flags u32, cheats u8, seed u32, chapter u8, difficulty f32, then each roster (u8 n, n x (u8 len, slug bytes, u32 xp)). */
export function encodeHello(h: Hello): Uint8Array {
  const out: number[] = [];
  const head = new DataView(new ArrayBuffer(20));
  head.setUint32(0, MAGIC);
  head.setUint16(4, h.simVersion);
  head.setUint32(6, h.flags >>> 0);
  head.setUint8(10, h.cheats ? 1 : 0);
  head.setUint32(11, h.seed);
  head.setUint8(15, h.chapter);
  head.setFloat32(16, h.difficulty);
  out.push(...new Uint8Array(head.buffer));
  for (const r of [h.p1, h.p2]) {
    out.push(r.length);
    for (const m of r) {
      const slug = Array.from(m.character, (c) => c.charCodeAt(0) & 0x7f);
      const xp = new DataView(new ArrayBuffer(4));
      xp.setUint32(0, m.xp);
      out.push(slug.length, ...slug, ...new Uint8Array(xp.buffer));
    }
  }
  return Uint8Array.from(out);
}

/** The peer is untrusted: undefined for anything malformed (wrong magic, oversized roster, trailing bytes); never throws. */
export function decodeHello(buf: Uint8Array): Hello | undefined {
  if (buf.length < 22) return undefined;
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  if (dv.getUint32(0) !== MAGIC) return undefined;
  const simVersion = dv.getUint16(4);
  const flags = dv.getUint32(6);
  const cheatsByte = dv.getUint8(10);
  if (cheatsByte > 1) return undefined;
  const seed = dv.getUint32(11);
  const chapter = dv.getUint8(15);
  const difficulty = dv.getFloat32(16);
  let o = 20;
  const rosters: { character: string; xp: number }[][] = [];
  for (let k = 0; k < 2; k++) {
    if (o >= buf.length) return undefined;
    const n = dv.getUint8(o++);
    if (n > MAX_ROSTER) return undefined;
    const r: { character: string; xp: number }[] = [];
    for (let i = 0; i < n; i++) {
      if (o >= buf.length) return undefined;
      const len = dv.getUint8(o++);
      if (len === 0 || len > MAX_SLUG || o + len + 4 > buf.length) return undefined;
      const character = String.fromCharCode(...buf.subarray(o, o + len));
      if (!SLUG.test(character)) return undefined;
      o += len;
      r.push({ character, xp: dv.getUint32(o) });
      o += 4;
    }
    rosters.push(r);
  }
  if (o !== buf.length || !Number.isFinite(difficulty)) return undefined;
  return { simVersion, flags, cheats: cheatsByte === 1, seed, chapter, difficulty, p1: rosters[0] ?? [], p2: rosters[1] ?? [] };
}

const rosterKey = (r: Hello['p1']): string => r.map((m) => `${m.character}:${String(m.xp)}`).join(',');
const sameRoster = (a: Hello['p1'], b: Hello['p1']): boolean => rosterKey(a) === rosterKey(b);

/** undefined when the peers agree and the match may start; otherwise the first thing that differs (cheats always refuse). */
export function checkHello(local: Hello, remote: Hello): HandshakeMismatch | undefined {
  if (local.cheats || remote.cheats) return 'cheats';
  if (local.simVersion !== remote.simVersion) return 'simVersion';
  if (local.flags !== remote.flags) return 'flags';
  if (local.seed !== remote.seed) return 'seed';
  if (local.chapter !== remote.chapter) return 'chapter';
  if (local.difficulty !== remote.difficulty) return 'difficulty';
  if (!sameRoster(local.p1, remote.p1) || !sameRoster(local.p2, remote.p2)) return 'roster';
  return undefined;
}
