import { decodeFrame, encodeFrame, type Frame } from './codec';
import { ErrorCode, PROTOCOL_VERSION } from './constants';
import {
  fromHex,
  toHex,
  type ConformanceAdapter,
  type ConformanceCase,
  type ConformanceClient,
  type ConformanceHooks,
} from './conformance-kit';
import { decodeText, encodeText } from './text-codec';

// Shared by conformance-cases.ts and conformance-chat.ts (a pure move; no behaviour change).

export type Rx<K extends Frame['t']> = { frame: Extract<Frame, { t: K }>; raw: Uint8Array };
export const num = (a: number, b: number): number => a - b;
export const str = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
export const same = (a: Uint8Array, b: Uint8Array): boolean => toHex(a) === toHex(b);
export function check(ok: boolean, msg: string): void {
  if (!ok) throw new Error(msg);
}
export function eq(actual: unknown, expected: unknown, what: string): void {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${what}: expected ${e}, got ${a}`);
}

export interface Env {
  sleep(ms: number): Promise<void>;
  hooks: ConformanceHooks;
  timeoutMs: number;
  settleMs: number;
  sim: number;
}

/** One connected client: collects decoded frames, checks every server frame is canonical (re-encodes to the same bytes). */
export class Peer {
  private inbox: { frame: Frame; raw: Uint8Array }[] = [];
  private bad: string[] = [];
  closeCode: number | undefined;
  constructor(
    readonly client: ConformanceClient,
    private readonly env: Env,
  ) {
    client.onText((text) => {
      const raw = decodeText(text);
      if (raw === undefined) {
        this.bad.push(`server message is not standard base64 text: ${text.slice(0, 40)}`);
        return;
      }
      const d = decodeFrame(raw, 's2c');
      if (!d.ok) this.bad.push(`undecodable server frame (${d.reason}): ${toHex(raw)}`);
      else if (!same(encodeFrame(d.frame), raw))
        this.bad.push(`non-canonical ${d.frame.t} frame: ${toHex(raw)}`);
      else this.inbox.push({ frame: d.frame, raw: raw.slice() });
    });
    client.onClose((code) => {
      this.closeCode = code;
    });
  }
  send(f: Frame): Promise<void> | void {
    return this.client.sendText(encodeText(encodeFrame(f)));
  }
  /** Sends raw frame bytes, base64-encoded as text. */
  raw(b: Uint8Array): Promise<void> | void {
    return this.client.sendText(encodeText(b));
  }
  private fault(): void {
    if (this.bad.length > 0) throw new Error(this.bad[0]);
  }
  /** Waits for (and removes) the first received frame of type `t`; other frames stay queued, so arrival order never matters. */
  async take<K extends Frame['t']>(t: K, pred?: (f: Extract<Frame, { t: K }>) => boolean): Promise<Rx<K>> {
    for (let waited = 0; ; waited += 10) {
      this.fault();
      const i = this.inbox.findIndex(
        (x) => x.frame.t === t && (pred === undefined || pred(x.frame as Extract<Frame, { t: K }>)),
      );
      if (i >= 0) return (this.inbox.splice(i, 1) as unknown as Rx<K>[])[0] as Rx<K>;
      if (waited >= this.env.timeoutMs)
        throw new Error(`timeout waiting for ${t}; queued: [${this.inbox.map((x) => x.frame.t).join(', ')}]`);
      await this.env.sleep(10);
    }
  }
  async none(t?: Frame['t']): Promise<void> {
    await this.env.sleep(this.env.settleMs);
    this.fault();
    const left = this.inbox.filter((x) => t === undefined || x.frame.t === t).map((x) => x.frame.t);
    check(left.length === 0, `unexpected frames: [${left.join(', ')}]`);
  }
  /** Waits one settle period, then removes and counts every queued frame of type `t`. */
  async drain(t: Frame['t']): Promise<number> {
    await this.env.sleep(this.env.settleMs);
    this.fault();
    const n = this.inbox.filter((x) => x.frame.t === t).length;
    this.inbox = this.inbox.filter((x) => x.frame.t !== t);
    return n;
  }
  async closed(): Promise<number> {
    for (let waited = 0; ; waited += 10) {
      if (this.closeCode !== undefined) return this.closeCode;
      if (waited >= this.env.timeoutMs) throw new Error('timeout waiting for the relay to close the socket');
      await this.env.sleep(10);
    }
  }
  async open(): Promise<void> {
    await this.env.sleep(this.env.settleMs);
    check(this.closeCode === undefined, `socket closed unexpectedly with ${String(this.closeCode)}`);
  }
}

export interface Ctx {
  env: Env;
  adapter: ConformanceAdapter;
  peers: Peer[];
}

export async function connect(c: Ctx, sameIdentityAs?: Peer): Promise<Peer> {
  const p = new Peer(await c.adapter.connect(sameIdentityAs === undefined ? undefined : { sameIdentityAs: sameIdentityAs.client }), c.env);
  c.peers.push(p);
  return p;
}
/** Connect and HELLO; returns the peer and its WELCOME. */
export async function join(c: Ctx, sim = c.env.sim, resume = 0, sameIdentityAs?: Peer): Promise<[Peer, Rx<'welcome'>]> {
  const p = await connect(c, sameIdentityAs);
  await p.send({ t: 'hello', ver: PROTOCOL_VERSION, simVersion: sim, resumeSession: resume });
  return [p, await p.take('welcome')];
}
/** Two peers matched through the queue: [slot 0 peer, slot 1 peer, their MATCH_START frames]. The first to queue waited longer. */
export async function matched(c: Ctx): Promise<[Peer, Peer, Rx<'matchStart'>, Rx<'matchStart'>, [number, number]]> {
  const [a, wa] = await join(c);
  const [b, wb] = await join(c);
  await a.send({ t: 'queueJoin', mode: 0 });
  await a.take('queueState');
  await b.send({ t: 'queueJoin', mode: 0 });
  const [ma, mb] = [await a.take('matchStart'), await b.take('matchStart')];
  eq([ma.frame.slot, mb.frame.slot], [0, 1], 'queue slots (longest waiter gets slot 0)');
  return [a, b, ma, mb, [wa.frame.sessionId, wb.frame.sessionId]];
}
export const batchPacket = (match: number, tick: number): Uint8Array =>
  fromHex(`${match.toString(16).padStart(2, '0')} 00 00000000 ${tick.toString(16).padStart(8, '0')} 01 00000001 00`);
export const batchFrame = (seq: number, match: number): Frame => ({ t: 'batch', seq, match, packet: batchPacket(match, seq) });

/** Cases that send two frames back to back from different players (or one player) and need them handled in that order. */
const ORDER_SENSITIVE: ReadonlySet<string> = new Set(['hash.consumed', 'batch.far-ahead-seq']);

export function testCase(
  id: string,
  spec: string,
  title: string,
  body: (c: Ctx, hooks: ConformanceHooks) => Promise<void>,
): ConformanceCase {
  return {
    id,
    spec,
    title,
    ...(ORDER_SENSITIVE.has(id) ? { orderSensitive: true as const } : {}),
    async run(adapter, hooks) {
      const env: Env = {
        hooks,
        sleep: (ms) => (hooks.sleep === undefined ? Promise.resolve() : hooks.sleep(ms)),
        timeoutMs: hooks.timeoutMs ?? 2000,
        settleMs: hooks.settleMs ?? 50,
        sim: hooks.simVersion ?? 1,
      };
      const c: Ctx = { env, adapter, peers: [] };
      try {
        await body(c, hooks);
      } finally {
        await hooks.setResting?.(null);
        for (const p of c.peers) await p.client.close();
      }
    },
  };
}

/** Expects ERROR `code` then a close with 4000 + the code's low byte. */
export async function expectErrorClose(p: Peer, code: number): Promise<Rx<'error'>> {
  const e = await p.take('error', (f) => f.code === code);
  eq(await p.closed(), 4000 + (code & 0xff), 'close code');
  return e;
}

/** ERROR bad-frame; the close that follows is advisory (4001 expected from the reference relay, but a host may close with another code). */
export async function expectBadFrame(p: Peer): Promise<void> {
  await p.take('error', (f) => f.code === ErrorCode.badFrame);
  await p.closed();
}
