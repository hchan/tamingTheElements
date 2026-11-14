/**
 * Local / self-hosted Node variant of the signalling relay (docs/WEBRTC-PLAN.md WP 10): `pnpm relay [--port 8787]`.
 * Plain WebSocket, no TLS (put it behind your own proxy for wss). The room logic is `rooms.ts`; nothing is logged or stored.
 */
import { randomInt } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, type WebSocket } from 'ws';
import { MAX_SIG_CHARS, Rooms, type Outgoing } from './rooms';

export interface RelayHandle {
  port: number;
  close: () => Promise<void>;
}

export async function startRelay(opts: { port?: number; host?: string; now?: () => number } = {}): Promise<RelayHandle> {
  const rooms = new Rooms({ now: opts.now ?? Date.now, randomInt: (n) => randomInt(n) });
  const http: Server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('tte signal relay\n');
  });
  const wss = new WebSocketServer({ server: http, maxPayload: MAX_SIG_CHARS + 64 });
  const sockets = new Map<string, WebSocket>();
  let next = 0;
  const deliver = (out: readonly Outgoing[]): void => {
    for (const o of out) sockets.get(o.to)?.send(JSON.stringify(o.msg));
  };
  wss.on('connection', (ws) => {
    const id = String(next++);
    sockets.set(id, ws);
    ws.on('message', (data, isBinary) => {
      if (isBinary) {
        ws.close(1003);
        return;
      }
      deliver(rooms.message(id, Buffer.isBuffer(data) ? data.toString('utf8') : ''));
    });
    ws.on('close', () => {
      sockets.delete(id);
      deliver(rooms.close(id));
    });
    ws.on('error', () => {
      ws.terminate();
    });
  });
  const sweeper = setInterval(() => {
    const { out, closeConns } = rooms.sweep();
    deliver(out);
    for (const c of closeConns) sockets.get(c)?.close(1000, 'room expired');
  }, 15_000);
  sweeper.unref();
  await new Promise<void>((res) => {
    http.listen(opts.port ?? 0, opts.host ?? '127.0.0.1', res);
  });
  return {
    port: (http.address() as AddressInfo).port,
    close: () =>
      new Promise<void>((res) => {
        clearInterval(sweeper);
        for (const ws of wss.clients) ws.terminate();
        wss.close(() => {
          http.close(() => {
            res();
          });
        });
      }),
  };
}

if (process.argv[1] !== undefined && /signal-relay[\\/]server\.ts$/.test(process.argv[1])) {
  const i = process.argv.indexOf('--port');
  const port = i >= 0 ? Number(process.argv[i + 1]) : 8787;
  const host = process.env['RELAY_HOST'] ?? '127.0.0.1';
  void startRelay({ port, host }).then((h) => {
    console.log(`signal relay on ws://${host}:${String(h.port)}`);
  });
}
