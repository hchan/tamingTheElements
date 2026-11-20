import { parseOnlineUrl } from '../../../game/net/ws/config';
import { OnlineClient, type FetchLike, type OnlineDeps, type OnlineEvent, type WsLike } from '../../../game/net/ws/online-client';
import { BASE, Harness, ctor } from '../fake-online-service';
import { LOCAL_HTTP_SCHEME, LOCAL_WS_SCHEME, LOOPBACK_HOST, UNTIL_CAP_MS } from './constants';
import type { ServerConn, WsServer } from './server';

/** One message the client socket saw, recorded before the client's own listener runs. */
export interface Tap {
  readonly url: string;
  readonly binary: boolean;
  readonly size: number;
}

/**
 * OnlineClient dependencies over real sockets: the global fetch and WebSocket, with the service address mapped to the local server
 * (any other host throws, so no real network is reachable), and a virtual clock for every client timer. Waits are `until` (re-checked on
 * every tap, client event and server activity) and `delivered` (tap count equals the server's synchronous send count); nothing sleeps.
 */
export class IntHarness {
  private readonly timing = new Harness();
  readonly clock = this.timing.clock;
  readonly rawIn: Tap[] = [];
  readonly clients: OnlineClient[] = [];
  private readonly waiters = new Set<() => void>();
  private readonly unwatch: () => void;
  private readonly home = parseOnlineUrl(BASE);

  constructor(readonly srv: WsServer, private readonly simVersion?: number) {
    this.unwatch = srv.watch(() => { this.poke(); });
  }

  private poke(): void { for (const w of [...this.waiters]) w(); }

  private map(url: string, scheme: string): string {
    const u = new URL(url);
    if (!this.home.configured || u.host !== new URL(this.home.httpUrl).host) throw new Error('harness: only the service host is reachable');
    return `${scheme}://${LOOPBACK_HOST}:${String(this.srv.port)}${u.pathname}${u.search}`;
  }

  deps(extra: Partial<OnlineDeps> = {}): OnlineDeps {
    const fetchLike: FetchLike = (url, init) => fetch(this.map(url, LOCAL_HTTP_SCHEME), init);
    const make = (url: string): WsLike => {
      const real = new WebSocket(this.map(url, LOCAL_WS_SCHEME));
      real.addEventListener('message', (ev) => {
        const d: unknown = ev.data;
        const binary = typeof d !== 'string';
        const size = typeof d === 'string' ? d.length : d instanceof Blob ? d.size : (d as ArrayBuffer).byteLength;
        this.rawIn.push({ url: new URL(url).pathname + new URL(url).search, binary, size });
        this.poke();
      });
      return real;
    };
    return { ...this.timing.deps(true, { fetch: fetchLike, WebSocket: ctor(make), ...(this.simVersion === undefined ? {} : { simVersion: this.simVersion }) }), ...extra };
  }

  client(extra: Partial<OnlineDeps> = {}): { c: OnlineClient; events: OnlineEvent[] } {
    const c = new OnlineClient(this.deps(extra));
    const events: OnlineEvent[] = [];
    c.onEvent = (e) => { events.push(e); this.poke(); };
    this.clients.push(c);
    return { c, events };
  }

  /** Advances the client's virtual clock (ping, HELLO timeout, backoff, grace). */
  step(ms: number): Promise<void> { return this.timing.step(ms); }
  flush(): Promise<void> { return this.timing.flush(); }

  /** Resolves when `pred` holds; rejects with `label` after UNTIL_CAP_MS (a hang guard, not a wait). */
  until(pred: () => boolean, label: string): Promise<void> {
    if (pred()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const done = (): void => { clearTimeout(cap); this.waiters.delete(check); };
      const check = (): void => { if (pred()) { done(); resolve(); } };
      const cap = setTimeout(() => { done(); reject(new Error(`until: ${label}`)); }, UNTIL_CAP_MS);
      this.waiters.add(check);
    });
  }

  /** Messages the client socket of `conn` has seen. */
  tapped(conn: ServerConn): number { return this.rawIn.filter((t) => t.url === conn.url).length; }

  /** Waits until everything the server wrote to `conn` reached the client (TCP keeps order), then lets microtasks run. */
  async delivered(conn: ServerConn): Promise<void> {
    await this.until(() => this.tapped(conn) === conn.sent, `delivered ${conn.id}`);
    await this.flush();
  }

  /** Waits for the server to have `n` connections. */
  conn(n: number): Promise<ServerConn> {
    return this.until(() => this.srv.conns.length >= n, `connection ${String(n)}`).then(() => this.srv.conns[n - 1] as ServerConn);
  }

  /** Closes the clients and waits until the server saw every socket close. */
  async close(): Promise<void> {
    for (const c of this.clients) c.close();
    await this.until(() => this.srv.conns.every((c) => c.closed), 'sockets closed');
    this.unwatch();
  }
}
