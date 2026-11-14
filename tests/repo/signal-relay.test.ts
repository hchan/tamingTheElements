import { afterEach, describe, expect, it } from 'vitest';
import { cleanRoomCode, hostRoom, joinRoom, relayUrl, type RelaySocketCtor } from '../../src/game/net/relay';
import { startRelay, type RelayHandle } from '../../tools/signal-relay/server';
import { CODE_ALPHABET, MAX_SIG_CHARS, ROOM_TTL_MS, Rooms, type Outgoing, type ServerMsg } from '../../tools/signal-relay/rooms';

/** The optional signalling relay (docs/WEBRTC-PLAN.md WP 10): room rules, the Node server over real sockets, and the client. */

function rooms(clock = { t: 0 }): { r: Rooms; clock: { t: number } } {
  let n = 0;
  return { r: new Rooms({ now: () => clock.t, randomInt: (k) => (n++ * 7) % k }), clock };
}
const frame = (o: object): string => JSON.stringify(o);
const to = (out: Outgoing[], conn: string): ServerMsg[] => out.filter((o) => o.to === conn).map((o) => o.msg);

describe('Rooms', () => {
  it('hands out 6-character codes from the unambiguous alphabet', () => {
    const { r } = rooms();
    const out = r.message('a', frame({ t: 'host' }));
    const m = to(out, 'a')[0];
    expect(m?.t).toBe('room');
    const code = m?.t === 'room' ? m.code : '';
    expect(code).toHaveLength(6);
    for (const c of code) expect(CODE_ALPHABET).toContain(c);
    expect(CODE_ALPHABET).not.toMatch(/[01IO]/);
  });

  it('relays offer to a guest who joins later and the answer back, case and spaces forgiven', () => {
    const { r } = rooms();
    const code = (to(r.message('h', frame({ t: 'host' })), 'h')[0] as { code: string }).code;
    r.message('h', frame({ t: 'sig', data: 'T1.offer' }));
    const joined = r.message('g', frame({ t: 'join', code: ` ${code.toLowerCase()} ` }));
    expect(to(joined, 'h')).toEqual([{ t: 'joined' }]);
    expect(to(joined, 'g')).toEqual([{ t: 'sig', data: 'T1.offer' }]);
    expect(to(r.message('g', frame({ t: 'sig', data: 'T1.answer' })), 'h')).toEqual([{ t: 'sig', data: 'T1.answer' }]);
  });

  it('allows only two members and one room per connection', () => {
    const { r } = rooms();
    const code = (to(r.message('h', frame({ t: 'host' })), 'h')[0] as { code: string }).code;
    expect(to(r.message('h', frame({ t: 'host' })), 'h')).toEqual([{ t: 'error', reason: 'busy' }]);
    r.message('g', frame({ t: 'join', code }));
    expect(to(r.message('x', frame({ t: 'join', code })), 'x')).toEqual([{ t: 'error', reason: 'full' }]);
    expect(to(r.message('x', frame({ t: 'join', code: 'ZZZZZZ' })), 'x')).toEqual([{ t: 'error', reason: 'no-room' }]);
    expect(to(r.message('nobody', frame({ t: 'sig', data: 'abc' })), 'nobody')).toEqual([{ t: 'error', reason: 'no-room' }]);
  });

  it('relays only size-capped code characters', () => {
    const { r } = rooms();
    r.message('h', frame({ t: 'host' }));
    const bad = (raw: string): ServerMsg | undefined => to(r.message('h', raw), 'h')[0];
    expect(bad('not json')).toEqual({ t: 'error', reason: 'bad-message' });
    expect(bad(frame({ t: 'chat', text: 'hi' }))).toEqual({ t: 'error', reason: 'bad-message' });
    expect(bad(frame({ t: 'sig', data: '<script>' }))).toEqual({ t: 'error', reason: 'bad-message' });
    expect(bad(frame({ t: 'sig', data: 'a'.repeat(MAX_SIG_CHARS + 1) }))).toEqual({ t: 'error', reason: 'too-big' });
    expect(bad('x'.repeat(MAX_SIG_CHARS + 500))).toEqual({ t: 'error', reason: 'too-big' });
    expect(bad(frame({ t: 'sig', data: 'a'.repeat(MAX_SIG_CHARS) }))).toBeUndefined();
  });

  it('expires a room after 10 minutes and tells both members', () => {
    const { r, clock } = rooms();
    const code = (to(r.message('h', frame({ t: 'host' })), 'h')[0] as { code: string }).code;
    r.message('g', frame({ t: 'join', code }));
    clock.t = ROOM_TTL_MS - 1;
    expect(r.sweep().closeConns).toEqual([]);
    clock.t = ROOM_TTL_MS;
    const s = r.sweep();
    expect(s.closeConns.sort()).toEqual(['g', 'h']);
    expect(to(s.out, 'g')).toEqual([{ t: 'left' }]);
    expect(r.size).toBe(0);
    expect(to(r.message('x', frame({ t: 'join', code })), 'x')).toEqual([{ t: 'error', reason: 'no-room' }]);
  });

  it('closing the host ends the room; a leaving guest frees the seat', () => {
    const { r } = rooms();
    const code = (to(r.message('h', frame({ t: 'host' })), 'h')[0] as { code: string }).code;
    r.message('g', frame({ t: 'join', code }));
    expect(to(r.close('g'), 'h')).toEqual([{ t: 'left' }]);
    expect(to(r.message('g2', frame({ t: 'join', code })), 'h')).toEqual([{ t: 'joined' }]);
    expect(to(r.close('h'), 'g2')).toEqual([{ t: 'left' }]);
    expect(r.size).toBe(0);
  });
});

describe('client helpers', () => {
  it('shows the relay only when a build or (dev/test) the URL asks for it', () => {
    expect(relayUrl('', true, undefined)).toBeUndefined();
    expect(relayUrl('?signal=ws://127.0.0.1:1', true, undefined)).toBe('ws://127.0.0.1:1');
    expect(relayUrl('?signal=ws://127.0.0.1:1', false, undefined)).toBeUndefined();
    expect(relayUrl('', false, 'wss://relay.example')).toBe('wss://relay.example');
    expect(relayUrl('?signal=http://x', true, undefined)).toBeUndefined();
  });
  it('cleans typed room codes', () => {
    expect(cleanRoomCode(' k7p 2qm ')).toBe('K7P2QM');
    expect(cleanRoomCode('K7P2Q')).toBeUndefined();
    expect(cleanRoomCode('K7P2Q0')).toBeUndefined();
  });
});

describe('relay over real sockets (Node server, client code)', () => {
  let relay: RelayHandle | undefined;
  afterEach(async () => {
    await relay?.close();
    relay = undefined;
  });
  const Ctor = WebSocket as unknown as RelaySocketCtor;

  it('connects a host and a joiner with a room code only', async () => {
    relay = await startRelay();
    const url = `ws://127.0.0.1:${String(relay.port)}`;
    const host = await hostRoom(url, 'T1.offer', Ctor);
    expect(host.code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    const guest = await joinRoom(url, host.code, Ctor);
    expect(guest.offer).toBe('T1.offer');
    guest.reply('T1.answer');
    expect(await host.answer).toBe('T1.answer');
    host.close();
    guest.close();
  });

  it('says in words when the room is missing or the server is down', async () => {
    relay = await startRelay();
    const url = `ws://127.0.0.1:${String(relay.port)}`;
    await expect(joinRoom(url, 'ZZZZZZ', Ctor)).rejects.toThrow(/not found/);
    const dead = relay.port;
    await relay.close();
    relay = undefined;
    await expect(joinRoom(`ws://127.0.0.1:${String(dead)}`, 'ZZZZZZ', Ctor)).rejects.toThrow(/Could not reach/);
  });
});
