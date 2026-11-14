/**
 * Compact signalling codes (docs/NETCODE.md, docs/WEBRTC-PLAN.md WP 02).
 *
 * A browser's data-channel-only SDP is 1-3 KB, but a connection needs only a handful of facts from it: offer or answer, the ICE
 * user fragment and password, the DTLS sha-256 fingerprint, the DTLS setup role and the UDP candidates. `packSdp` keeps exactly
 * those, binary-packed and base64url encoded behind the version prefix `T1.`; `unpackSdp` rebuilds a minimal SDP every browser
 * accepts. `packSdp` returns null for an SDP it cannot represent (another fingerprint hash, no UDP candidate, a second media
 * section, ...) so the caller can fall back to the full SDP.
 *
 * Binary layout (all numbers big-endian):
 *   byte  flags: bit 0 answer, bits 1-2 setup (0 actpass, 1 active, 2 passive), bit 3 a mid other than "0" follows
 *   u8 len + ASCII ice-ufrag, u8 len + ASCII ice-pwd, [u8 len + ASCII mid], 32 bytes fingerprint, u8 candidate count
 *   per candidate: byte (bits 0-1 type host/srflx/prflx/relay, bits 2-3 address kind v4/v6/mDNS uuid/text), u16 port, address
 *     (4 bytes, 16 bytes, 16 bytes, or u8 len + ASCII)
 * Dropped on purpose: foundation, priority (recomputed from order and type), generation, raddr/rport, TCP and RTCP candidates,
 * max-message-size (always the 262144 default; the game's messages are tiny).
 */

/** Every failure says this in plain words; peer.ts shows it to the player. */
export const BAD_CODE = 'That is not a connection code.';

export const CODE_PREFIX = 'T1.';
/** Longest compact code accepted: far above a real one (a dozen candidates fit in about 700 characters). */
export const MAX_CODE_LENGTH = 4096;

const SETUPS = ['actpass', 'active', 'passive'] as const;
const TYPES = ['host', 'srflx', 'prflx', 'relay'] as const;
/** RFC 8445 type preferences, in `TYPES` order. */
const TYPE_PREF = [126, 100, 110, 0] as const;
const ADDR_V4 = 0;
const ADDR_V6 = 1;
const ADDR_MDNS = 2;
const ADDR_TEXT = 3;
const MAX_CANDIDATES = 64;

const MDNS = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})\.local$/;
const ICE_TEXT = /^[\x21-\x7e]+$/;
const FINGERPRINT = /^[0-9A-Fa-f]{2}(:[0-9A-Fa-f]{2}){31}$/;

interface Candidate {
  type: number;
  addrKind: number;
  address: string;
  port: number;
}

function hexToBytes(hex: string): number[] {
  const out: number[] = [];
  for (let i = 0; i + 1 < hex.length; i += 2) out.push(parseInt(hex.slice(i, i + 2), 16));
  return out;
}

function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (const x of b) s += x.toString(16).padStart(2, '0');
  return s;
}

function parseIPv4(s: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (!m) return null;
  const out = m.slice(1).map(Number);
  return out.every((n) => n <= 255) ? out : null;
}

/** 16 bytes, or null for anything but plain colon-hex (zone ids, embedded IPv4 dots) so those stay text. */
function parseIPv6(s: string): number[] | null {
  if (!/^[0-9a-fA-F:]+$/.test(s) || !s.includes(':')) return null;
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const groups = (h: string): number[] | null => {
    if (h === '') return [];
    const parts = h.split(':');
    if (parts.some((p) => !/^[0-9a-fA-F]{1,4}$/.test(p))) return null;
    return parts.map((p) => parseInt(p, 16));
  };
  const head = groups(halves[0] ?? '');
  const tail = halves.length === 2 ? groups(halves[1] ?? '') : [];
  if (!head || !tail) return null;
  let all: number[];
  if (halves.length === 2) {
    const fill = 8 - head.length - tail.length;
    if (fill < 1) return null;
    all = [...head, ...new Array<number>(fill).fill(0), ...tail];
  } else {
    all = head;
  }
  if (all.length !== 8) return null;
  return all.flatMap((g) => [g >> 8, g & 255]);
}

/** RFC 5952 text: lower case, the first longest run of two or more zero groups compressed. */
function formatIPv6(b: Uint8Array): string {
  const g: number[] = [];
  for (let i = 0; i < 16; i += 2) g.push(((b[i] ?? 0) << 8) | (b[i + 1] ?? 0));
  let bestAt = -1;
  let bestLen = 0;
  for (let i = 0; i < 8; ) {
    if (g[i] !== 0) { i++; continue; }
    let j = i;
    while (j < 8 && g[j] === 0) j++;
    if (j - i > bestLen) { bestAt = i; bestLen = j - i; }
    i = j;
  }
  const hex = (xs: number[]): string => xs.map((x) => x.toString(16)).join(':');
  if (bestLen < 2) return hex(g);
  return `${hex(g.slice(0, bestAt))}::${hex(g.slice(bestAt + bestLen))}`;
}

function parseCandidate(line: string): Candidate | 'skip' | null {
  // candidate:<foundation> <component> <protocol> <priority> <address> <port> typ <type> [extensions]
  const f = line.slice('a=candidate:'.length).trim().split(/\s+/);
  if (f.length < 8 || f[6] !== 'typ') return null;
  const [, component, protocol, , address, portText, , typeText] = f as [string, string, string, string, string, string, string, string];
  const type = (TYPES as readonly string[]).indexOf(typeText);
  if (type < 0) return null;
  if (protocol.toLowerCase() !== 'udp' || component !== '1') return 'skip';
  const port = Number(portText);
  if (!/^\d{1,5}$/.test(portText) || port > 65535) return null;
  if (!ICE_TEXT.test(address) || address.length > 255) return null;
  if (parseIPv4(address)) return { type, addrKind: ADDR_V4, address, port };
  if (parseIPv6(address)) return { type, addrKind: ADDR_V6, address, port };
  if (MDNS.test(address)) return { type, addrKind: ADDR_MDNS, address, port };
  return { type, addrKind: ADDR_TEXT, address, port };
}

/** The compact code for `d`, or null when the description has something the compact form cannot carry. */
export function packSdp(d: RTCSessionDescriptionInit): string | null {
  if ((d.type !== 'offer' && d.type !== 'answer') || typeof d.sdp !== 'string') return null;
  const lines = d.sdp.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  let media = 0;
  let ufrag = '';
  let pwd = '';
  let mid = '0';
  let setup = -1;
  let fingerprint: number[] | null = null;
  let sctpPort = 5000;
  let seen = 0;
  const cands: Candidate[] = [];
  for (const l of lines) {
    if (l.startsWith('m=')) {
      if (++media > 1 || !/^m=application \d+ UDP\/DTLS\/SCTP webrtc-datachannel$/.test(l)) return null;
    } else if (l.startsWith('a=ice-ufrag:')) {
      ufrag = l.slice(12);
    } else if (l.startsWith('a=ice-pwd:')) {
      pwd = l.slice(10);
    } else if (l.startsWith('a=mid:')) {
      mid = l.slice(6);
    } else if (l.startsWith('a=setup:')) {
      setup = (SETUPS as readonly string[]).indexOf(l.slice(8));
    } else if (l.startsWith('a=sctp-port:')) {
      sctpPort = Number(l.slice(12));
    } else if (l.startsWith('a=fingerprint:')) {
      const [alg, value] = l.slice(14).split(' ');
      if (alg?.toLowerCase() !== 'sha-256' || !value || !FINGERPRINT.test(value)) return null;
      const bytes = hexToBytes(value.replace(/:/g, ''));
      if (fingerprint && fingerprint.join() !== bytes.join()) return null;
      fingerprint = bytes;
    } else if (l.startsWith('a=candidate:')) {
      seen++;
      const c = parseCandidate(l);
      if (c === null) return null;
      if (c !== 'skip') cands.push(c);
    }
  }
  if (media !== 1 || sctpPort !== 5000 || setup < 0 || !fingerprint) return null;
  if (!ICE_TEXT.test(ufrag) || ufrag.length > 255 || !ICE_TEXT.test(pwd) || pwd.length > 255) return null;
  if (!ICE_TEXT.test(mid) || mid.length > 255) return null;
  if ((seen > 0 && cands.length === 0) || cands.length > MAX_CANDIDATES) return null;

  const out: number[] = [];
  const text = (s: string): void => {
    out.push(s.length);
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  out.push((d.type === 'answer' ? 1 : 0) | (setup << 1) | (mid === '0' ? 0 : 8));
  text(ufrag);
  text(pwd);
  if (mid !== '0') text(mid);
  out.push(...fingerprint);
  out.push(cands.length);
  for (const c of cands) {
    out.push(c.type | (c.addrKind << 2), c.port >> 8, c.port & 255);
    if (c.addrKind === ADDR_V4) out.push(...(parseIPv4(c.address) ?? []));
    else if (c.addrKind === ADDR_V6) out.push(...(parseIPv6(c.address) ?? []));
    else if (c.addrKind === ADDR_MDNS) out.push(...hexToBytes(c.address.slice(0, -'.local'.length).replace(/-/g, '')));
    else text(c.address);
  }
  let bin = '';
  for (const b of out) bin += String.fromCharCode(b);
  return CODE_PREFIX + btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

class Reader {
  private i = 0;
  constructor(private readonly b: Uint8Array) {}
  u8(): number {
    const v = this.b[this.i++];
    if (v === undefined) throw new Error(BAD_CODE);
    return v;
  }
  bytes(n: number): Uint8Array {
    if (this.i + n > this.b.length) throw new Error(BAD_CODE);
    const v = this.b.subarray(this.i, this.i + n);
    this.i += n;
    return v;
  }
  text(): string {
    const n = this.u8();
    let s = '';
    for (const c of this.bytes(n)) {
      if (c < 0x21 || c > 0x7e) throw new Error(BAD_CODE);
      s += String.fromCharCode(c);
    }
    if (s === '') throw new Error(BAD_CODE);
    return s;
  }
  done(): boolean {
    return this.i === this.b.length;
  }
}

/** The description behind a compact code. Throws `BAD_CODE` for anything that is not a well-formed `T1.` code. */
export function unpackSdp(code: string): RTCSessionDescriptionInit {
  const c = code.replace(/\s+/g, '');
  if (!c.startsWith(CODE_PREFIX) || c.length > MAX_CODE_LENGTH) throw new Error(BAD_CODE);
  const body = c.slice(CODE_PREFIX.length);
  if (body === '' || !/^[A-Za-z0-9_-]+$/.test(body) || body.length % 4 === 1) throw new Error(BAD_CODE);
  let bin: string;
  try {
    bin = atob(body.replace(/-/g, '+').replace(/_/g, '/'));
  } catch {
    throw new Error(BAD_CODE);
  }
  const r = new Reader(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
  const flags = r.u8();
  const setup = SETUPS[(flags >> 1) & 3];
  if (setup === undefined || flags >> 4 !== 0) throw new Error(BAD_CODE);
  const ufrag = r.text();
  const pwd = r.text();
  const mid = flags & 8 ? r.text() : '0';
  const fp = bytesToHex(r.bytes(32)).replace(/../g, (h, o: number) => (o === 0 ? '' : ':') + h.toUpperCase());
  const n = r.u8();
  if (n > MAX_CANDIDATES) throw new Error(BAD_CODE);
  const lines: string[] = [];
  for (let k = 0; k < n; k++) {
    const head = r.u8();
    const type = head & 3;
    const kind = (head >> 2) & 3;
    if (head >> 4 !== 0) throw new Error(BAD_CODE);
    const port = (r.u8() << 8) | r.u8();
    let address: string;
    if (kind === ADDR_V4) address = [...r.bytes(4)].join('.');
    else if (kind === ADDR_V6) address = formatIPv6(r.bytes(16));
    else if (kind === ADDR_MDNS) address = `${bytesToHex(r.bytes(16)).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5')}.local`;
    else address = r.text();
    const priority = (TYPE_PREF[type] ?? 0) * 16_777_216 + (65_535 - k) * 256 + 255;
    lines.push(`a=candidate:${String(k + 1)} 1 udp ${String(priority)} ${address} ${String(port)} typ ${TYPES[type] ?? 'host'}`);
  }
  if (!r.done()) throw new Error(BAD_CODE);
  const sdp = [
    'v=0',
    'o=- 1 2 IN IP4 127.0.0.1',
    's=-',
    't=0 0',
    `a=group:BUNDLE ${mid}`,
    'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
    'c=IN IP4 0.0.0.0',
    `a=ice-ufrag:${ufrag}`,
    `a=ice-pwd:${pwd}`,
    `a=fingerprint:sha-256 ${fp}`,
    `a=setup:${setup}`,
    `a=mid:${mid}`,
    'a=sctp-port:5000',
    'a=max-message-size:262144',
    ...lines,
    ...(n > 0 ? ['a=end-of-candidates'] : []),
  ];
  return { type: flags & 1 ? 'answer' : 'offer', sdp: `${sdp.join('\r\n')}\r\n` };
}
