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

async function run(args: readonly string[], delivery: Delivery = 'text', closeCodeOverride?: number): Promise<{ code: number; out: string; err: string }> {
  srv = await startWsServer({ backend: 'relay', delivery, ...(closeCodeOverride === undefined ? {} : { closeCodeOverride }) });
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

  it('a gateway that closes with 1000 fails the close-code cases, and --advisory-close checks the ERROR frame instead', async () => {
    const GATEWAY_CLOSE = 1000; // [contract] API Gateway closes with 1000
    const plain = JSON.parse((await run(['--only', 'malformed', ...FAST], 'text', GATEWAY_CLOSE)).out) as { report: { failed: number } };
    expect(plain.report.failed).toBeGreaterThan(0);
    await srv?.close();
    const adv = await run(['--only', 'malformed', '--advisory-close', ...FAST], 'text', GATEWAY_CLOSE);
    expect((JSON.parse(adv.out) as { report: { failed: number } }).report.failed).toBe(0);
    expect(adv.code).toBe(CONF.exit.ok);
  });

  it('--no-binary skips malformed.binary instead of sending a binary message', async () => {
    const r = await run(['--only', 'malformed.binary', '--no-binary', ...FAST]);
    const j = JSON.parse(r.out) as { report: { skipped: number; failed: number } };
    expect([j.report.skipped, j.report.failed]).toEqual([1, 0]);
  });

  it('the resume reconnect reuses the first socket session token and mints no new session', async () => {
    srv = await startWsServer({ backend: 'relay', delivery: 'text' });
    const base = localDeps(srv);
    const sessionPosts: string[] = [];
    const ticketBearers: string[] = [];
    const spy: typeof fetch = (input, init) => {
      const path = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).pathname;
      if (path === '/session') sessionPosts.push(path);
      if (path === '/ticket') ticketBearers.push(new Headers(init?.headers).get('Authorization') ?? '');
      return (base.fetch ?? fetch)(input, init);
    };
    const code = await runConformanceCli(['--only', 'resume.within-grace', ...FAST], { [CONF.urlEnv]: BASE }, { out: () => undefined, err: () => undefined }, { ...base, fetch: spy });
    expect(code).toBe(CONF.exit.ok);
    // matched() opens two players (two sessions); the reconnect is a third socket on player A's token.
    expect(sessionPosts).toHaveLength(2);
    expect(ticketBearers).toHaveLength(3);
    expect(ticketBearers[2]).toBe(ticketBearers[0]);
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
