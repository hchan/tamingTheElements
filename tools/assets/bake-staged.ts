// Bakes a staged rig folder (gen-r24.py --stage output) into a scratch sheets folder, so a roster24 hero can be looked at without touching
// imgWorkArea/rigs or the committed frames:  tsx tools/assets/bake-staged.ts <rigsDir> <sheetsDir> [--check]
import { resolve } from 'node:path';
import { runBake } from './bake-rig';

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (args.length !== 2) {
  console.error('usage: tsx tools/assets/bake-staged.ts <rigsDir> <sheetsDir> [--check]');
  process.exit(2);
}
const r = runBake({ check: process.argv.includes('--check'), rigsDir: resolve(args[0] ?? ''), sheetsDir: resolve(args[1] ?? '') });
(r.code === 0 ? console.log : console.error)(r.message);
process.exit(r.code);
