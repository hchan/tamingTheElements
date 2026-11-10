import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, normalize } from 'node:path';
import { expect, test } from '@playwright/test';

const OUT = join(process.cwd(), 'dist-itch');
const DIR = join(OUT, 'unzipped');
const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
};

let server: Server;
let origin = '';

test.beforeAll(async () => {
  const zip = readdirSync(OUT).find((f) => f.endsWith('.zip'));
  if (zip === undefined) throw new Error('no zip in dist-itch: run `pnpm build:itch` first');
  rmSync(DIR, { recursive: true, force: true });
  execFileSync('unzip', ['-q', join(OUT, zip), '-d', DIR]);
  expect(existsSync(join(DIR, 'index.html'))).toBe(true);

  // Static server at the origin root (itch serves the zip from a subpath-less host).
  server = createServer((req, res) => {
    const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0] ?? '/')).replace(/^(\.\.[/\\])+/, '');
    let file = join(DIR, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!file.startsWith(DIR) || !existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
});

test.afterAll(() => {
  server.close();
  rmSync(DIR, { recursive: true, force: true });
});

test('unzipped itch artifact loads the menu with no console errors or failed requests', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('requestfailed', (r) => errors.push(`request failed: ${r.url()}`));
  page.on('response', (r) => {
    if (r.status() >= 400) errors.push(`${String(r.status())} ${r.url()}`);
  });

  await page.goto(`${origin}/`);
  await expect(page.locator('#menu .mainMenuList')).toBeVisible();
  await expect(page.locator('#versionStamp')).toHaveText(/^v\d+\.\d+\.\d+\S* \(([0-9a-f]{7,}|unknown)\)$/);
  expect(errors).toEqual([]);
});
