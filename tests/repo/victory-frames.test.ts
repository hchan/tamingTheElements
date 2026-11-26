import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const DIR = 'public/assets/img/victory';
const PROV = 'tools/assets/victory-gen/provenance';
const sha = (p: string): string => createHash('sha256').update(readFileSync(p)).digest('hex');

// hero -> approved source file in PROV, its sha256, the installed still's sha256 (tools/assets/victory-gen/victory-key.py)
const STILLS: Record<string, { src: string; srcSha: string; outSha: string; facing: string }> = {
  glimmaw: { src: 'r971-glimmaw-vic_60160_d0.35.png', srcSha: 'c7199f4d1f28c33538c6e7a8cb13523e142178dcaa0b284dc75472829476a31d', outSha: '9c3445430f2dba2fccf56c066b6985a7fc856748d3705082299f0f605ff2e331', facing: 'right' },
  brazgor: { src: 'brazgor_win.png', srcSha: 'a308a1880391d951e6417f0e9fc93f20e434be6d28e6053bad93d5f01bd047cd', outSha: 'd1073fe8920618c0b124cdbb424415acb2a5c764e4e000efb027570e27993a13', facing: 'left' },
  kindrel: { src: 'kindrel_win.png', srcSha: 'dc168f538eb3443d0e8bda371794b15e92e746915f69875a4934c07522cef236', outSha: '20050092e3be3c14347a320b7c34ebe88aff7e3ae3c2b13ccdee612fbce44041', facing: 'right' },
  vortigal: { src: 'vortigal_win.png', srcSha: 'ac71f89b859aee9ae7984fd60768bcf8563f43f16f0f7386fcb52e0f069991d0', outSha: '14638ea39dd9703a22b31b7b59e321b2b21f1e58b5946abe52b31a9971ef144d', facing: 'right' },
  zephra: { src: 'zephra_win.png', srcSha: '6c1604d95f2a63070d7d253277fae4450f9c7037629de20944b30a4fe37a4c93', outSha: '3a6c94de8523c4e45cc92b1b3134561ce1a9bcaaf7c8f74a7057fd5de9c3e13b', facing: 'left' },
  nykra: { src: 'nykra_win.png', srcSha: '3cd745f9da07648e9792ae5c0909e19e3af89cdfdc271340192790625f8d9126', outSha: 'e1576f2c957aeddde4b6bf03cd78576692a0a5583ec8624eee96a92b0e6623ad', facing: 'left' },
  hyalia: { src: 'hyalia_win.png', srcSha: 'bf17fb0d096b25b42aa0c1d8d252363ae2c55bbec7cec2d057c0b078d335d832', outSha: 'd42bf064e099e9cb25e70057d677875844499ac1e38bf90ff33350c4889d61cc', facing: 'right' },
  ouroth: { src: 'r821-ouroth-vic_59822_d0.45.png', srcSha: '28803d26e279b9c20900240f54c170fbf8ce3dd712a4a6fee2194cea13eb3e91', outSha: '42cc1f988592e4c6d33f9217c9d6d111d2c4cc28dcf477256481a1d66b93d584', facing: 'right' },
  umbrel: { src: 'r805-umbrel-victory_58210_d0.5.png', srcSha: '0e96f965b6989867f4ec9e7105e704a2e2e0216aa69e734ac1e08c2a58aa47d0', outSha: 'fdd3b5f819a90770012068c142f72dd0d0ef3727bc9f68c473fd4a714babe0d4', facing: 'left' },
  abyssor: { src: 'r842-abyssor-vic_61100_d0.4.png', srcSha: '065281af8b8142323d19d64c50f52f634adc78cf390f1e07475624965ad3856e', outSha: 'bb9d4bf9fc0c98689617269010f50cf010e017e3b3d8a42bb90443d469163731', facing: 'front' },
  durrok: { src: 'durrok_win.png', srcSha: '4d328ce59d291f532363df3d97d0f1b17eff3cb8ba8b5e0342d448ee49de135d', outSha: '485a6fa08552f6744b033d208292bf401cd0b16a993995750dcdf09d7fade826', facing: 'right' },
  quarrak: { src: 'quarrak_win.png', srcSha: '9200f3f35b5d9c9efa831b1020a6c852c2189849ecc9c873706baf1b78b24f68', outSha: 'c6f6c8e56bd554e3b09e5f8b994492858fb4017bfd02d4615c2216646f64fbe8', facing: 'right' },
  curomo: { src: 'v-curomo_61001_d0.4.png', srcSha: '6c32a41bfed4126a57675197b5bfededa560bb8cf348f5a9216a58831d10e8cb', outSha: '710b80299e552b1bd64096d86b26328a6c3761d77ac2f5e852cc370b080320c5', facing: 'right' },
  ishimi: { src: 'v-ishimi_61001_d0.4.png', srcSha: '677fccaebc3b4d017486009be0123aea76c5cc692266231441b4b7f4f7abd53a', outSha: '320c6e9714450c14fe70d261e2e80d875ce6a96064e168f66d8b05f8f21119bb', facing: 'right' },
  sindarosa: { src: 'v-sindarosa_61001_d0.4.png', srcSha: '8f1d4124d9b65e226851a968a58a08ed486716b2bd2b02ea56be8b0fa2eacb43', outSha: '5501c598f4813d61f1b3327dcb49cf3a122643555eca5d81c037ec9d5d7b3ac9', facing: 'right' },
  morblass: { src: 'v3-morblass_63031_d0.5.png', srcSha: '28596fbed145f1767e52d8a51565a189db49f20b2d862e3a7760cf9505ad44a3', outSha: '1ad3181d01728aaa0a512921ea2e24c39922cf57b1086d59bed9270cc3ee7c6c', facing: 'right' },
  wispera: { src: 'wispera_win.png', srcSha: '5031f0107bb94ce135bee4b90886102fe6558757cb0ba7cbd5e404e0d3b9e3e2', outSha: 'a534781f01f3cf313d2ed54229722478a0e5d7ffef82e5f8a662888d1e228872', facing: 'right' },
};

describe('victory frames (tools/assets/victory-gen/victory-key.py)', () => {
  it('ships exactly the art-director-approved stills, as transparent RGBA PNGs, and the gate lists the same heroes', () => {
    const heroes = Object.keys(STILLS);
    expect(readdirSync(DIR).filter((f) => f.endsWith('.png')).sort()).toEqual(heroes.map((h) => `${h}_victory.png`).sort());
    // read as text: the repo tests' tsconfig has no DOM lib, and victory-still.ts touches the DOM
    const gate = /new Set\(\[([^\]]*)\]\)/.exec(readFileSync('src/game/fx/victory-still.ts', 'utf8'))?.[1] ?? '';
    expect(gate.split(',').map((h) => h.trim().replace(/'/g, '')).sort()).toEqual([...heroes].sort());
    for (const [hero, s] of Object.entries(STILLS)) {
      const bytes = readFileSync(`${DIR}/${hero}_victory.png`);
      expect(bytes.subarray(1, 4).toString()).toBe('PNG');
      expect(bytes[25], `${hero}: colour type 6 = RGBA`).toBe(6);
      expect(sha(`${DIR}/${hero}_victory.png`), hero).toBe(s.outSha);
    }
  });
  it('pins every approved source and carries its approval', () => {
    const all = JSON.parse(readFileSync(`${PROV}/approval.json`, 'utf8')) as Record<string, { approved: string; reviewer: string; beats_shipped: boolean; facing: string; source: string }>;
    for (const [hero, s] of Object.entries(STILLS)) {
      const a = all[`${hero}_victory`];
      expect(a?.reviewer, hero).toBe('art-director');
      expect(a?.beats_shipped, hero).toBe(true);
      expect(a?.facing, hero).toBe(s.facing);
      expect(a?.source, hero).toBe(s.src);
      expect(sha(`${PROV}/${s.src}`), hero).toBe(s.srcSha);
    }
  });
});
