// Regenerates tests/fixtures/legacy/ability-sounds.json:
//   git show legacy-crafty-1.0:war/WEB-INF/private/src/abilities.js > ~/claudetmp/abilities.js
//   node tools/gen/gen-ability-sounds.mjs ~/claudetmp/abilities.js tests/fixtures/legacy/ability-sounds.json
import { readFileSync, writeFileSync } from 'node:fs';
const lines = readFileSync(process.argv[2], 'utf8').split('\n');
const out = {}; let cur = null;
for (const l of lines) {
  const m = /^\s*spriteName\s*:\s*['"](\w+)['"]/.exec(l);
  if (m) { cur = m[1]; if (!(cur in out)) out[cur] = null; continue; }
  const s = /Global\.playSound\('(\w+)'\)/.exec(l);
  if (s && cur && out[cur] === null && !l.trim().startsWith('//')) out[cur] = s[1];
}
writeFileSync(process.argv[3], JSON.stringify({ _source: 'git show legacy-crafty-1.0:war/WEB-INF/private/src/abilities.js; first Global.playSound after each spriteName (null = silent)', sounds: out }, null, 2) + '\n');
