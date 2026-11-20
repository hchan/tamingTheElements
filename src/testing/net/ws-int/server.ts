import { createServer, STATUS_CODES, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { RelayCore, type RelayCtx, type RelayOptions, type Sender } from '../../../core/relay';
import { InMemoryStore } from '../../../core/relay/testing';
import { decodeText, encodeText } from '../../../game/net/ws/text-codec';
import { encodeFrame, type Frame } from '../../../game/net/ws/wire';
import { BASE, FakeService, type ServedWs } from '../fake-online-service';
import { ANY_PORT, GatewayNotice, LCG, LOOPBACK_HOST, RELAY_CLOCK_START_MS } from './constants';

/** A real `ws` server on loopback for the OnlineClient and the relay (docs/ONLINE-CLIENT.md). Hermetic: loopback, port 0, no real names. */

export type Delivery = 'text' | 'ascii-binary';
export interface Received {
  readonly binary: boolean;
  readonly data: string | Uint8Array;
}
export interface HttpOverride {
  readonly status: number;
  /** An object is sent as JSON; a string as is (for a gateway HTML page). */
  readonly body: unknown;
  readonly headers?: Readonly<Record<string, string>>;
  /** Applies to the next request only. */
  readonly once?: boolean;
}
export interface ServerOptions {
  /** `fake`: the FakeService frame logic. `relay`: RelayCore over an in-memory store. Tickets come from the FakeService in both. */
  readonly backend: 'fake' | 'relay';
  readonly delivery?: Delivery;
  readonly relayOptions?: RelayOptions;
}

export class ServerConn implements ServedWs {
  readonly received: Received[] = [];
  /** Messages written to the socket, counted synchronously (what the client tap must reach). */
  sent = 0;
  closed = false;
  closeCode: number | undefined;
  constructor(readonly id: string, readonly url: string, readonly ws: WebSocket, private readonly srv: WsServer) {}

  get readyState(): number { return this.ws.readyState === 1 ? 1 : 3; }

  /** The text frames received, decoded to bytes (binary or non-base64 messages are skipped). */
  frames(): Uint8Array[] {
    return this.received.flatMap((r) => (typeof r.data === 'string' ? [decodeText(r.data)] : [])).filter((b): b is Uint8Array => b !== undefined);
  }
  framesOfType(type: number): Uint8Array[] { return this.frames().filter((b) => b[0] === type); }

  /** One already-encoded base64 message, in the server's current delivery mode. */
  sendEncoded(text: string): void {
    if (this.srv.delivery === 'text') this.write(text, false);
    else this.write(Buffer.from(text, 'latin1'), true);
  }
  sendBytes(bytes: Uint8Array): void { this.sendEncoded(encodeText(bytes)); }
  sendFrame(f: Frame): void { this.sendBytes(encodeFrame(f)); }
  serve(bytes: Uint8Array): void { this.sendBytes(bytes); }
  /** A gateway-style failure notice, never produced by RelayCore. `plain`: the bare phrase; `json`: a message with a connectionId and requestId. */
  sendNotice(form: 'plain' | 'json', phrase: string = GatewayNotice.internal, binary = false): void {
    const text = form === 'plain' ? phrase : JSON.stringify({ message: phrase, connectionId: this.id, requestId: `req-${String(this.sent)}` });
    this.write(binary ? Buffer.from(text, 'utf8') : text, binary);
  }
  /** The bytes as a binary message as they are (non-ASCII, so a client must treat it as malformed). */
  sendRawBinary(bytes: Uint8Array): void { this.write(Buffer.from(bytes), true); }
  drop(code: number): void { this.close(code); }
  close(code: number): void { if (this.ws.readyState === 1) this.ws.close(code); }
  terminate(): void { this.ws.terminate(); }

  private write(data: string | Buffer, binary: boolean): void {
    if (this.ws.readyState !== 1) return;
    this.sent++;
    this.ws.send(data, { binary });
    this.srv.notify();
  }
}

export class WsServer {
  delivery: Delivery;
  readonly conns: ServerConn[] = [];
  readonly upgrades: { url: string; accepted: boolean }[] = [];
  readonly http = {
    log: [] as { method: string; path: string; status: number }[],
    override: (path: string, o: HttpOverride): void => { this.overrides.set(path, o); },
    clearOverride: (path: string): void => { this.overrides.delete(path); },
  };
  /** An HTTP status to answer every upgrade with (like a denied gateway connect); the client sees an error, then close 1006. */
  refuseUpgrade: number | undefined;
  /** Returning true consumes the frame and skips the default handling. */
  intercept: ((conn: ServerConn, rx: Received) => boolean) | undefined;
  /** The virtual clock of the server: ticket age and (relay backend) RelayCore time. Moves only through `advance`. */
  readonly clock = { ms: RELAY_CLOCK_START_MS };
  /** Ticket store and HTTP answers of both backends; frame logic too for the fake backend. */
  readonly svc = new FakeService(this.clock);
  readonly relay: { core: RelayCore; store: InMemoryStore; setResting: (sec: number | null) => void } | undefined;
  private readonly overrides = new Map<string, HttpOverride>();
  private readonly watchers = new Set<() => void>();
  private readonly pending = new Set<Promise<void>>();
  private readonly wss = new WebSocketServer({ noServer: true });
  private resting: RelayCtx['resting'];
  private lcg: number = LCG.seed;

  constructor(readonly server: Server, readonly opts: ServerOptions) {
    this.delivery = opts.delivery ?? 'text';
    if (opts.backend === 'relay') {
      const sender: Sender = {
        send: (id, text) => { this.conns.find((c) => c.id === id)?.sendEncoded(text); },
        close: (id, code) => { this.conns.find((c) => c.id === id)?.close(code); },
      };
      const store = new InMemoryStore(() => this.clock.ms);
      this.relay = { core: new RelayCore(store, sender, opts.relayOptions), store, setResting: (s) => { this.resting = s === null ? undefined : { retryAfterSec: s }; } };
    }
    server.on('request', (req, res) => { void this.onRequest(req, res); });
    server.on('upgrade', (req, socket, head) => { this.onUpgrade(req, socket, head); });
  }

  get port(): number { return (this.server.address() as AddressInfo).port; }

  /** Calls `fn` whenever something observable changed (a frame in or out, a connect, a close); returns the unsubscribe. */
  watch(fn: () => void): () => void {
    this.watchers.add(fn);
    return () => { this.watchers.delete(fn); };
  }
  notify(): void { for (const w of [...this.watchers]) w(); }

  /** Moves the clock; with the relay backend also runs RelayCore.sweep. */
  async advance(ms: number): Promise<void> {
    await Promise.all([...this.pending]);
    this.clock.ms += ms;
    await this.relay?.core.sweep(this.ctx());
  }

  async close(): Promise<void> {
    for (const c of this.wss.clients) c.terminate();
    this.server.closeAllConnections();
    await new Promise<void>((r) => { this.server.close(() => { r(); }); });
  }

  private ctx(): RelayCtx {
    return {
      now: () => this.clock.ms,
      randomInt: (n) => {
        this.lcg = (Math.imul(this.lcg, LCG.mul) + LCG.add) >>> 0;
        return this.lcg % n;
      },
      ...(this.resting === undefined ? {} : { resting: this.resting }),
    };
  }

  private async onRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const method = req.method ?? 'GET';
    const path = req.url ?? '';
    let body = '';
    for await (const chunk of req) body += String(chunk);
    let status = 404;
    let payload: unknown = { error: 'not found' };
    const headers: Record<string, string> = {};
    const o = this.overrides.get(path);
    if (o) {
      if (o.once === true) this.overrides.delete(path);
      status = o.status;
      payload = o.body;
      Object.assign(headers, o.headers);
    } else if (path === '/session' || path === '/ticket') {
      const r = await this.svc.fetch(BASE + path, { method, headers: {}, body });
      status = r.status;
      payload = await r.json();
    }
    if (typeof payload !== 'string' && headers['Content-Type'] === undefined) headers['Content-Type'] = 'application/json';
    this.http.log.push({ method, path, status });
    res.writeHead(status, headers);
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
    this.notify();
  }

  private onUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): void {
    const url = req.url ?? '';
    const refuse = this.refuseUpgrade ?? (this.svc.admit(url) ? undefined : 401);
    this.upgrades.push({ url, accepted: refuse === undefined });
    if (refuse !== undefined) {
      socket.write(`HTTP/1.1 ${String(refuse)} ${STATUS_CODES[refuse] ?? 'Refused'}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
      this.notify();
      return;
    }
    this.wss.handleUpgrade(req, socket, head, (ws) => { this.onConnection(ws, url); });
  }

  private onConnection(ws: WebSocket, url: string): void {
    const conn = new ServerConn(`conn-${String(this.conns.length + 1)}`, url, ws, this);
    this.conns.push(conn);
    ws.on('message', (data: RawData, isBinary: boolean) => {
      // ws 8 hands TEXT messages over as a Buffer too: only the isBinary flag tells them apart.
      const buf = Array.isArray(data) ? Buffer.concat(data) : Buffer.from(data as ArrayBuffer);
      const rx: Received = isBinary ? { binary: true, data: new Uint8Array(buf) } : { binary: false, data: buf.toString('utf8') };
      conn.received.push(rx);
      if (!(this.intercept?.(conn, rx) ?? false)) this.dispatch(conn, rx);
      this.notify();
    });
    ws.on('close', (code) => {
      conn.closed = true;
      conn.closeCode = code;
      if (this.relay) this.track(this.relay.core.handleClose(conn.id, this.ctx()));
      this.notify();
    });
    ws.on('error', () => { /* a reset after terminate */ });
    this.notify();
  }

  private dispatch(conn: ServerConn, rx: Received): void {
    if (this.relay) {
      // A host receiving a binary message passes a non-string to `handle` (typed as string: the host's own check).
      this.track(this.relay.core.handle(conn.id, rx.data as string, this.ctx()));
    } else if (typeof rx.data === 'string') {
      const b = decodeText(rx.data);
      if (b !== undefined) this.svc.onFrame(conn, b);
    }
  }

  private track(p: Promise<void>): void {
    this.pending.add(p);
    void p.finally(() => { this.pending.delete(p); this.notify(); });
  }
}

export async function startWsServer(opts: ServerOptions): Promise<WsServer> {
  const server = createServer();
  const srv = new WsServer(server, opts);
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(ANY_PORT, LOOPBACK_HOST, resolve);
  });
  return srv;
}
