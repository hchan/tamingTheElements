import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { BAKE_DIRS, bakeRigs, LOCK_NAME, runBake, sinQ16, staleFiles, subWeights, type RigJson } from '../../tools/assets/bake-rig';
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

  it('bakes an action only for its own `dirs` subset (default: all rig dirs) and counts the key check against it', () => {
    const files = withRig((r) => (r.actions.cast = { frames: 4, dirs: ['E'] }));
    const res = bakeRigs(files);
    expect(res.errors).toEqual([]);
    const png = [...res.outputs.keys()].filter((p) => p.endsWith('.png'));
    expect(png.filter((p) => p.includes('/cast/'))).toEqual([0, 1, 2, 3].map((f) => `fiara/cast/E/0${String(f)}.png`));
    expect(png.filter((p) => p.includes('/idle/')).some((p) => p.includes('/SE/'))).toBe(true);
    expect(JSON.parse(res.lock ?? '{}')).toMatchObject({ rigs: { fiara: { outputs: { 'fiara/cast/E/03.png': expect.any(String) as unknown } } } });
    // Without `dirs` the same action bakes for every rig dir.
    const all = bakeRigs(withRig((r) => (r.actions.cast = { frames: 4 })));
    expect([...all.outputs.keys()].filter((p) => p.includes('/cast/SE/'))).toHaveLength(4);
    // A key for a direction outside the action's subset is rejected.
    const withKey = new Map(files).set('fiara/keys/cast/SE/00.png', files.get('fiara/keys/hurt/E/01.png') ?? new Uint8Array());
    expect(bakeRigs(withKey).errors.join('\n')).toMatch(/keys\/cast\/SE\/00\.png: key for a frame the rig does not bake/);
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
    ['action dir outside the rig dirs', () => withRig((r) => (r.actions.cast = { frames: 4, dirs: ['N'] })), /actions\.cast\.dirs: N is not one of the rig's dirs/],
    ['mirrored action dir', () => withRig((r) => (r.actions.cast = { frames: 4, dirs: ['W'] })), /actions\.cast\.dirs\[0\]: W is mirrored from E at runtime/],
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

  describe('skin meshes (verts + tris)', () => {
    const same = (a: ReturnType<typeof bakeRigs>, b: ReturnType<typeof bakeRigs>): boolean =>
      [...a.outputs.keys()].length === [...b.outputs.keys()].length && [...a.outputs].every(([k, v]) => Buffer.from(b.outputs.get(k) ?? []).equals(v));
    const mk = (skin: Record<string, unknown>, curves: Record<string, unknown> = { a: { rot: [0, 50] }, m: { dx: [0, -10] } }): Record<string, unknown> => ({
      sample: 'ss2',
      dirs: ['E'],
      bones: [
        { id: 'a', part: 'p', head: [10, 10] },
        { id: 'm', part: 'p', head: [0, 0] },
      ],
      parts: [{ id: 'p', png: 'p.png', pivot: [0, 0], at: [10, 30], skin }],
      actions: { hurt: { frames: 2, curves } },
    });

    it('a mesh laid out like the grid bakes byte-identically (rest, bent bone, wave, noise, dw)', () => {
      const part = png(40, 40, (i) => [(i * 7) % 256, 90, 200 - (i % 100), Math.floor(i / 40) >= 34 || i % 40 < 3 ? 0 : 255]);
      const w: number[] = [];
      const dw: number[] = [];
      for (let v = 0; v < 9; v++) {
        const row = Math.floor(v / 3);
        w.push(...(row === 0 ? [256, 0] : row === 1 ? [128, 128] : [0, 256]));
        dw.push(v * 32);
      }
      const bones = [{ id: 'root', part: 'p', head: [20, 0] }, { id: 'tip', part: 'p', parent: 'root', head: [20, 20] }];
      const rig = (skin: Record<string, unknown>): Record<string, unknown> => ({
        sample: 'ss2',
        res: 2,
        dirs: ['E'],
        bones,
        parts: [{ id: 'p', png: 'p.png', pivot: [20, 0], at: [40, 20], skin: { bones: ['root', 'tip'], w, dw, ...skin } }],
        actions: { hurt: { frames: 2, curves: { tip: { rot: [0, 40] } }, deform: { p: { wave: { axis: 'x', ampPx: 2, wavelengthPx: 16, phasePerFrame: 90 }, noise: { ampPx: 1, cellPx: 8, seed: 3 } } } } },
      });
      const verts: number[] = [];
      for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) verts.push(i * 20, j * 20);
      const tris: number[] = [];
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const a = j * 3 + i;
          tris.push(a, a + 1, a + 4, a, a + 4, a + 3);
        }
      const g = bake(rig({ grid: [3, 3], step: 20 }), { 'p.png': part });
      const m = bake(rig({ verts, tris }), { 'p.png': part });
      expect(g.errors).toEqual([]);
      expect(m.errors).toEqual([]);
      expect(same(g, m)).toBe(true);
      expect(Buffer.from(g.outputs.get('fiara/hurt/E/00.png') ?? []).equals(g.outputs.get('fiara/hurt/E/01.png') ?? new Uint8Array())).toBe(false);
    });

    // Two islands 20 px wide with a 20 px gap (x 20..40) in a 60x20 part; the vertex at x 30 sits in the gap.
    const islands = png(60, 20, (i) => [200, 80, 40, i % 60 < 20 || i % 60 >= 40 ? 255 : 0]);
    const box = (img: ReturnType<typeof decodePng>): number[] => {
      const out: number[] = [];
      for (let y = 28; y < 52; y++) for (let x = 48; x < 72; x++) out.push(...px(img, x, y));
      return out;
    };
    it('a seam leaves the other island untouched; the same image on a shared grid does not', () => {
      const wa = [256, 0, 0, 0];
      const wb = [0, 256, 0, 0];
      const mesh = bake(
        mk({
          bones: ['a', 'm'],
          verts: [0, 0, 30, 0, 0, 20, 30, 20, 30, 0, 60, 0, 30, 20, 60, 20],
          tris: [0, 1, 3, 0, 3, 2, 4, 5, 7, 4, 7, 6],
          w: [...wa, ...wa, ...wa, ...wa, ...wb, ...wb, ...wb, ...wb].filter((_, i) => i % 4 < 2),
        }, { a: { rot: [0, 50] } }),
        { 'p.png': islands },
      );
      const grid = bake(mk({ bones: ['a', 'm'], grid: [3, 2], step: 30, w: [...wa, ...wa, ...wb, ...wa, ...wa, ...wb].filter((_, i) => i % 4 < 2) }, { a: { rot: [0, 50] } }), { 'p.png': islands });
      expect(mesh.errors).toEqual([]);
      expect(grid.errors).toEqual([]);
      const m0 = frameOf(mesh, 'hurt/E/00');
      const m1 = frameOf(mesh, 'hurt/E/01');
      expect(box(m1)).toEqual(box(m0));
      expect(Buffer.from(m1.data).equals(Buffer.from(m0.data))).toBe(false);
      expect(box(frameOf(grid, 'hurt/E/01'))).not.toEqual(box(frameOf(grid, 'hurt/E/00')));
    });

    it('draws triangles in list order', () => {
      const half = png(20, 20, (i) => (i % 20 < 10 ? [220, 20, 20, 255] : [20, 20, 220, 255]));
      const skin = (tris: number[]): Record<string, unknown> => ({
        bones: ['a', 'm'],
        // A (red, x 0..10) stays; B (blue, x 10..20) is moved 10 px left by bone m, onto A.
        verts: [0, 0, 10, 0, 0, 20, 10, 0, 20, 0, 10, 20],
        tris,
        w: [256, 0, 256, 0, 256, 0, 0, 256, 0, 256, 0, 256],
      });
      const ab = bake(mk(skin([0, 1, 2, 3, 4, 5])), { 'p.png': half });
      const ba = bake(mk(skin([3, 4, 5, 0, 1, 2])), { 'p.png': half });
      expect(ab.errors).toEqual([]);
      expect(ba.errors).toEqual([]);
      expect(same(ab, bake(mk(skin([0, 1, 2, 3, 4, 5])), { 'p.png': half }))).toBe(true);
      expect(Buffer.from(frameOf(ab, 'hurt/E/01').data).equals(Buffer.from(frameOf(ba, 'hurt/E/01').data))).toBe(false);
      expect(Buffer.from(frameOf(ab, 'hurt/E/00').data).equals(Buffer.from(frameOf(ba, 'hurt/E/00').data))).toBe(true);
    });

    const okMesh = { bones: ['a'], verts: [0, 0, 20, 0, 0, 20, 20, 20], tris: [0, 1, 2, 1, 3, 2], w: [256, 256, 256, 256] };
    const meshBad: [string, Record<string, unknown>, RegExp][] = [
      ['grid and verts together', mk({ ...okMesh, grid: [2, 2], step: 20 }), /either grid and step, or verts and tris/],
      ['neither grid nor verts', mk({ bones: ['a'], w: [256] }), /either grid and step, or verts and tris/],
      ['verts without tris', mk({ bones: ['a'], verts: okMesh.verts, w: okMesh.w }), /either grid and step, or verts and tris/],
      ['an odd verts list', mk({ ...okMesh, verts: [0, 0, 20, 0, 0, 20, 20] }), /verts: expected \[x, y, \.\.\.\]/],
      ['tris that are not a multiple of 3', mk({ ...okMesh, tris: [0, 1, 2, 1] }), /tris: expected vertex index triples/],
      ['a triangle index out of range', mk({ ...okMesh, tris: [0, 1, 9] }), /tris index 9 is outside the 4 vertices/],
      ['a degenerate triangle', mk({ ...okMesh, tris: [0, 1, 1] }), /triangle 0 is degenerate/],
      ['an edge longer than 64 px', mk({ ...okMesh, verts: [0, 0, 65, 0, 0, 20, 65, 20] }), /triangle 0 has an edge longer than 64 px/],
      ['a vertex outside the image', mk({ ...okMesh, verts: [0, 0, 20, 0, 0, 20, 20, 21] }), /vertex 3 lies outside the 80x20 image/],
      ['w of the wrong length', mk({ ...okMesh, w: [256, 256, 256] }), /skin.w has 3 weights, expected 4/],
      ['dw of the wrong length', mk({ ...okMesh, dw: [256] }), /skin.dw has 1 values, expected 4/],
      ['a mesh without ss2', { ...mk(okMesh), sample: 'nearest' }, /need sample "ss2"/],
    ];
    it.each(meshBad)('rejects %s', (_, rig, re) => {
      const res = bake(rig, { 'p.png': png(80, 20, () => [9, 9, 9, 255]) });
      expect(res.errors.join('\n')).toMatch(re);
    });
  });

  describe('sub-frames', () => {
    const bar = png(9, 3, (i) => [10 + 20 * (i % 9), 7, 9, 255]);
    const bake = (sub: number | undefined, action: 'idle' | 'hurt', extra: Record<string, unknown> = {}, rot = [0, 40, 80, 120]): Map<string, Uint8Array> => {
      const n = action === 'idle' ? 4 : 2;
      const a: Record<string, unknown> = {
        frames: n,
        ...(sub === undefined ? {} : { sub }),
        curves: { bar: { rot: rot.slice(0, n), ...(extra['alpha'] ? { alpha: extra['alpha'] } : {}) } },
        ...(extra['deform'] ? { deform: extra['deform'] } : {}),
      };
      const rig = { dirs: ['E'], ...(extra['rig'] as object | undefined), parts: [{ id: 'bar', png: 'bar.png', pivot: [0, 1], at: [40, 40] }], actions: { [action]: a } };
      const res = bakeRigs(new Map([['fiara/rig.json', enc(JSON.stringify(rig))], ['fiara/license.txt', enc('CC0\n')], ['fiara/parts/bar.png', bar]]));
      expect(res.errors).toEqual([]);
      return new Map(res.outputs);
    };
    const same = (x: Uint8Array | undefined, y: Uint8Array | undefined): boolean => x !== undefined && y !== undefined && Buffer.from(x).equals(y);
    const name = (a: string, f: number): string => `fiara/${a}/E/${String(f).padStart(2, '0')}.png`;

    it('has integer weights that sum to 16384 and are exact for k = 2 and 4', () => {
      for (const k of [1, 2, 3, 4]) for (let r = 0; r < k; r++) expect(subWeights(r, k).reduce((a, b) => a + b, 0)).toBe(16384);
      expect(subWeights(1, 2)).toEqual([-1024, 9216, 9216, -1024]);
      expect(subWeights(1, 4)).toEqual([-1152, 14208, 3712, -384]);
      expect(subWeights(3, 4)).toEqual([-384, 3712, 14208, -1152]);
      expect(subWeights(1, 3)).toEqual([-1214, 12744, 5461, -607]);
      expect(subWeights(2, 3)).toEqual([-607, 5461, 12744, -1214]);
    });

    it('sub 1 and no sub are byte-identical', () => {
      const a = bake(undefined, 'idle');
      const b = bake(1, 'idle');
      expect([...b.keys()]).toEqual([...a.keys()]);
      for (const [p, bytes] of a) expect(same(b.get(p), bytes)).toBe(true);
    });

    it('sub 2 on a loop: frame 2j is key j, 2j+1 differs, the last gap wraps to key 0', () => {
      const plain = bake(undefined, 'idle');
      const sub = bake(2, 'idle');
      expect([...sub.keys()].filter((p) => p.endsWith('.png'))).toHaveLength(8);
      for (let j = 0; j < 4; j++) {
        expect(same(sub.get(name('idle', 2 * j)), plain.get(name('idle', j)))).toBe(true);
        expect(same(sub.get(name('idle', 2 * j + 1)), plain.get(name('idle', j)))).toBe(false);
      }
      // Wrap: rot between 120 and 0 (neighbours 80 and 40) is not the clamped value, so it is not key 3 either.
      expect(same(sub.get(name('idle', 7)), plain.get(name('idle', 3)))).toBe(false);
    });

    it('sub 2 on a one-shot clamps: the tail repeats the last key', () => {
      const plain = bake(undefined, 'hurt');
      const sub = bake(2, 'hurt');
      expect(same(sub.get(name('hurt', 0)), plain.get(name('hurt', 0)))).toBe(true);
      expect(same(sub.get(name('hurt', 1)), plain.get(name('hurt', 0)))).toBe(false);
      expect(same(sub.get(name('hurt', 2)), plain.get(name('hurt', 1)))).toBe(true);
      expect(same(sub.get(name('hurt', 3)), plain.get(name('hurt', 1)))).toBe(true);
    });

    it('clamps alpha to the segment and steps the wave phase by whole degrees', () => {
      const smooth = { rig: { sample: 'ss2' } };
      // alpha 256, 256, 0, 256: in-between values stay inside their key segment (clamped, no overshoot).
      const a = bake(2, 'idle', { ...smooth, alpha: [256, 256, 0, 256] });
      const b = bake(2, 'idle', { ...smooth, alpha: [256, 256, 0, 256], deform: { bar: { wave: { axis: 'y', ampPx: 2, wavelengthPx: 8, phasePerFrame: 45 } } } });
      expect(a.size).toBe(9);
      expect(same(a.get(name('idle', 2)), b.get(name('idle', 2)))).toBe(false); // phase 90 degrees by frame 2 with the wave
      const plain = bake(undefined, 'idle', { ...smooth, alpha: [256, 256, 0, 256] });
      for (let j = 0; j < 4; j++) expect(same(a.get(name('idle', 2 * j)), plain.get(name('idle', j)))).toBe(true);
    });

    it('rejects sub outside 1..4', () => {
      const rig = { dirs: ['E'], parts: [{ id: 'bar', png: 'bar.png', pivot: [0, 1], at: [40, 40] }], actions: { idle: { frames: 4, sub: 5 } } };
      const res = bakeRigs(new Map([['fiara/rig.json', enc(JSON.stringify(rig))], ['fiara/license.txt', enc('CC0\n')], ['fiara/parts/bar.png', bar]]));
      expect(res.errors.join('\n')).toContain('sub');
    });
  });
});
