// Installs art-director-approved roster24 cast sprites over public/assets/img/fx/. One table entry per hero (HEROES below).
// Usage: pnpm exec tsx tools/assets/integrate-roster24-fx-art.ts <hero> [srcDir] [--check]
//   srcDir defaults to the hero's committed provenance dir (keyed outputs + approval.json).
// Refuses to copy a file unless the approval JSON approves exactly that source file name (reviewer art-director, beats_shipped true),
// its sha256 matches the pin (approval.json carries no sha) and its size equals the shipped size (nothing is resized).
// No manifest change: the sizes are the manifest coords. Pinned by tests/repo/kindrel-fx-art.test.ts and ouroth-fx-art.test.ts.
import { createHash } from 'node:crypto';
import { copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface FxPin {
  /** File name in the provenance dir (and the name the approval must name). */
  src: string;
  sha256: string;
  w: number;
  h: number;
  /** install path relative to public/assets/img/ (default fx/<name>.png). */
  dst?: string;
}
export interface HeroFx {
  provenance: string;
  /** installed fx name (public/assets/img/fx/<name>.png) -> pin */
  fx: Readonly<Record<string, FxPin>>;
  /** true: approval.json is keyed by fx name; false: one flat approval for the single file. */
  keyed: boolean;
}

export const HEROES: Readonly<Record<string, HeroFx>> = {
  kindrel: {
    provenance: 'tools/assets/fx-gen/provenance/kindrel-fx',
    keyed: true,
    fx: {
      emberBite: { src: 'emberBite.png', sha256: 'dfd14bc2607a9f17b871e507b92d6b25491625163ccc51d6bba3766688402987', w: 80, h: 52 },
      cinderSpray: { src: 'cinderSpray.png', sha256: 'fda195179f9cfe050c54dbb009736bcc77060977a3671230b5cd1d7fc1034e8c', w: 80, h: 80 },
    },
  },
  ouroth: {
    provenance: 'tools/assets/fx-gen/provenance/ouroth-fx',
    keyed: false,
    fx: {
      wyrmCoil: { src: 'wyrmCoil_r2.png', sha256: '98506d2115a92622c6817b047a82b420daab88e2a3484c571ac47d9853cd5f98', w: 80, h: 80 },
    },
  },
  zephra: {
    provenance: 'tools/assets/fx-gen/provenance/zephra-fx',
    keyed: true,
    fx: {
      staticMote: { src: 'staticMote.png', sha256: '6db8da551cfa9b19b3383b8104d0a4484d57d9d7be6f5152d508a28b966284f1', w: 80, h: 80 },
      skitter: { src: 'skitter.png', sha256: '1d19674079151b2df14d8693d38f86fd824da4eea90a8b253ec8112a9ad369c4', w: 80, h: 80 },
      staticMoteLoop: { src: 'staticMoteLoop.png', sha256: '63b656107eb59a6b84dab8cc64d35b12babbd93e1db6ed122e55241f885e32e1', w: 1280, h: 160, dst: 'fx/loop/staticMoteLoop.png' },
    },
  },
};

const ROOT = resolve(import.meta.dirname, '../..');
const sha = (b: Buffer): string => createHash('sha256').update(b).digest('hex');
interface Entry { approved?: string | null; reviewer?: string; beats_shipped?: boolean }

/** Verifies every sprite of a hero against its approval and pin; returns the fx names. */
export function verify(hero: string, srcDir?: string): string[] {
  const h = HEROES[hero];
  if (!h) throw new Error(`unknown hero ${hero}`);
  const dir = resolve(ROOT, srcDir ?? h.provenance);
  const approval = JSON.parse(readFileSync(resolve(dir, 'approval.json'), 'utf8')) as Record<string, Entry> & Entry;
  const names: string[] = [];
  for (const [name, pin] of Object.entries(h.fx)) {
    const a: Entry | undefined = h.keyed ? approval[name] : approval;
    if (a?.approved !== pin.src || a.reviewer !== 'art-director' || a.beats_shipped !== true) throw new Error(`${name}: no art-director approval for ${pin.src}`);
    const b = readFileSync(resolve(dir, pin.src));
    if (sha(b) !== pin.sha256) throw new Error(`${name}: sha256 ${sha(b)} does not match the approved pin`);
    if (b.readUInt32BE(16) !== pin.w || b.readUInt32BE(20) !== pin.h) throw new Error(`${name}: size is not ${String(pin.w)}x${String(pin.h)}`);
    names.push(name);
  }
  return names;
}

if (import.meta.url === `file://${process.argv[1] ?? ''}`) {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const check = process.argv.includes('--check');
  const hero = args[0] ?? '';
  const h = HEROES[hero];
  if (!h) throw new Error(`usage: integrate-roster24-fx-art.ts <${Object.keys(HEROES).join('|')}> [srcDir] [--check]`);
  const srcDir = resolve(ROOT, args[1] ?? h.provenance);
  for (const name of verify(hero, srcDir)) {
    const pin = h.fx[name];
    if (!pin) continue;
    const dst = resolve(ROOT, `public/assets/img/${pin.dst ?? `fx/${name}.png`}`);
    if (check) {
      if (sha(readFileSync(dst)) !== pin.sha256) throw new Error(`${name}: installed file differs from the approved pin`);
    } else copyFileSync(resolve(srcDir, pin.src), dst);
    console.log(`${check ? 'ok' : 'installed'} ${name}`);
  }
}
