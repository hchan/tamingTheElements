/**
 * Room logic of the optional signalling relay (docs/WEBRTC-PLAN.md WP 10). Pure: no sockets, no clock, no randomness of its
 * own (both injected), so the Node server, the Cloudflare Worker and the unit tests share it. A room has two members (host,
 * guest), a 6-character code and a 10 minute life. Only SDP signalling codes are relayed ("sig" messages: a size-capped
 * string of code characters); gameplay never travels here and nothing is stored once a room is gone.
 */

export const ROOM_TTL_MS = 10 * 60_000;
export const MAX_SIG_CHARS = 8192;
export const MAX_ROOMS = 2000;
/** No 0/O/1/I: a code read aloud or from a phone screen. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export type ClientMsg = { t: 'host' } | { t: 'join'; code: string } | { t: 'sig'; data: string };
export type ErrorReason = 'bad-message' | 'too-big' | 'busy' | 'no-room' | 'full' | 'full-house';
export type ServerMsg =
  | { t: 'room'; code: string }
  | { t: 'joined' }
  | { t: 'sig'; data: string }
  | { t: 'left' }
  | { t: 'error'; reason: ErrorReason };

export interface Outgoing {
  to: string;
  msg: ServerMsg;
}

interface Room {
  host: string;
  guest: string | undefined;
  /** The host's offer, kept so a guest who joins after it was sent still gets it. */
  offer: string | undefined;
  expires: number;
}

export interface RoomsDeps {
  /** Milliseconds (Date.now is fine outside src/core). */
  now: () => number;
  /** Uniform integer in [0, n). */
  randomInt: (n: number) => number;
}

const SIG_CHARS = /^[A-Za-z0-9._~+/=-]+$/;

/** Parses one client frame; undefined when it is not one of the three messages. */
export function parseClientMsg(raw: string): ClientMsg | { t: 'too-big' } | undefined {
  if (raw.length > MAX_SIG_CHARS + 64) return { t: 'too-big' };
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return undefined;
  }
  if (typeof v !== 'object' || v === null) return undefined;
  const o = v as Record<string, unknown>;
  if (o['t'] === 'host') return { t: 'host' };
  if (o['t'] === 'join' && typeof o['code'] === 'string') return { t: 'join', code: o['code'].trim().toUpperCase() };
  if (o['t'] === 'sig' && typeof o['data'] === 'string') {
    if (o['data'].length > MAX_SIG_CHARS) return { t: 'too-big' };
    return SIG_CHARS.test(o['data']) ? { t: 'sig', data: o['data'] } : undefined;
  }
  return undefined;
}

export class Rooms {
  private readonly rooms = new Map<string, Room>();
  private readonly where = new Map<string, string>();

  constructor(private readonly deps: RoomsDeps) {}

  get size(): number {
    return this.rooms.size;
  }

  /** One frame from connection `conn`; the messages to send in answer (to this or the other member). */
  message(conn: string, raw: string): Outgoing[] {
    const out: Outgoing[] = [];
    this.expire(out);
    const err = (reason: ErrorReason): Outgoing[] => [...out, { to: conn, msg: { t: 'error', reason } }];
    const m = parseClientMsg(raw);
    if (m === undefined) return err('bad-message');
    if (m.t === 'too-big') return err('too-big');
    if (m.t === 'host') {
      if (this.where.has(conn)) return err('busy');
      if (this.rooms.size >= MAX_ROOMS) return err('full-house');
      const code = this.freshCode();
      this.rooms.set(code, { host: conn, guest: undefined, offer: undefined, expires: this.deps.now() + ROOM_TTL_MS });
      this.where.set(conn, code);
      return [...out, { to: conn, msg: { t: 'room', code } }];
    }
    if (m.t === 'join') {
      if (this.where.has(conn)) return err('busy');
      const room = this.rooms.get(m.code);
      if (room === undefined) return err('no-room');
      if (room.guest !== undefined) return err('full');
      room.guest = conn;
      this.where.set(conn, m.code);
      out.push({ to: room.host, msg: { t: 'joined' } });
      out.push({ to: conn, msg: room.offer === undefined ? { t: 'joined' } : { t: 'sig', data: room.offer } });
      return out;
    }
    const code = this.where.get(conn);
    const room = code === undefined ? undefined : this.rooms.get(code);
    if (room === undefined) return err('no-room');
    if (conn === room.host) {
      room.offer = m.data;
      if (room.guest !== undefined) out.push({ to: room.guest, msg: { t: 'sig', data: m.data } });
      return out;
    }
    out.push({ to: room.host, msg: { t: 'sig', data: m.data } });
    return out;
  }

  /** A connection closed: the room ends with its host; a guest leaving frees the seat. The other member is told. */
  close(conn: string): Outgoing[] {
    const code = this.where.get(conn);
    this.where.delete(conn);
    const room = code === undefined ? undefined : this.rooms.get(code);
    if (code === undefined || room === undefined) return [];
    if (conn === room.host) {
      this.rooms.delete(code);
      if (room.guest === undefined) return [];
      this.where.delete(room.guest);
      return [{ to: room.guest, msg: { t: 'left' } }];
    }
    room.guest = undefined;
    return [{ to: room.host, msg: { t: 'left' } }];
  }

  /** Drops expired rooms; the caller sends `out` and closes the returned connections. Call now and then. */
  sweep(): { out: Outgoing[]; closeConns: string[] } {
    const out: Outgoing[] = [];
    const closeConns = this.expire(out);
    return { out, closeConns };
  }

  private expire(out: Outgoing[]): string[] {
    const t = this.deps.now();
    const gone: string[] = [];
    for (const [code, room] of this.rooms) {
      if (room.expires > t) continue;
      this.rooms.delete(code);
      for (const c of [room.host, room.guest]) {
        if (c === undefined) continue;
        this.where.delete(c);
        out.push({ to: c, msg: { t: 'left' } });
        gone.push(c);
      }
    }
    return gone;
  }

  private freshCode(): string {
    for (;;) {
      let code = '';
      for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[this.deps.randomInt(CODE_ALPHABET.length)] ?? 'A';
      if (!this.rooms.has(code)) return code;
    }
  }
}
