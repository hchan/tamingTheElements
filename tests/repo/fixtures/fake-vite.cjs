'use strict';
/* eslint-disable @typescript-eslint/no-require-imports -- a CommonJS stand-in script, not project code */
// Stand-in for vite's CLI, used by tests/repo/e2e-server.test.ts through TTE_E2E_SERVER_VITE_BIN.
//   build   writes <outDir>/index.html, exits with FAKE_BUILD_EXIT (default 0)
//   preview answers 200 on localhost:<port>; EADDRINUSE on stderr + exit 1 when the port is taken;
//           FAKE_MODE=hang-first: the first instance (counted in FAKE_STATE_DIR) accepts connections and never answers
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const [cmd, ...args] = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const outDir = flag('--outDir');

if (cmd === 'build') {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), '<html>fake</html>');
  process.exit(Number(process.env.FAKE_BUILD_EXIT ?? 0));
}

if (cmd === 'preview') {
  // Like vite, exit 143 on SIGTERM.
  process.on('SIGTERM', () => process.exit(143));
  let hang = false;
  if (process.env.FAKE_MODE === 'hang-first' && process.env.FAKE_STATE_DIR) {
    const counter = path.join(process.env.FAKE_STATE_DIR, 'count');
    const n = fs.existsSync(counter) ? Number(fs.readFileSync(counter, 'utf8')) : 0;
    fs.writeFileSync(counter, String(n + 1));
    hang = n === 0;
  }
  const server = http.createServer((req, res) => {
    if (hang) return; // accept, never answer
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<html>fake</html>');
  });
  server.on('error', (e) => {
    process.stderr.write(`Error: listen ${e.code}: address already in use localhost:${flag('--port')}\n`);
    process.exit(1);
  });
  server.listen(Number(flag('--port')), 'localhost');
} else if (cmd !== 'build') {
  process.stderr.write(`fake-vite: unknown command ${String(cmd)}\n`);
  process.exit(2);
}
