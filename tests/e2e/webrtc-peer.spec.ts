import { expect, test } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';

// The real WebRTC link (src/game/net/peer.ts) in Chromium: host and joiner in one page over loopback, compact copy-paste codes,
// then the setup handshake over the control channel and an input packet over the unreliable channel.
const entry = fileURLToPath(new URL('../../src/game/net/peer-entry.ts', import.meta.url));
const core = fileURLToPath(new URL('../../src/core', import.meta.url));

async function bundle(): Promise<string> {
  const out = await build({
    configFile: false,
    logLevel: 'silent',
    resolve: { alias: { '@core': core } },
    build: { write: false, lib: { entry, name: 'TTEPeer', formats: ['iife'], fileName: 'peer' }, minify: false },
  });
  const outputs = (Array.isArray(out) ? out : [out]).flatMap((o) => ('output' in o ? o.output : []));
  const chunk = outputs.find((o) => o.type === 'chunk');
  if (chunk?.type !== 'chunk') throw new Error('no bundle');
  return chunk.code;
}

test('two peers connect with compact copy-paste codes, run the setup handshake and exchange an input packet', async ({ page }) => {
  test.setTimeout(60_000);
  await page.goto('/');
  await page.addScriptTag({ content: await bundle() });
  const result = await page.evaluate<{ phases: string[]; got: number[] | null; bad: string; offer: string; answer: string }>(`(async () => {
    const { hostPeer, joinPeer, SetupHandshake } = window.TTEPeer;
    const host = await hostPeer([]);
    const join = await joinPeer(host.offer, []);
    await host.peer.accept(join.answer);
    await Promise.all([host.peer.open, join.peer.open]);
    host.peer.input.send(Uint8Array.of(7, 8, 9));
    let got = null;
    for (let i = 0; i < 100 && !got; i++) {
      await new Promise((r) => setTimeout(r, 20));
      const m = join.peer.input.receive();
      if (m) got = [...m];
    }
    const hello = (seed) => ({ simVersion: 1, flags: 0, cheats: false, seed, chapter: 1, difficulty: 1, p1: [{ character: 'fire-mage', xp: 0 }], p2: [{ character: 'air-bat', xp: 0 }] });
    const a = new SetupHandshake(host.peer.control, hello(5));
    const b = new SetupHandshake(join.peer.control, hello(5));
    for (let i = 0; i < 100 && !(a.phase === 'go' && b.phase === 'go'); i++) {
      a.poll(); b.poll();
      await new Promise((r) => setTimeout(r, 20));
    }
    const phases = [a.phase, b.phase];
    let bad = '';
    try { await join.peer.accept('garbage'); } catch (e) { bad = String(e.message); }
    host.peer.close(); join.peer.close();
    return { phases, got, bad, offer: host.offer, answer: join.answer };
  })()`);
  // Compact codes (src/game/net/sdp-codec.ts): versioned, and short enough for a chat message.
  expect(result.offer.startsWith('T1.')).toBe(true);
  expect(result.offer.length).toBeLessThan(300);
  expect(result.answer.startsWith('T1.')).toBe(true);
  expect(result.answer.length).toBeLessThan(300);
  expect(result.phases).toEqual(['go', 'go']);
  expect(result.got).toEqual([7, 8, 9]);
  expect(result.bad).toMatch(/not a connection code/);
});
