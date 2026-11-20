import { afterEach, describe, expect, it } from 'vitest';
import { BASE } from '../fake-online-service';
import { CONF, runConformanceCli, type WsConformanceDeps } from './conformance-ws-adapter';
import { LOCAL_HTTP_SCHEME, LOCAL_WS_SCHEME, LOOPBACK_HOST } from './constants';
import { startWsServer, type Delivery, type WsServer } from './server';

/** The relay:conformance runner against the in-process RelayCore server: no real backend, loopback only. Real timers, short waits. */

/** [choice] Short waits for the loopback server (real milliseconds). */
const FAST = ['--timeout-ms', '3000', '--settle-ms', '30', '--json'] as const;

let srv: WsServer | undefined;
afterEach(async () => {
  await srv?.close();
  srv = undefined;
});

/** Maps the service address to the local server; any other host throws, so no real network is reachable. */
function localDeps(s: WsServer): WsConformanceDeps {
  const map = (url: string, scheme: string): string => {
    const u = new URL(url);
    if (u.host !== new URL(BASE).host) throw new Error('only the service host is reachable');
    return `${scheme}://${LOOPBACK_HOST}:${String(s.port)}${u.pathname}${u.search}`;
  };
  class Local extends WebSocket {
    constructor(url: string) { super(map(url, LOCAL_WS_SCHEME)); }
  }
  return { fetch: (input, init) => fetch(map(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, LOCAL_HTTP_SCHEME), init), WebSocket: Local };
}

async function run(args: readonly string[], delivery: Delivery = 'text'): Promise<{ code: number; out: string; err: string }> {
  srv = await startWsServer({ backend: 'relay', delivery });
  let out = '';
  let err = '';
  const code = await runConformanceCli(args, { [CONF.urlEnv]: BASE }, { out: (l) => { out += `${l}\n`; }, err: (l) => { err += `${l}\n`; } }, localDeps(srv));
  return { code, out, err };
}

describe('relay:conformance runner', () => {
  it('passes the whole suite over real sockets (remote-only cases skip) and counts text delivery', async () => {
    const r = await run(FAST);
    const j = JSON.parse(r.out) as { report: { ok: boolean; failed: number; skipped: number; passed: number }; delivery: { text: number; binary: number } };
    expect(r.err).toBe('');
    expect(j.report.failed).toBe(0);
    expect(j.report.passed).toBeGreaterThan(0);
    expect(j.report.skipped).toBeGreaterThan(0);
    expect(j.delivery.text).toBeGreaterThan(0);
    expect(j.delivery.binary).toBe(0);
    expect(r.code).toBe(CONF.exit.ok);
  });

  it('counts binary delivery and still passes when ASCII binary is accepted', async () => {
    const r = await run(['--only', 'hello', ...FAST], 'ascii-binary');
    const j = JSON.parse(r.out) as { delivery: { binary: number } };
    expect(j.delivery.binary).toBeGreaterThan(0);
    expect(r.code).toBe(CONF.exit.ok);
  });

  it('--strict-text turns binary delivery into case failures (exit 1)', async () => {
    const r = await run(['--only', 'hello', '--strict-text', ...FAST], 'ascii-binary');
    expect(r.code).toBe(CONF.exit.caseFailed);
  });

  it('exits 3 when no connection can be made', async () => {
    let out = '';
    const code = await runConformanceCli(
      ['--json', '--only', 'hello.welcome', '--timeout-ms', '200'],
      { [CONF.urlEnv]: BASE },
      { out: (l) => { out += l; }, err: () => undefined },
      { fetch: () => Promise.reject(new Error('down')) },
    );
    expect(code).toBe(CONF.exit.neverConnected);
    expect(out).toContain('"failed": 1');
  });

  it('exits 2 with a clear message for bad config', async () => {
    for (const [env, args] of [
      [{}, []],
      [{ [CONF.urlEnv]: `${BASE}/` }, []],
      [{ [CONF.urlEnv]: 'http://relay.example.invalid' }, []],
      [{ [CONF.urlEnv]: BASE }, ['--only', 'nope']],
      [{ [CONF.urlEnv]: BASE }, ['--timeout-ms', 'x']],
    ] as const) {
      let err = '';
      const code = await runConformanceCli(args, env, { out: () => undefined, err: (l) => { err += l; } });
      expect(code).toBe(CONF.exit.badConfig);
      expect(err).toContain('relay:conformance');
    }
  });
});
