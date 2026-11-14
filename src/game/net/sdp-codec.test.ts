import { describe, expect, it } from 'vitest';
import { decodeSignal, encodeSignal } from './peer';
import { BAD_CODE, CODE_PREFIX, packSdp, unpackSdp } from './sdp-codec';

const crlf = (lines: string[]): string => `${lines.join('\r\n')}\r\n`;

const FP_CHROME = '32:FB:D8:54:1D:13:9C:25:E2:BE:79:54:DC:11:07:9D:6F:E9:A3:5C:8A:ED:7F:D6:56:EC:C7:62:88:92:EC:87';
const FP_FIREFOX = 'A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:01:12:23:34:45:56:67:78:89:9A:AB:BC:CD:DE:EF:F0';
const FP_SAFARI = '00:11:22:33:44:55:66:77:88:99:AA:BB:CC:DD:EE:FF:FF:EE:DD:CC:BB:AA:99:88:77:66:55:44:33:22:11:00';

/** Chromium offer, no STUN: two mDNS host candidates (recorded from Chromium 140 over loopback). */
const CHROME_OFFER = crlf([
  'v=0',
  'o=- 4867921210734162437 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:3661727915 1 udp 2113937151 744572a8-e8e0-4948-8b37-40cd7806f321.local 62832 typ host generation 0 network-cost 999',
  'a=candidate:72696176 1 udp 2113939711 c3fde63f-f5c7-4971-83f9-b70461cdcde3.local 51846 typ host generation 0 network-cost 999',
  'a=ice-ufrag:LIfD',
  'a=ice-pwd:HiODFhfL2JTEJx0uvdJJjUxS',
  'a=ice-options:trickle',
  `a=fingerprint:sha-256 ${FP_CHROME}`,
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
]);

/** Chromium offer with STUN: host, srflx IPv4 and srflx IPv6 (raddr/rport present). */
const CHROME_OFFER_STUN = crlf([
  'v=0',
  'o=- 2164488207561123340 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 49855 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 99.199.111.128',
  'a=candidate:2928400344 1 udp 2113937151 744572a8-e8e0-4948-8b37-40cd7806f321.local 49855 typ host generation 0 network-cost 999',
  'a=candidate:3609562095 1 udp 1677729535 99.199.111.128 49855 typ srflx raddr 0.0.0.0 rport 0 generation 0 network-cost 999',
  'a=candidate:3164707891 1 udp 1677732095 2001:569:5af0:3200:85d4:236e:675c:aed0 51235 typ srflx raddr :: rport 0 generation 0 network-cost 999',
  'a=ice-ufrag:n1fD',
  'a=ice-pwd:AU1ZKQ18qZxElee21gOZyPpD',
  'a=ice-options:trickle',
  `a=fingerprint:sha-256 ${FP_CHROME}`,
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
]);

/** Chromium answer: setup active, plain IPv4 host candidates. */
const CHROME_ANSWER = crlf([
  'v=0',
  'o=- 1122334455667788 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=candidate:1 1 udp 2122260223 192.168.1.23 54321 typ host generation 0 network-cost 10',
  'a=candidate:2 1 udp 2122194687 10.0.0.7 54322 typ host generation 0 network-cost 10',
  'a=candidate:3 1 udp 41885439 203.0.113.9 3478 typ relay raddr 203.0.113.9 rport 3478 generation 0',
  'a=ice-ufrag:Zq9s',
  'a=ice-pwd:0123456789abcdefghijklmn',
  'a=ice-options:trickle',
  `a=fingerprint:sha-256 ${FP_CHROME}`,
  'a=setup:active',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
]);

/** Firefox offer: session-level fingerprint, upper-case UDP, a TCP candidate, a=sendrecv, end-of-candidates, big max-message-size. */
const FIREFOX_OFFER = crlf([
  'v=0',
  'o=mozilla...THIS_IS_SDPARTA-99.0 6021438527183265741 0 IN IP4 0.0.0.0',
  's=-',
  't=0 0',
  `a=fingerprint:sha-256 ${FP_FIREFOX}`,
  'a=group:BUNDLE 0',
  'a=ice-options:trickle',
  'a=msid-semantic:WMS *',
  'm=application 56788 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 192.168.1.5',
  'a=candidate:0 1 UDP 2122252543 192.168.1.5 56788 typ host',
  'a=candidate:1 1 TCP 2105524479 192.168.1.5 9 typ host tcptype active',
  'a=candidate:2 1 UDP 2122187007 fd00:1234::5 49152 typ host',
  'a=candidate:3 1 UDP 1686052607 198.51.100.77 56788 typ srflx raddr 192.168.1.5 rport 56788',
  'a=sendrecv',
  'a=end-of-candidates',
  'a=ice-pwd:0a1b2c3d4e5f60718293a4b5c6d7e8f9',
  'a=ice-ufrag:1f2e3d4c',
  'a=mid:0',
  'a=setup:actpass',
  'a=sctp-port:5000',
  'a=max-message-size:1073741823',
]);

/** Safari offer: mDNS host candidates, TCP candidate, a loopback-ish IPv6, srflx. */
const SAFARI_OFFER = crlf([
  'v=0',
  'o=- 8268738934823894512 2 IN IP4 127.0.0.1',
  's=-',
  't=0 0',
  'a=group:BUNDLE 0',
  'a=extmap-allow-mixed',
  'a=msid-semantic: WMS',
  'm=application 9 UDP/DTLS/SCTP webrtc-datachannel',
  'c=IN IP4 0.0.0.0',
  'a=ice-ufrag:r3Tn',
  'a=ice-pwd:iAAT6m0o9NfGkx+Y2q3rZbcd',
  `a=fingerprint:sha-256 ${FP_SAFARI}`,
  'a=setup:actpass',
  'a=mid:0',
  'a=sctp-port:5000',
  'a=max-message-size:262144',
  'a=candidate:1415201349 1 udp 2113937151 6b2f2d0a-77b4-4a91-9d3a-0f3b4f2fa6c1.local 61444 typ host generation 0',
  'a=candidate:2415201350 1 tcp 1518280447 6b2f2d0a-77b4-4a91-9d3a-0f3b4f2fa6c1.local 9 typ host tcptype active generation 0',
  'a=candidate:3415201351 1 udp 2113939711 2001:db8:0:0:0:0:0:1 61445 typ host generation 0',
  'a=candidate:4415201352 1 udp 1677729535 192.0.2.44 61444 typ srflx raddr 0.0.0.0 rport 0 generation 0',
]);

interface Facts {
  ufrag: string;
  pwd: string;
  fp: string;
  setup: string;
  cands: string[];
}

function ipv6Groups(a: string): string {
  const [h = '', t = ''] = a.split('::');
  const hs = h === '' ? [] : h.split(':');
  const ts = t === '' ? [] : t.split(':');
  const mid = a.includes('::') ? new Array<string>(8 - hs.length - ts.length).fill('0') : [];
  return [...hs, ...mid, ...ts].map((g) => parseInt(g, 16).toString(16)).join(':');
}

/** What the codec promises to keep, normalised so two SDPs can be compared. TCP candidates are excluded. */
function facts(sdp: string): Facts {
  const lines = sdp.split(/\r?\n/);
  const attr = (name: string): string => {
    const l = lines.find((x) => x.startsWith(`a=${name}:`));
    return l ? l.slice(name.length + 3) : '';
  };
  const cands = lines
    .filter((l) => l.startsWith('a=candidate:'))
    .map((l) => l.slice(12).split(/\s+/))
    .filter((f) => (f[2] ?? '').toLowerCase() === 'udp')
    .map((f) => {
      const addr = f[4] ?? '';
      return `${addr.includes(':') ? ipv6Groups(addr) : addr} ${f[5] ?? ''} ${f[7] ?? ''}`;
    });
  return { ufrag: attr('ice-ufrag'), pwd: attr('ice-pwd'), fp: attr('fingerprint').replace('sha-256 ', ''), setup: attr('setup'), cands };
}

const SAMPLES: [string, RTCSdpType, string, number][] = [
  ['Chrome offer (mDNS)', 'offer', CHROME_OFFER, 2],
  ['Chrome offer with STUN (srflx v4 + v6)', 'offer', CHROME_OFFER_STUN, 3],
  ['Chrome answer (IPv4 host, relay)', 'answer', CHROME_ANSWER, 3],
  ['Firefox offer (TCP dropped)', 'offer', FIREFOX_OFFER, 3],
  ['Safari offer (mDNS, IPv6, TCP dropped)', 'offer', SAFARI_OFFER, 3],
];

describe('compact signalling codes (sdp-codec)', () => {
  for (const [name, type, sdp, count] of SAMPLES) {
    it(`round-trips ${name}`, () => {
      const code = packSdp({ type, sdp });
      expect(code).not.toBeNull();
      expect(code?.startsWith(CODE_PREFIX)).toBe(true);
      expect(code).toMatch(/^T1\.[A-Za-z0-9_-]+$/);
      const back = unpackSdp(code ?? '');
      expect(back.type).toBe(type);
      const before = facts(sdp);
      const after = facts(back.sdp ?? '');
      expect(after).toEqual(before);
      expect(after.cands).toHaveLength(count);
      expect(after.fp).toMatch(/^([0-9A-F]{2}:){31}[0-9A-F]{2}$/);
    });

    it(`rebuilds a well-formed data-channel SDP for ${name}`, () => {
      const rebuilt = unpackSdp(packSdp({ type, sdp }) ?? '').sdp ?? '';
      expect(rebuilt.endsWith('\r\n')).toBe(true);
      expect(rebuilt.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
      const lines = rebuilt.split('\r\n').filter((l) => l !== '');
      expect(lines.slice(0, 4)).toEqual(['v=0', 'o=- 1 2 IN IP4 127.0.0.1', 's=-', 't=0 0']);
      expect(lines).toContain('a=group:BUNDLE 0');
      expect(lines).toContain('m=application 9 UDP/DTLS/SCTP webrtc-datachannel');
      expect(lines).toContain('a=mid:0');
      expect(lines).toContain('a=sctp-port:5000');
      expect(lines.filter((l) => l.startsWith('m='))).toHaveLength(1);
      expect(lines.at(-1)).toBe('a=end-of-candidates');
      for (const l of lines) expect(l).toMatch(/^[a-z]=\S/);
    });
  }

  it('keeps the setup role', () => {
    expect(facts(unpackSdp(packSdp({ type: 'answer', sdp: CHROME_ANSWER }) ?? '').sdp ?? '').setup).toBe('active');
    expect(facts(unpackSdp(packSdp({ type: 'offer', sdp: CHROME_OFFER }) ?? '').sdp ?? '').setup).toBe('actpass');
    const passive = CHROME_ANSWER.replace('a=setup:active', 'a=setup:passive');
    expect(facts(unpackSdp(packSdp({ type: 'answer', sdp: passive }) ?? '').sdp ?? '').setup).toBe('passive');
  });

  it('keeps a mid other than 0', () => {
    const sdp = CHROME_OFFER.replace('a=group:BUNDLE 0', 'a=group:BUNDLE data').replace('a=mid:0', 'a=mid:data');
    const back = unpackSdp(packSdp({ type: 'offer', sdp }) ?? '').sdp ?? '';
    expect(back).toContain('a=mid:data\r\n');
    expect(back).toContain('a=group:BUNDLE data\r\n');
  });

  it('keeps IPv6 text in canonical compressed form and unusual hosts as text', () => {
    const sdp = SAFARI_OFFER.replace('a=ice-ufrag', 'a=candidate:9 1 udp 1 2001:db8::1:0:0:1 7 typ host\r\na=candidate:8 1 udp 1 turn.example.net 8 typ relay\r\na=ice-ufrag');
    const back = unpackSdp(packSdp({ type: 'offer', sdp }) ?? '').sdp ?? '';
    expect(back).toContain(' 2001:db8::1 61445 typ host');
    expect(back).toContain(' 2001:db8::1:0:0:1 7 typ host');
    expect(back).toContain(' turn.example.net 8 typ relay');
    expect(back).toContain(' 6b2f2d0a-77b4-4a91-9d3a-0f3b4f2fa6c1.local 61444 typ host');
  });

  it('is under 200 characters for a typical Chrome offer, with and without STUN', () => {
    expect(packSdp({ type: 'offer', sdp: CHROME_OFFER })?.length).toBeLessThan(200);
    expect(packSdp({ type: 'offer', sdp: CHROME_OFFER_STUN })?.length).toBeLessThan(200);
    expect(packSdp({ type: 'answer', sdp: CHROME_ANSWER })?.length).toBeLessThan(200);
  });

  it('declines what it cannot represent (the caller falls back to the full SDP)', () => {
    expect(packSdp({ type: 'offer', sdp: CHROME_OFFER.replace('sha-256', 'sha-384') })).toBeNull();
    expect(packSdp({ type: 'offer', sdp: CHROME_OFFER.replace(/a=candidate:[^\r]*udp/g, 'a=candidate:1 1 tcp') })).toBeNull();
    expect(packSdp({ type: 'offer', sdp: CHROME_OFFER.replace('a=sctp-port:5000', 'a=sctp-port:5001') })).toBeNull();
    expect(packSdp({ type: 'offer', sdp: CHROME_OFFER.replace('webrtc-datachannel', 'webrtc') })).toBeNull();
    expect(packSdp({ type: 'offer', sdp: `${CHROME_OFFER}m=audio 9 UDP/TLS/RTP/SAVPF 111\r\n` })).toBeNull();
    expect(packSdp({ type: 'offer', sdp: CHROME_OFFER.replace(/a=ice-pwd:.*\r\n/, '') })).toBeNull();
    expect(packSdp({ type: 'offer', sdp: CHROME_OFFER.replace(/a=candidate:\d+ 1 udp \d+ [\w.-]+ 62832 typ host/, 'a=candidate:1 1 udp 1 1.2.3.4 70000 typ host') })).toBeNull();
    expect(packSdp({ type: 'offer', sdp: 'v=0\r\n' })).toBeNull();
    expect(packSdp({ type: 'rollback' })).toBeNull();
  });

  it('accepts a code with pasted whitespace and newlines', () => {
    const code = packSdp({ type: 'offer', sdp: CHROME_OFFER }) ?? '';
    const wrapped = `  ${code.slice(0, 30)}\n${code.slice(30, 60)} \r\n${code.slice(60)}\n`;
    expect(unpackSdp(wrapped)).toEqual(unpackSdp(code));
  });

  it('rejects junk, truncation, trailing bytes, oversize and other versions in plain words', () => {
    const code = packSdp({ type: 'offer', sdp: CHROME_OFFER }) ?? '';
    const bad = [
      '',
      CODE_PREFIX,
      'T1',
      'hello',
      'T2.AAAA',
      `T2.${code.slice(3)}`,
      't1.AAAA',
      `${code}!`,
      `${code}A`,
      `${code}AA`,
      code.slice(0, code.length - 8),
      code.slice(0, 20),
      `${CODE_PREFIX}A`,
      `${CODE_PREFIX}${'A'.repeat(5000)}`,
      `${CODE_PREFIX}${'/'.repeat(40)}`,
      `${CODE_PREFIX}${'_'.repeat(200)}`,
      `${CODE_PREFIX}${'A'.repeat(200)}`,
    ];
    for (const b of bad) expect(() => unpackSdp(b), JSON.stringify(b.slice(0, 40))).toThrow(BAD_CODE);
    expect(BAD_CODE).toBe('That is not a connection code.');
  });

  it('never throws anything but the plain error on random garbage', () => {
    let s = 12345;
    const next = (): number => (s = (Math.imul(s, 1103515245) + 12345) >>> 0);
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    for (let i = 0; i < 300; i++) {
      let body = '';
      const n = next() % 160;
      for (let k = 0; k < n; k++) body += alphabet.charAt(next() % alphabet.length);
      try {
        unpackSdp(CODE_PREFIX + body);
      } catch (e) {
        expect((e as Error).message).toBe(BAD_CODE);
      }
    }
  });
});

describe('encodeSignal and decodeSignal with compact codes', () => {
  it('emit a compact code and check the kind', () => {
    const code = encodeSignal({ type: 'offer', sdp: CHROME_OFFER });
    expect(code.startsWith(CODE_PREFIX)).toBe(true);
    expect(decodeSignal(code, 'offer').type).toBe('offer');
    expect(() => decodeSignal(code, 'answer')).toThrow('That is not an answer code.');
    const answer = encodeSignal({ type: 'answer', sdp: CHROME_ANSWER });
    expect(() => decodeSignal(answer, 'offer')).toThrow('That is not an offer code.');
    expect(decodeSignal(`\n ${answer} \n`, 'answer').type).toBe('answer');
  });

  it('falls back to the long code for an SDP the compact form cannot carry, and still decodes it', () => {
    const sdp = CHROME_OFFER.replace('sha-256', 'sha-384');
    const code = encodeSignal({ type: 'offer', sdp });
    expect(code.startsWith(CODE_PREFIX)).toBe(false);
    expect(decodeSignal(code, 'offer')).toEqual({ type: 'offer', sdp });
  });

  it('still decodes the old base64 JSON codes', () => {
    const old = btoa(JSON.stringify({ type: 'answer', sdp: CHROME_ANSWER }));
    expect(decodeSignal(old, 'answer')).toEqual({ type: 'answer', sdp: CHROME_ANSWER });
    expect(() => decodeSignal(old, 'offer')).toThrow('That is not an offer code.');
  });

  it('throws plain words for junk', () => {
    for (const bad of ['', 'garbage', 'T1.', 'T1.AAAA', 'T9.AAAA']) {
      expect(() => decodeSignal(bad, 'offer')).toThrow(/^That is not (a connection|an offer) code\.$/);
    }
  });
});
