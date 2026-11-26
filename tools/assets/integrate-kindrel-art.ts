// Installs the art-director-approved Kindrel cast sprites (emberBite 80x52, cinderSpray 80x80) over public/assets/img/fx/.
// Usage: pnpm exec tsx tools/assets/integrate-kindrel-art.ts [srcDir] [--check]
//   srcDir defaults to tools/assets/fx-gen/provenance/kindrel-fx (committed copy of the keyed outputs + approval.json).
// Refuses to copy a file unless srcDir/approval.json approves exactly that file name (reviewer art-director, beats_shipped true),
// its sha256 matches the pin below (approval.json carries no sha) and its size equals the shipped size (nothing is resized).
// No manifest change: the sizes are the manifest coords. Pinned by tests/repo/kindrel-fx-art.test.ts.
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const KINDREL_FX: Readonly<Record<string, { sha256: string; w: number; h: number }>> = {
  emberBite: { sha256: 'dfd14bc2607a9f17b871e507b92d6b25491625163ccc51d6bba3766688402987', w: 80, h: 52 },
  cinderSpray: { sha256: 'fda195179f9cfe050c54dbb009736bcc77060977a3671230b5cd1d7fc1034e8c', w: 80, h: 80 },
};

const ROOT = resolve(import.meta.dirname, '../..');
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
type Approval = Record<string, { approved?: string | null; reviewer?: string; beats_shipped?: boolean }>;

export function verify(srcDir: string): string[] {
  const approval = JSON.parse(readFileSync(resolve(srcDir, 'approval.json'), 'utf8')) as Approval;
  const names: string[] = [];
  for (const [name, pin] of Object.entries(KINDREL_FX)) {
    const a = approval[name];
    if (a?.approved !== `${name}.png` || a.reviewer !== 'art-director' || a.beats_shipped !== true) throw new Error(`${name}: no art-director approval for ${name}.png`);
    const b = readFileSync(resolve(srcDir, `${name}.png`));
    if (sha(b) !== pin.sha256) throw new Error(`${name}: sha256 ${sha(b)} does not match the approved pin`);
    if (b.readUInt32BE(16) !== pin.w || b.readUInt32BE(20) !== pin.h) throw new Error(`${name}: size is not ${String(pin.w)}x${String(pin.h)}`);
    names.push(name);
  }
  return names;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const args = process.argv.slice(2);
  const check = args.includes('--check');
  const srcDir = resolve(args.find((a) => !a.startsWith('--')) ?? resolve(ROOT, 'tools/assets/fx-gen/provenance/kindrel-fx'));
  for (const name of verify(srcDir)) {
    const dst = resolve(ROOT, `public/assets/img/fx/${name}.png`);
    if (check) {
      if (sha(readFileSync(dst)) !== KINDREL_FX[name]?.sha256) throw new Error(`${name}: installed file differs from the approved pin`);
    } else copyFileSync(resolve(srcDir, `${name}.png`), dst);
    console.log(`${check ? 'ok' : 'installed'} ${name}`);
  }
}
