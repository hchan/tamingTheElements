import { afterEach, describe, expect, it } from 'vitest';
import { ErrorCode } from '../../../core/relay';
import { RESTING_CODE } from '../../../game/net/ws/online-client';
import { TEST_RESTING_SEC } from './constants';
import { IntHarness } from './harness';
import { startWsServer, type HttpOverride, type WsServer } from './server';

/** Review item 1: an HTTP 503 means "relay resting" only when the body carries ErrorCode.resting. Any other 503 is a transient server failure. */

let srv: WsServer | undefined;
let h: IntHarness | undefined;

afterEach(async () => {
  await h?.close();
  await srv?.close();
  h = undefined;
  srv = undefined;
});

/** [choice] Retry-After the HTML case sends, to show the header alone is not the kill switch. */
const RETRY_AFTER_SEC = 30;
const HTML_PAGE = '<html><body>Service Unavailable</body></html>';
const HTML_503: HttpOverride = { status: 503, body: HTML_PAGE, headers: { 'Content-Type': 'text/html', 'Retry-After': String(RETRY_AFTER_SEC) }, once: true };

const PLAIN_503: readonly { name: string; override: HttpOverride }[] = [
  { name: 'JSON gateway notice', override: { status: 503, body: { message: 'Service Unavailable' }, once: true } },
  { name: 'HTML page with Retry-After', override: HTML_503 },
  { name: 'empty body', override: { status: 503, body: '', once: true } },
  { name: 'plain text that is not JSON', override: { status: 503, body: `code ${String(ErrorCode.resting)}`, headers: { 'Content-Type': 'text/plain' }, once: true } },
];

async function boot(): Promise<{ srv: WsServer; h: IntHarness }> {
  srv = await startWsServer({ backend: 'fake' });
  h = new IntHarness(srv);
  return { srv, h };
}

describe('HTTP 503 is resting only with the resting error code', () => {
  for (const path of ['/session', '/ticket'] as const) {
    for (const { name, override } of PLAIN_503) {
      it(`${path}: ${name} is a server failure, not resting, and the next connect asks HTTP again`, async () => {
        const { srv: s, h: x } = await boot();
        const { c, events } = x.client();
        s.http.override(path, override);
        const r = await c.connect();
        expect(r).toMatchObject({ ok: false, failure: { kind: 'server', status: 503 } });
        expect(events.some((e) => e.t === 'resting')).toBe(false);
        const calls = s.http.log.length;
        expect((await c.connect()).ok).toBe(true);
        expect(s.http.log.length).toBeGreaterThan(calls);
      });
    }
  }

  it('Retry-After on a plain 503 is carried on the failure for the retry path', async () => {
    const { srv: s, h: x } = await boot();
    s.http.override('/session', HTML_503);
    const r = await x.client().c.connect();
    expect(r).toMatchObject({ ok: false, failure: { kind: 'server', retryAfterSec: RETRY_AFTER_SEC, status: 503 } });
  });

  it('the client constant equals the relay ErrorCode.resting', () => {
    expect(RESTING_CODE).toBe(ErrorCode.resting);
  });

  it('a 503 with the resting code stays resting, with its retryAfterSec', async () => {
    const { srv: s, h: x } = await boot();
    s.http.override('/session', { status: 503, body: { code: ErrorCode.resting, retryAfterSec: TEST_RESTING_SEC }, once: true });
    const r = await x.client().c.connect();
    expect(r).toEqual({ ok: false, failure: { kind: 'resting', retryAfterSec: TEST_RESTING_SEC } });
  });
});
