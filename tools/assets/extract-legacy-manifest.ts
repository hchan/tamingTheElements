// Generates src/game/assets/manifest.generated.json from the frozen legacy asset manifests.
// Needs the legacy tree: run `pnpm oracle:restore` first. Run: pnpm exec tsx tools/assets/extract-legacy-manifest.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { ORACLE_PRIVATE } from '../../src/testing/legacy/oracle';

type Frames = [number, number][];
export interface SpriteEntry {
  url: string;
  urlLarge?: string;
  coords: [number, number, number, number];
  leftFrames?: Frames;
  rightFrames?: Frames;
  upFrames?: Frames;
  downFrames?: Frames;
}
export interface SoundEntry {
  id: string;
  url: string;
}
export interface LegacyManifest {
  sprites: Record<string, SpriteEntry>;
  mapSprites: Record<string, SpriteEntry>;
  backgrounds: Record<string, SpriteEntry>;
  sounds: SoundEntry[];
}

const root = resolve(import.meta.dirname, '../..');
const srcDir = resolve(ORACLE_PRIVATE, 'src');

function load(file: string, name: string): unknown {
  const Global: Record<string, unknown> = {};
  const ctx = vm.createContext({ Global });
  vm.runInContext(readFileSync(resolve(srcDir, file), 'utf8'), ctx, { filename: file });
  return Global[name];
}

const FRAME_KEYS = ['leftFrames', 'rightFrames', 'upFrames', 'downFrames'] as const;

function sprites(file: string, name: string): Record<string, SpriteEntry> {
  const raw = load(file, name) as Record<string, Record<string, unknown>>;
  const out: Record<string, SpriteEntry> = {};
  for (const key of Object.keys(raw).sort()) {
    const r = raw[key] as Record<string, unknown>;
    if (r.name !== key) throw new Error(`${file}: name mismatch for ${key}`);
    // Redrawn effect sprites live in the repo (tools/assets/fx-gen writes public/assets/img/fx/<key>.png); they replace the legacy url.
    const fx = `img/fx/${key}.png`;
    const fxPath = resolve(root, 'public/assets', fx);
    const redrawn = file === 'imgAssets.js' && existsSync(fxPath);
    const coords = r.coords as SpriteEntry['coords'];
    if (redrawn && key === 'iceShock') {
      // iceShock alone changed size (240x72); the others keep the legacy frame size.
      const png = readFileSync(fxPath);
      coords[2] = png.readUInt32BE(16);
      coords[3] = png.readUInt32BE(20);
    }
    const e: SpriteEntry = { url: redrawn ? fx : (r.url as string), coords };
    if (r.urlLarge !== undefined) e.urlLarge = r.urlLarge as string;
    for (const f of FRAME_KEYS) if (r[f] !== undefined) e[f] = r[f] as Frames;
    out[key] = e;
  }
  return out;
}

export function buildManifest(): LegacyManifest {
  const urls = load('sndAssets.js', 'sndAssets') as string[];
  const sounds = urls
    .map((url) => ({ id: url.replace(/^snd\//, '').replace(/\.ogg$/, ''), url }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    sprites: sprites('imgAssets.js', 'imgAssets'),
    mapSprites: sprites('imgMapAssets.js', 'imgMapAssets'),
    backgrounds: sprites('imgBackgroundAssets.js', 'imgBackgroundAssets'),
    sounds,
  };
}

export const MANIFEST_PATH = resolve(root, 'src/game/assets/manifest.generated.json');

if (import.meta.main) {
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(buildManifest(), null, 2)}\n`);
}
