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

const MAP_REDRAWN = new Set(['tornado', 'fireCone', 'translucentFlame', 'echoFade', 'circusOfSlime', 'dummyTarget', 'eternalVoid', 'paxAdrenaline', 'rokcoreRockArmour']);
/** Repo-only sprites with no legacy file (tools/assets/fx-gen/batch-g-snag-rope.py): per-element Snag ropes, 80x61, picked by caster element in projectile-view.ts. */
const EXTRA_SPRITES: Readonly<Record<string, SpriteEntry>> = {
  entanglingVinesWater: { url: 'img/fx/entanglingVinesWater.png', coords: [0, 0, 80, 61] },
  entanglingVinesAir: { url: 'img/fx/entanglingVinesAir.png', coords: [0, 0, 80, 61] },
  // Looping projectile strips (8 frames, 2x the static sprite) and 12-frame 128px impact strips: fx-gen/batch-i-loops-impacts.py + paint.py.
  // coords are the first frame; the views read the strip width to count frames.
  chaosBoltLoop: { url: 'img/fx/loop/chaosBoltLoop.png', coords: [0, 0, 160, 82] },
  chaosOrbLoop: { url: 'img/fx/loop/chaosOrbLoop.png', coords: [0, 0, 160, 160] },
  crimsonFireLoop: { url: 'img/fx/loop/crimsonFireLoop.png', coords: [0, 0, 160, 128] },
  fireBlastLoop: { url: 'img/fx/loop/fireBlastLoop.png', coords: [0, 0, 148, 52] },
  fireballLoop: { url: 'img/fx/loop/fireballLoop.png', coords: [0, 0, 160, 100] },
  hurlRockLoop: { url: 'img/fx/loop/hurlRockLoop.png', coords: [0, 0, 160, 128] },
  iciclesLoop: { url: 'img/fx/loop/iciclesLoop.png', coords: [0, 0, 160, 84] },
  rockPelletLoop: { url: 'img/fx/loop/rockPelletLoop.png', coords: [0, 0, 160, 38] },
  shardsOfIceLoop: { url: 'img/fx/loop/shardsOfIceLoop.png', coords: [0, 0, 160, 22] },
  slimeBlastLoop: { url: 'img/fx/loop/slimeBlastLoop.png', coords: [0, 0, 160, 90] },
  sonarBlastLoop: { url: 'img/fx/loop/sonarBlastLoop.png', coords: [0, 0, 160, 76] },
  windConeLoop: { url: 'img/fx/loop/windConeLoop.png', coords: [0, 0, 108, 56] },
  impactAir: { url: 'img/fx/impact/impactAir.png', coords: [0, 0, 128, 128] },
  impactEarth: { url: 'img/fx/impact/impactEarth.png', coords: [0, 0, 128, 128] },
  impactFire: { url: 'img/fx/impact/impactFire.png', coords: [0, 0, 128, 128] },
  impactIce: { url: 'img/fx/impact/impactIce.png', coords: [0, 0, 128, 128] },
  impactVoid: { url: 'img/fx/impact/impactVoid.png', coords: [0, 0, 128, 128] },
  impactWater: { url: 'img/fx/impact/impactWater.png', coords: [0, 0, 128, 128] },
};
/** Classic arena floors redrawn by stage-gen/batch-h-floors.py (1280x720 in img/floor); they replace the legacy img/background photos. */
const FLOOR_REDRAWN = new Set(['fire', 'water', 'earth', 'air']);
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
    // Map strips redrawn by fx-gen/batch-e-map.py (320x80, four 80x80 frames) keep the legacy Large url.
    const redrawn = (file === 'imgAssets.js' || (file === 'imgMapAssets.js' && MAP_REDRAWN.has(key))) && existsSync(fxPath);
    const coords = r.coords as SpriteEntry['coords'];
    if (redrawn && key === 'iceShock') {
      // iceShock alone changed size (240x72); the others keep the legacy frame size.
      const png = readFileSync(fxPath);
      coords[2] = png.readUInt32BE(16);
      coords[3] = png.readUInt32BE(20);
    }
    const floor = `img/floor/${key}.png`;
    const floorRedrawn = file === 'imgBackgroundAssets.js' && FLOOR_REDRAWN.has(key) && existsSync(resolve(root, 'public/assets', floor));
    if (floorRedrawn) {
      coords[2] = 1280;
      coords[3] = 720;
    }
    const e: SpriteEntry = { url: floorRedrawn ? floor : redrawn ? fx : (r.url as string), coords };
    if (r.urlLarge !== undefined) e.urlLarge = r.urlLarge as string;
    for (const f of FRAME_KEYS) if (r[f] !== undefined) e[f] = r[f] as Frames;
    out[key] = e;
  }
  if (file === 'imgAssets.js') {
    for (const key of Object.keys(EXTRA_SPRITES).sort()) out[key] = structuredClone(EXTRA_SPRITES[key] as SpriteEntry);
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
