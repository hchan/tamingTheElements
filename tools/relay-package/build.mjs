// Builds the relay package: tsc to ./dist (ESM + .d.ts), then adds the ".js" extension to relative specifiers
// (the repo's sources are extensionless for the bundler; Node ESM needs them). Run: node tools/relay-package/build.mjs
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '../../packages/relay');
const dist = join(pkg, 'dist');
const tsc = join(here, '../../node_modules/.bin/tsc');

rmSync(dist, { recursive: true, force: true });
const r = spawnSync(tsc, ['-p', join(pkg, 'tsconfig.json')], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status ?? 1);

const spec = /(\bfrom\s+|\bimport\s*\(\s*)(['"])(\.{1,2}\/[^'"]*?)\2/g;
for (const name of readdirSync(dist)) {
  if (!/\.(js|d\.ts)$/.test(name)) continue;
  const file = join(dist, name);
  const src = readFileSync(file, 'utf8');
  writeFileSync(file, src.replace(spec, (_m, pre, q, path) => (path.endsWith('.js') ? _m : `${pre}${q}${path}.js${q}`)));
}
for (const f of ['index.js', 'testing.js', 'conformance.js']) {
  if (!existsSync(join(dist, f))) throw new Error(`relay package build is missing dist/${f}`);
}
console.log('relay package built in', dist);
