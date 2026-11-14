import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAKE_DIRS, bakeRigs, LOCK_NAME, runBake, sinQ16, staleFiles, type RigJson } from '../../tools/assets/bake-rig';
import { packSheets, readSources, type SourceFiles } from '../../tools/assets/pack-sheets';
import { decodePng, encodePng } from '../../tools/assets/png-lite';
import { FRAME } from '../../src/game/assets/sheet-spec';

const root = resolve(import.meta.dirname, '../..');
const FIXTURE = resolve(root, 'tests/fixtures/rigs');
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);
const fixture = (): Map<string, Uint8Array> => new Map(readSources(FIXTURE));
const fixtureRig = (): RigJson => JSON.parse(new TextDecoder().decode(fixture().get('fiara/rig.json'))) as RigJson;
/** The fixture with fiara/rig.json replaced by `edit(rig)`. */
function withRig(edit: (r: Record<string, unknown> & { parts: Record<string, unknown>[]; actions: Record<string, Record<string, unknown>> }) => void): Map<string, Uint8Array> {
  const r = structuredClone(fixtureRig()) as unknown as Parameters<typeof edit>[0];
  edit(r);
  return fixture().set('fiara/rig.json', enc(JSON.stringify(r)));
}
const png = (w: number, h: number, px: (i: number) => [number, number, number, number]): Uint8Array => {
  const data = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) data.set(px(i), i * 4);
  return encodePng({ width: w, height: h, data });
};
const sha = (s: string): string => createHash('sha256').update(s).digest('hex');

describe('rig bake (tools/assets/bake-rig.ts)', () => {
  it('uses a literal sine table that matches the host to the Q14 rounding', () => {
    for (let d = 0; d <= 90; d++) expect(sinQ16(d) / 4).toBe(Math.round(16384 * Math.sin((d * Math.PI) / 180)));
    for (let d = -360; d <= 720; d += 7) expect(Math.abs(sinQ16(d) - 65536 * Math.sin((d * Math.PI) / 180))).toBeLessThanOrEqual(4);
    expect(BAKE_DIRS).toEqual(['E', 'SE', 'S', 'N', 'NE']);
  });

  it('bakes the fixture deterministically (twice, any input order) into frames the packer accepts', () => {
    const files = fixture();
    const a = bakeRigs(files);
    const b = bakeRigs(new Map([...files].reverse()));
    expect(a.errors).toEqual([]);
    expect(a.rigs).toEqual(['fiara']);
    expect([...a.outputs.keys()]).toEqual([
      ...['E', 'SE'].flatMap((d) => [0, 1].map((f) => `fiara/hurt/${d}/0${String(f)}.png`)),
      ...['E', 'SE'].flatMap((d) => [0, 1, 2, 3].map((f) => `fiara/idle/${d}/0${String(f)}.png`)),
      'fiara/license.txt',
    ]);
    expect(b.lock).toBe(a.lock);
    for (const [p, bytes] of a.outputs) expect(Buffer.from(b.outputs.get(p) ?? []).equals(bytes)).toBe(true);
    // Pins the bake algorithm: if this changes on purpose, bump BAKE_VERSION and update the hash.
    expect(sha(a.lock ?? '')).toBe('f0e5ba82c1fb118e36fcb201aac8364f7784d8abca417ae7d6fae064e3c79e53');
    expect(packSheets(a.outputs).errors).toEqual([]);
    const idle0 = decodePng(a.outputs.get('fiara/idle/E/00.png') ?? new Uint8Array());
    expect([idle0.width, idle0.height]).toEqual([FRAME, FRAME]);
  });

  it('rotates a part about its pivot (clockwise, y down, nearest neighbour)', () => {
    const bar = png(5, 1, (i) => [10 + 40 * i, 7, 9, 255]);
    const at = (img: ReturnType<typeof decodePng>, x: number, y: number): number => img.data[(y * FRAME + x) * 4] ?? -1;
    const bake = (pivot: [number, number]): ReturnType<typeof decodePng>[] => {
      const rig = { dirs: ['E'], parts: [{ id: 'bar', png: 'bar.png', pivot, at: [40, 40] }], actions: { idle: { frames: 4, curves: { bar: { rot: [0, 90, 180, 270] } } } } };
      const res = bakeRigs(new Map([['fiara/rig.json', enc(JSON.stringify(rig))], ['fiara/license.txt', enc('CC0\n')], ['fiara/parts/bar.png', bar]]));
      expect(res.errors).toEqual([]);
      return [0, 1, 2, 3].map((f) => decodePng(res.outputs.get(`fiara/idle/E/0${String(f)}.png`) ?? new Uint8Array()));
    };
    const [r0, r90, r180, r270] = bake([0, 0]) as [ReturnType<typeof decodePng>, ReturnType<typeof decodePng>, ReturnType<typeof decodePng>, ReturnType<typeof decodePng>];
    for (const img of [r0, r90, r180, r270]) expect(img.data.filter((_, k) => k % 4 === 3 && img.data[k] !== 0)).toHaveLength(5);
    for (let i = 0; i < 5; i++) {
      const c = 10 + 40 * i;
      expect(at(r0, 40 + i, 40)).toBe(c);
      expect(at(r90, 39, 40 + i)).toBe(c);
      expect(at(r180, 39 - i, 39)).toBe(c);
      expect(at(r270, 40, 39 - i)).toBe(c);
    }
    // Pivot in the middle of the bar: pixel 2 stays on the pivot corner, the ends swing around it.
    const [m0, m90] = bake([2, 0]) as [ReturnType<typeof decodePng>, ReturnType<typeof decodePng>];
    for (let i = 0; i < 5; i++) {
      expect(at(m0, 38 + i, 40)).toBe(10 + 40 * i);
      expect(at(m90, 39, 38 + i)).toBe(10 + 40 * i);
    }
  });

  it('uses a hand-painted key instead of the baked frame, only for that frame', () => {
    const files = fixture();
    const res = bakeRigs(files);
    const key = decodePng(files.get('fiara/keys/hurt/E/01.png') ?? new Uint8Array());
    expect(decodePng(res.outputs.get('fiara/hurt/E/01.png') ?? new Uint8Array()).data).toEqual(key.data);
    expect(decodePng(res.outputs.get('fiara/hurt/E/00.png') ?? new Uint8Array()).data).not.toEqual(key.data);
    expect(decodePng(res.outputs.get('fiara/hurt/SE/01.png') ?? new Uint8Array()).data).not.toEqual(key.data);
  });

  it('merges an `extends` variant over an abstract _base (parts by id, actions by name) and bakes only the concrete rig', () => {
    const files = fixture();
    const base = fixtureRig();
    const out = new Map<string, Uint8Array>();
    for (const [p, b] of files) if (!p.startsWith('fiara/keys/')) out.set(p.replace(/^fiara\//, '_base/'), b);
    out.set('_base/rig.json', enc(JSON.stringify({ ...base, actions: { hurt: base.actions?.hurt } })));
    out.set('fiara/rig.json', enc(JSON.stringify({ extends: '_base', dirs: ['E'], parts: [{ id: 'arm', z: -1 }], actions: { idle: base.actions?.idle } })));
    const res = bakeRigs(out);
    expect(res.errors).toEqual([]);
    expect(res.rigs).toEqual(['fiara']);
    expect([...res.outputs.keys()].filter((p) => p.endsWith('.png'))).toEqual([
      'fiara/hurt/E/00.png',
      'fiara/hurt/E/01.png',
      ...[0, 1, 2, 3].map((f) => `fiara/idle/E/0${String(f)}.png`),
    ]);
    expect(Object.keys((JSON.parse(res.lock ?? '{}') as { rigs: Record<string, { inputs: object }> }).rigs.fiara?.inputs ?? {})).toContain('_base/parts/arm.png');
    // The arm moved behind the body: the variant's frame differs from the base fixture's.
    const plain = bakeRigs(files).outputs.get('fiara/idle/E/00.png');
    expect(Buffer.from(plain ?? []).equals(res.outputs.get('fiara/idle/E/00.png') ?? new Uint8Array())).toBe(false);
  });

  const cases: [string, () => Map<string, Uint8Array>, RegExp][] = [
    ['invalid JSON', () => fixture().set('fiara/rig.json', enc('{')), /fiara\/rig\.json: invalid JSON/],
    ['unknown key', () => withRig((r) => (r.colour = 1)), /unknown key "colour"/],
    ['mirrored direction', () => withRig((r) => (r.dirs = ['E', 'W'])), /dirs\[1\]: W is mirrored from E at runtime/],
    ['frame count off the spec', () => withRig((r) => (r.actions.idle = { frames: 3 })), /actions\.idle\.frames: the sheet spec has 4 frames for idle/],
    ['short curve', () => withRig((r) => (r.actions.idle = { frames: 4, curves: { body: { dy: [0, 1] } } })), /curves\.body\.dy: expected 4 integers/],
    ['fractional rotation', () => withRig((r) => (r.actions.idle = { frames: 4, curves: { arm: { rot: [0, 1.5, 0, 0] } } })), /curves\.arm\.rot: expected 4 integers/],
    ['rotation out of range', () => withRig((r) => (r.actions.idle = { frames: 4, curves: { arm: { rot: [0, 400, 0, 0] } } })), /-360\.\.360/],
    ['missing id', () => withRig((r) => delete r.parts[1]?.id), /parts\[1\]: missing "id"/],
    ['duplicate id', () => withRig((r) => r.parts.push({ id: 'arm' })), /duplicate part id arm/],
    ['unknown parent', () => withRig((r) => r.parts[1] && (r.parts[1].parent = 'torso')), /part arm: unknown parent torso/],
    ['parent cycle', () => withRig((r) => r.parts[0] && (r.parts[0].parent = 'arm')), /parent cycle/],
    ['unknown action', () => withRig((r) => (r.actions.jump = { frames: 4 })), /actions\.jump: unknown action/],
    ['curve for an unknown part', () => withRig((r) => (r.actions.idle = { frames: 4, curves: { leg: { rot: [0, 0, 0, 0] } } })), /curves: unknown part leg/],
    ['part png missing', () => withRig((r) => r.parts[0] && (r.parts[0].png = 'nope.png')), /part body: parts\/nope\.png not found in fiara/],
    ['extends an unknown rig', () => withRig((r) => (r.extends = '_nope')), /extends unknown rig _nope/],
    [
      'extends cycle',
      () => withRig((r) => (r.extends = '_a')).set('_a/rig.json', enc('{"extends":"_b"}')).set('_b/rig.json', enc('{"extends":"_a"}')),
      /extends cycle fiara -> _a -> _b -> _a/,
    ],
    ['not a sheet character', () => new Map([...fixture()].map(([p, b]) => [p.replace(/^fiara\//, 'zzz/'), b])), /zzz: unknown character/],
    ['no licence', () => new Map([...fixture()].filter(([p]) => p !== 'fiara/license.txt')), /fiara: no license\.txt in the rig or its bases/],
    ['no rig.json', () => fixture().set('_x/parts/a.png', new Uint8Array()), /_x: no rig\.json/],
    ['key for a frame the rig does not bake', () => fixture().set('fiara/keys/hurt/S/00.png', png(FRAME, FRAME, () => [0, 0, 0, 255])), /keys\/hurt\/S\/00\.png: key for a frame/],
    ['key of the wrong size', () => fixture().set('fiara/keys/hurt/E/00.png', png(8, 8, () => [0, 0, 0, 255])), /8x8, expected 80x80/],
    ['unexpected file', () => fixture().set('fiara/notes.md', enc('hi')), /fiara\/notes\.md: unexpected file/],
  ];
  it.each(cases)('rejects %s with a clear error', (_, files, re) => {
    const res = bakeRigs(files());
    expect(res.errors.join('\n')).toMatch(re);
    expect(res.errors.length).toBeGreaterThan(0); // runBake writes nothing while any error stands
  });

  it('--check reports a stale lock, missing or changed frames and orphans, and nothing when up to date', () => {
    const a = bakeRigs(fixture());
    const from = (res: { outputs: SourceFiles }) => (rel: string) => res.outputs.get(rel);
    expect(staleFiles(a, a.lock, from(a))).toEqual([]);
    expect(staleFiles(a, undefined, from(a))).toEqual([LOCK_NAME]);
    const edited = new Map(a.outputs).set('fiara/idle/SE/02.png', new Uint8Array([1]));
    edited.delete('fiara/hurt/E/00.png');
    expect(staleFiles(a, a.lock, from({ outputs: edited }))).toEqual(['fiara/hurt/E/00.png', 'fiara/idle/SE/02.png']);
    // An input change re-locks and re-bakes only the frames it touches (the arm curve is idle-only).
    const b = bakeRigs(withRig((r) => (r.actions.idle = { frames: 4, curves: { arm: { rot: [0, 20, 30, 15] } } })));
    const changed = staleFiles(b, a.lock, from(a));
    expect(changed[0]).toBe(LOCK_NAME);
    expect(changed.some((p) => p.includes('/idle/'))).toBe(true);
    expect(changed.some((p) => p.includes('/hurt/'))).toBe(false);
    // Dropping a direction leaves orphans from the previous lock.
    const c = bakeRigs(withRig((r) => (r.dirs = ['E'])));
    expect(staleFiles(c, a.lock, from(a)).filter((p) => p !== LOCK_NAME)).toEqual([0, 1].map((f) => `fiara/hurt/SE/0${String(f)}.png`).concat([0, 1, 2, 3].map((f) => `fiara/idle/SE/0${String(f)}.png`)));
  });

  it('runBake --check fails on a stale bake and writes nothing', () => {
    const sheetsDir = resolve(FIXTURE, 'not-baked');
    const r = runBake({ check: true, rigsDir: FIXTURE, sheetsDir });
    expect(r.code).toBe(1);
    expect(r.message).toMatch(/^stale baked frames \(run pnpm assets:bake, then pnpm assets:sheets\):/);
    expect(r.message).toContain(resolve(FIXTURE, LOCK_NAME));
    expect(existsSync(sheetsDir)).toBe(false);
    expect(existsSync(resolve(FIXTURE, LOCK_NAME))).toBe(false);
  });

  it('the shipped rigs are up to date: pnpm assets:bake --check passes', () => {
    const r = runBake({ check: true });
    expect(r.code).toBe(0);
  });
});

describe('smooth rig bake (sample "ss2")', () => {
  type Img = ReturnType<typeof decodePng>;
  const lic: [string, Uint8Array] = ['fiara/license.txt', enc('CC0\n')];
  const bake = (rig: Record<string, unknown>, parts: Record<string, Uint8Array>): ReturnType<typeof bakeRigs> =>
    bakeRigs(new Map<string, Uint8Array>([['fiara/rig.json', enc(JSON.stringify(rig))], lic, ...Object.entries(parts).map(([n, b]): [string, Uint8Array] => [`fiara/parts/${n}`, b])]));
  const frameOf = (res: ReturnType<typeof bakeRigs>, rel: string): Img => decodePng(res.outputs.get(`fiara/${rel}.png`) ?? new Uint8Array());
  const px = (img: Img, x: number, y: number): number[] => [...img.data.subarray((y * img.width + x) * 4, (y * img.width + x) * 4 + 4)];
  // A 4x4 part with varied colour and alpha.
  const tex = (i: number): [number, number, number, number] => [(i * 53) % 256, (i * 97 + 40) % 256, (i * 31 + 7) % 256, i % 5 === 0 ? 0 : 60 + ((i * 41) % 196)];

  it('at rest with res 2 is the exact premultiplied 2x2 area downscale of the part', () => {
    const rig = { sample: 'ss2', res: 2, dirs: ['E'], parts: [{ id: 'p', png: 'p.png', pivot: [0, 0], at: [40, 60] }], actions: { hurt: { frames: 2 } } };
    const res = bake(rig, { 'p.png': png(4, 4, tex) });
    expect(res.errors).toEqual([]);
    const img = frameOf(res, 'hurt/E/00');
    expect([img.width, img.height]).toEqual([FRAME, FRAME]);
    for (let j = 0; j < 2; j++)
      for (let i = 0; i < 2; i++) {
        const src = [0, 1, 4, 5].map((k) => tex(j * 8 + i * 2 + k));
        const A = src.reduce((s, c) => s + c[3] * 255, 0);
        const want = [0, 1, 2].map((ch) => (A === 0 ? 0 : Math.min(255, Math.round((src.reduce((s, c) => s + (c[ch] ?? 0) * c[3], 0) * 255) / A))));
        const got = px(img, 20 + i, 30 + j);
        expect(got[3]).toBe(Math.round(A / 1020));
        if (A > 0) expect(got.slice(0, 3)).toEqual(want);
      }
    // Nothing else is drawn (alpha), only colour bled into the transparent border.
    let opaque = 0;
    for (let k = 3; k < img.data.length; k += 4) if ((img.data[k] ?? 0) > 0) opaque++;
    expect(opaque).toBe(4);
  });

  it('rotates without a dark halo: every soft edge pixel and the bled border keep the part colour', () => {
    const rig = { sample: 'ss2', dirs: ['E'], parts: [{ id: 'p', png: 'p.png', pivot: [10, 10], at: [40, 40] }], actions: { hurt: { frames: 2, curves: { p: { rot: [30, 63] } } } } };
    const res = bake(rig, { 'p.png': png(20, 20, () => [230, 120, 20, 255]) });
    expect(res.errors).toEqual([]);
    for (const f of ['00', '01']) {
      const img = frameOf(res, `hurt/E/${f}`);
      let soft = 0;
      let bled = 0;
      for (let k = 0; k < img.data.length; k += 4) {
        const [r, g, b, a] = [img.data[k] ?? 0, img.data[k + 1] ?? 0, img.data[k + 2] ?? 0, img.data[k + 3] ?? 0];
        if (a === 0 && r + g + b === 0) continue;
        if (a > 0 && a < 255) soft++;
        if (a === 0) bled++;
        expect([Math.abs(r - 230), Math.abs(g - 120), Math.abs(b - 20)].every((d) => d <= 2)).toBe(true);
      }
      expect(soft).toBeGreaterThan(20); // antialiased edges, not hard nearest-neighbour steps
      expect(bled).toBeGreaterThan(40);
    }
  });

  it('skins a part with bone weights: a full-weight bone moves it like the part, a zero pose leaves it alone', () => {
    // Two transparent rows at the bottom: the bilinear fringe stays inside both meshes (parts from prep.py have a clear margin).
    const bar = png(8, 40, (i) => [200, (i * 5) % 256, 90, i < 8 * 38 ? 255 : 0]);
    const base = (bonePose: Record<string, Record<string, number[]>>): Record<string, unknown> => ({
      sample: 'ss2',
      dirs: ['E'],
      bones: [
        { id: 'root', part: 'p', head: [4, 0] },
        { id: 'tip', part: 'p', parent: 'root', head: [4, 20] },
      ],
      parts: [{ id: 'p', png: 'p.png', pivot: [4, 0], at: [40, 20], skin: { grid: [2, 3], step: 20, bones: ['root', 'tip'], w: [256, 0, 256, 0, 0, 256, 0, 256, 0, 256, 0, 256] } }],
      actions: { hurt: { frames: 2, curves: bonePose } },
    });
    const plain = bake({ sample: 'ss2', dirs: ['E'], parts: [{ id: 'p', png: 'p.png', pivot: [4, 0], at: [40, 20] }], actions: { hurt: { frames: 2 } } }, { 'p.png': bar });
    const rest = bake(base({}), { 'p.png': bar });
    expect(rest.errors).toEqual([]);
    expect(Buffer.from(frameOf(rest, 'hurt/E/00').data).equals(Buffer.from(frameOf(plain, 'hurt/E/00').data))).toBe(true);
    // Rotating the tip bone 90 degrees swings the lower half sideways (to -x: clockwise, y down) and leaves the top in place.
    const bent = frameOf(bake(base({ tip: { rot: [90, 90] } }), { 'p.png': bar }), 'hurt/E/00');
    const at = (x: number, y: number): number => px(bent, x, y)[3] ?? 0;
    expect(at(40, 25)).toBe(255);
    expect(at(40, 55)).toBe(0);
    let left = 0;
    for (let y = 30; y < 50; y++) for (let x = 0; x < 34; x++) if (at(x, y) > 0) left++;
    expect(left).toBeGreaterThan(30);
  });

  it('wave and noise deformers are deterministic and move with the frame', () => {
    const rig = {
      sample: 'ss2',
      dirs: ['E'],
      parts: [{ id: 'p', png: 'p.png', pivot: [16, 16], at: [40, 40] }],
      actions: { hurt: { frames: 2, deform: { p: { wave: { axis: 'x', ampPx: 2, wavelengthPx: 16, phasePerFrame: 90 }, noise: { ampPx: 1, cellPx: 8, seed: 7 } } } } },
    };
    const part = { 'p.png': png(32, 32, (i) => [i % 256, 80, 160, 255]) };
    const a = bake(rig, part);
    const b = bake(rig, part);
    expect(a.errors).toEqual([]);
    for (const [p, bytes] of a.outputs) expect(Buffer.from(b.outputs.get(p) ?? []).equals(bytes)).toBe(true);
    expect(Buffer.from(a.outputs.get('fiara/hurt/E/00.png') ?? []).equals(a.outputs.get('fiara/hurt/E/01.png') ?? new Uint8Array())).toBe(false);
  });

  it('bakes the frame size and writes box.json for a rig with a box', () => {
    const rig = { sample: 'ss2', res: 2, frame: 96, box: [8, 10, 80, 80], dirs: ['E'], parts: [{ id: 'p', png: 'p.png', pivot: [0, 0], at: [90, 90] }], actions: { hurt: { frames: 2 } } };
    const res = bake(rig, { 'p.png': png(4, 4, tex) });
    expect(res.errors).toEqual([]);
    expect(new TextDecoder().decode(res.outputs.get('fiara/box.json'))).toBe('[8,10,80,80]\n');
    expect(frameOf(res, 'hurt/E/00').width).toBe(96);
    expect(packSheets(res.outputs).errors).toEqual([]);
  });

  const rest = { dirs: ['E'], parts: [{ id: 'p', png: 'p.png', pivot: [0, 0], at: [10, 10] }], actions: { hurt: { frames: 2 } } };
  const bad: [string, Record<string, unknown>, RegExp][] = [
    ['bones without ss2', { ...rest, bones: [{ id: 'b', part: 'p', head: [0, 0] }] }, /bones need sample "ss2"/],
    ['res 2 without ss2', { ...rest, res: 2 }, /res 2 needs sample "ss2"/],
    ['light channels without ss2', { ...rest, actions: { hurt: { frames: 2, curves: { p: { alpha: [128, 128] } } } } }, /alpha need sample "ss2"/],
    [
      'skin weights that do not sum to 256',
      { ...rest, sample: 'ss2', bones: [{ id: 'b', part: 'p', head: [0, 0] }], parts: [{ id: 'p', png: 'p.png', pivot: [0, 0], at: [10, 10], skin: { grid: [2, 2], step: 32, bones: ['b'], w: [256, 256, 200, 256] } }] },
      /skin vertex 2 weights sum to 200/,
    ],
    ['a box outside the frame', { ...rest, sample: 'ss2', box: [10, 10, 80, 80] }, /box: \[10, 10, 80, 80\] must be non-empty and inside the 80 px frame/],
  ];
  it.each(bad)('rejects %s', (_, rig, re) => {
    const res = bake(rig, { 'p.png': png(4, 4, tex) });
    expect(res.errors.join('\n')).toMatch(re);
  });
});
