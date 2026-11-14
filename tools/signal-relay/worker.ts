/**
 * Cloudflare Worker variant of the signalling relay (docs/WEBRTC-PLAN.md WP 10; deploy steps in README.md). One Durable Object
 * keeps every room in memory (rooms are short lived by design) and shares `rooms.ts` with the Node server. No secrets.
 * Minimal local types are declared so the repo needs no `@cloudflare/workers-types`.
 */
import { Rooms, type Outgoing } from './rooms';

interface WorkerSocket {
  accept(): void;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'message', cb: (e: { data: unknown }) => void): void;
  addEventListener(type: 'close' | 'error', cb: () => void): void;
}
declare const WebSocketPair: new () => { 0: WorkerSocket; 1: WorkerSocket };
interface DurableStub {
  fetch(req: Request): Promise<Response>;
}
interface Env {
  RELAY: { idFromName(n: string): unknown; get(id: unknown): DurableStub };
}

export class Relay {
  private readonly rooms = new Rooms({
    now: Date.now,
    randomInt: (n) => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % n,
  });
  private readonly sockets = new Map<string, WorkerSocket>();
  private next = 0;

  fetch(req: Request): Response {
    if (req.headers.get('upgrade') !== 'websocket') return new Response('tte signal relay\n');
    const pair = new WebSocketPair();
    const server = pair[1];
    server.accept();
    const id = String(this.next++);
    this.sockets.set(id, server);
    server.addEventListener('message', (e) => {
      if (typeof e.data === 'string') this.deliver(this.rooms.message(id, e.data));
      else server.close(1003);
    });
    const gone = (): void => {
      this.sockets.delete(id);
      this.deliver(this.rooms.close(id));
    };
    server.addEventListener('close', gone);
    server.addEventListener('error', gone);
    // Expired rooms are also checked on every message; this frees idle ones whenever someone connects.
    const { out, closeConns } = this.rooms.sweep();
    this.deliver(out);
    for (const c of closeConns) this.sockets.get(c)?.close(1000, 'room expired');
    return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit);
  }

  private deliver(out: readonly Outgoing[]): void {
    for (const o of out) this.sockets.get(o.to)?.send(JSON.stringify(o.msg));
  }
}

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return env.RELAY.get(env.RELAY.idFromName('rooms')).fetch(req);
  },
};
