// Rig baker (FUN-DESIGN section 2.16 "Rig and bake", ADR-0019). Bakes cutout rigs (parts with pivots in a parent tree, per-action
// integer keyframe curves) into the per-frame PNGs that pack-sheets.ts packs: imgWorkArea/sheets/<sprite>/<action>/<dir>/<NN>.png.
// Offline and deterministic: integer degrees through a Q14 sine table, Q16 fixed-point affine matrices, nearest-neighbour sampling,
// integer alpha compositing and png-lite output, so the bytes depend only on the inputs. W, SW and NW are never baked: resolveRow
// mirrors them from E, SE and NE at runtime.
// Opt-in upgrades for painted (portrait) rigs (ADR-0033): a per-rig `frame` size and `box`, `sample: "ss2"` (a 2x supersampled
// triangle-mesh render with bilinear taps on premultiplied integer RGBA, box-filtered down), `res` (art px per frame px), bones
// with Q8 skin weights, per-direction static offsets, wave/noise deformers, alpha/bright channels and additive parts. Rigs that do
// not opt in bake byte-identically to before.
// Run: pnpm assets:bake (writes frames and imgWorkArea/rigs/bake.lock.json) or pnpm assets:bake --check (fails when a bake is stale).
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { readSources, type SourceFiles } from './pack-sheets';
import { decodePng, encodePng, type Image } from './png-lite';
import { ACTIONS, DIRS, FRAME, framesIn, MIRROR_OF, SOURCE_DIR, sheetCharacters, type Action, type Dir } from './sheet-spec';

const root = resolve(import.meta.dirname, '../..');
export const RIGS_DIR = 'imgWorkArea/rigs';
export const LOCK_NAME = 'bake.lock.json';
/** Bump when the bake algorithm changes: every lock goes stale. */
export const BAKE_VERSION = 1;
/** Directions a rig may author (W, SW, NW are mirrored at runtime by resolveRow). */
export const BAKE_DIRS: readonly Dir[] = DIRS.filter((d) => MIRROR_OF[d] === undefined);

type Pt = readonly [number, number];
export interface PartView {
  readonly png?: string;
  /** Pivot in part-image pixels (0,0 = top-left corner of the image). */
  readonly pivot?: Pt;
  /** Pivot position in the parent's pivot space, or in the 80x80 frame for a root part. */
  readonly at?: Pt;
  /** Draw order (low first; ties keep the declaration order). */
  readonly z?: number;
  readonly hide?: boolean;
}
/**
 * A skin mesh over a part image (ss2 only): vertices on a `grid` of [columns, rows] every `step` image px from the top-left
 * corner (it must cover the image), and per vertex one Q8 weight per entry of `bones` (vertex-major; each vertex sums to 256 with
 * at most 3 non-zero). `dw` (one 0..256 value per vertex) scales the part's deformers.
 */
export interface Skin {
  readonly grid: Pt;
  readonly step: number;
  readonly bones: readonly string[];
  readonly w: readonly number[];
  readonly dw?: readonly number[];
}
/** A bone of a part (ss2 only): `head` (part image px) is its joint; child bones and `bone`-attached parts follow it. */
export interface RigBone {
  readonly id: string;
  readonly part: string;
  readonly parent?: string;
  readonly head: Pt;
}
export interface RigPart extends PartView {
  readonly id: string;
  readonly parent?: string;
  /** Rigidly follows this bone of the parent part (ss2 only); `at` stays in the parent's pivot space. */
  readonly bone?: string;
  readonly skin?: Skin;
  /** `add`: the part adds light (glows; ss2 only). */
  readonly blend?: 'add';
  /** Per-direction overrides (other art, pivot, position, order, hidden). */
  readonly views?: Readonly<Partial<Record<Dir, PartView>>>;
}
export const CHANNELS = ['rot', 'dx', 'dy', 'sx', 'sy'] as const;
export type Channel = (typeof CHANNELS)[number];
/** ss2-only part channels: alpha 0..256 (default 256) and bright 0..512 (default 256). */
export const LIGHT_CHANNELS = ['alpha', 'bright'] as const;
export type LightChannel = (typeof LIGHT_CHANNELS)[number];
/** A travelling sine offset along `axis` (px); its phase runs along the other axis and advances `phasePerFrame` degrees a frame. */
export interface Wave {
  readonly axis: 'x' | 'y';
  readonly ampPx: number;
  readonly wavelengthPx: number;
  readonly phasePerFrame: number;
  readonly phase?: number;
}
/** Integer value noise on a lattice of `cellPx`, a fresh field every frame. */
export interface Noise {
  readonly ampPx: number;
  readonly cellPx: number;
  readonly seed: number;
}
export interface Deform {
  readonly wave?: Wave;
  readonly noise?: Noise;
}
export interface RigAction {
  readonly frames: number;
  /**
   * part or bone id -> channel -> one integer per frame: rot degrees clockwise, dx/dy pixels (art pixels with `res`), sx/sy percent
   * (default 100); parts of ss2 rigs also take alpha and bright.
   */
  readonly curves?: Readonly<Record<string, Readonly<Partial<Record<Channel | LightChannel, readonly number[]>>>>>;
  /** part id -> deformers (ss2 only). */
  readonly deform?: Readonly<Record<string, Deform>>;
}
export type Offset = Readonly<Partial<Record<Channel, number>>>;
export interface RigJson {
  readonly extends?: string;
  /** `portrait`: built by tools/assets/portrait-rig from a painted portrait (the old rig-gen scripts refuse to overwrite it). */
  readonly source?: 'portrait';
  /** Square output frame size in px (default FRAME). */
  readonly frame?: number;
  /** `ss2`: the smooth supersampled render (default `nearest`). */
  readonly sample?: 'nearest' | 'ss2';
  /** Art pixels per frame pixel (ss2 only, default 1): `at`, `head`, dx and dy are in art pixels. */
  readonly res?: 1 | 2;
  /** The frame rect [x, y, w, h] that maps onto the sim's visual box; baked to <rig>/box.json for the packer. */
  readonly box?: readonly [number, number, number, number];
  readonly dirs?: readonly Dir[];
  /** Static per-direction offsets by part or bone id (ss2 only): rot, dx, dy add to the curves; sx, sy multiply (percent). */
  readonly dirOffsets?: Readonly<Partial<Record<Dir, Readonly<Record<string, Offset>>>>>;
  readonly parts?: readonly RigPart[];
  readonly bones?: readonly RigBone[];
  readonly actions?: Readonly<Partial<Record<Action, RigAction>>>;
}

// round(16384 * sin(d degrees)), d = 0..90; a literal so no host maths is involved (the tests check it against Math.sin).
// prettier-ignore
const SIN_Q14 = [0,286,572,857,1143,1428,1713,1997,2280,2563,2845,3126,3406,3686,3964,4240,4516,4790,5063,5334,5604,5872,6138,6402,6664,6924,7182,7438,7692,7943,8192,8438,8682,8923,9162,9397,9630,9860,10087,10311,10531,10749,10963,11174,11381,11585,11786,11982,12176,12365,12551,12733,12911,13085,13255,13421,13583,13741,13894,14044,14189,14330,14466,14598,14726,14849,14968,15082,15191,15296,15396,15491,15582,15668,15749,15826,15897,15964,16026,16083,16135,16182,16225,16262,16294,16322,16344,16362,16374,16382,16384];
const Q = 65536;
const tab = (d: number): number => (SIN_Q14[d] ?? 0) * 4;
/** sin of integer degrees in Q16. */
export function sinQ16(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  return d <= 90 ? tab(d) : d <= 180 ? tab(180 - d) : d <= 270 ? -tab(d - 180) : -tab(360 - d);
}
const cosQ16 = (deg: number): number => sinQ16(deg + 90);

/** Affine [a b tx; c d ty], every entry an integer in Q16. All products stay below 2^53, so the arithmetic is exact. */
type Mat = readonly [number, number, number, number, number, number];
const rq = (x: number): number => Math.round(x / Q);
const mul = (A: Mat, B: Mat): Mat => [
  rq(A[0] * B[0] + A[1] * B[3]),
  rq(A[0] * B[1] + A[1] * B[4]),
  rq(A[0] * B[2] + A[1] * B[5]) + A[2],
  rq(A[3] * B[0] + A[4] * B[3]),
  rq(A[3] * B[1] + A[4] * B[4]),
  rq(A[3] * B[2] + A[4] * B[5]) + A[5],
];

// ---- schema ----

const isInt = (v: unknown): v is number => Number.isInteger(v);
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPt = (v: unknown): boolean => Array.isArray(v) && v.length === 2 && v.every(isInt);
const ACTION_NAMES = ACTIONS.map(([a]) => a as string);
const ID_RE = /^[A-Za-z0-9_-]+$/;
const PNG_RE = /^[A-Za-z0-9_-]+\.png$/;
/** Channel bounds; dx and dy grow to the rig's frame * res. */
const RANGE: Record<Channel | LightChannel, number> = { rot: 360, dx: FRAME, dy: FRAME, sx: 400, sy: 400, alpha: 256, bright: 512 };
export const MAX_FRAME = 512;
const MAX_STEP = 64;
type Field = (v: unknown, path: string) => void;

/** Validates one rig.json (shape, types, ranges, names). References are checked after `extends` is resolved. */
export function parseRig(where: string, text: string, errors: string[]): RigJson | undefined {
  let j: unknown;
  try {
    j = JSON.parse(text);
  } catch (e) {
    errors.push(`${where}: invalid JSON (${(e as Error).message})`);
    return undefined;
  }
  const n0 = errors.length;
  const bad = (path: string, msg: string): void => void errors.push(`${where}: ${path === '' ? '(root)' : path}: ${msg}`);
  const at = (path: string, k: string | number): string => (typeof k === 'number' ? `${path}[${String(k)}]` : path === '' ? k : `${path}.${k}`);
  const check = (ok: (v: unknown) => boolean, msg: string): Field => (v, path) => void (ok(v) || bad(path, msg));
  /** An object with known keys only (anything else is an error) and the required ones present. */
  const obj = (fields: Readonly<Record<string, Field>>, required: readonly string[] = []): Field => (v, path) => {
    if (!isObj(v)) return bad(path, 'expected an object');
    for (const k of required) if (!(k in v)) bad(path, `missing "${k}"`);
    for (const [k, x] of Object.entries(v)) {
      const f = fields[k];
      if (f === undefined) bad(path, `unknown key "${k}" (allowed: ${Object.keys(fields).join(', ')})`);
      else f(x, at(path, k));
    }
  };
  /** An object keyed by names that `keyError` accepts. */
  const map = (keyError: (k: string) => string | undefined, val: (k: string) => Field, what: string): Field => (v, path) => {
    if (!isObj(v)) return bad(path, `expected an object keyed by ${what}`);
    for (const [k, x] of Object.entries(v)) {
      const e = keyError(k);
      if (e === undefined) val(k)(x, at(path, k));
      else bad(at(path, k), e);
    }
  };
  const list = (each: Field, nonEmpty: boolean): Field => (v, path) => {
    if (!Array.isArray(v) || (nonEmpty && v.length === 0)) return bad(path, `expected ${nonEmpty ? 'a non-empty array' : 'an array'}`);
    v.forEach((x: unknown, i) => void each(x, at(path, i)));
  };
  const dirError = (d: string): string | undefined => {
    const m = MIRROR_OF[d as Dir];
    if (m !== undefined) return `${d} is mirrored from ${m} at runtime (resolveRow); do not bake it`;
    return BAKE_DIRS.includes(d as Dir) ? undefined : `unknown direction ${d} (allowed: ${BAKE_DIRS.join(', ')})`;
  };
  const pt = check(isPt, 'expected [x, y] integers');
  const view = {
    png: check((v) => typeof v === 'string' && PNG_RE.test(v), 'expected a file name like "arm.png" in parts/'),
    pivot: pt,
    at: pt,
    z: check(isInt, 'expected an integer'),
    hide: check((v) => typeof v === 'boolean', 'expected true or false'),
  };
  const ids = new Set<string>();
  const id: Field = (v, path) => {
    if (typeof v !== 'string' || !ID_RE.test(v)) bad(path, 'expected an id of letters, digits, _ or -');
    else if (ids.has(v)) bad(path, `duplicate part id ${v}`);
    else ids.add(v);
  };
  // dx/dy bounds follow the rig's own geometry (a rig without `frame` keeps the 80 px bounds).
  const raw = isObj(j) ? j : {};
  const span = (isInt(raw['frame']) ? raw['frame'] : FRAME) * (raw['res'] === 2 ? 2 : 1);
  const hi = (ch: Channel | LightChannel): number => (ch === 'dx' || ch === 'dy' ? Math.max(span, RANGE[ch]) : RANGE[ch]);
  const lo = (ch: Channel | LightChannel): number => ((LIGHT_CHANNELS as readonly string[]).includes(ch) ? 0 : -hi(ch));
  const num = (min: number, max: number): Field => check((v) => isInt(v) && v >= min && v <= max, `expected an integer in ${String(min)}..${String(max)}`);
  const action = (a: string): Field => {
    const n = framesIn(a as Action);
    const ints = (ch: Channel | LightChannel): Field =>
      check(
        (v) => Array.isArray(v) && v.length === n && v.every((x) => isInt(x) && x >= lo(ch) && x <= hi(ch)),
        `expected ${String(n)} integers in ${String(lo(ch))}..${String(hi(ch))}`,
      );
    const curve = obj(Object.fromEntries([...CHANNELS, ...LIGHT_CHANNELS].map((ch) => [ch, ints(ch)])));
    const deform = obj({
      wave: obj(
        { axis: check((v) => v === 'x' || v === 'y', 'expected "x" or "y"'), ampPx: num(-64, 64), wavelengthPx: num(1, 4096), phasePerFrame: num(-360, 360), phase: num(-360, 360) },
        ['axis', 'ampPx', 'wavelengthPx', 'phasePerFrame'],
      ),
      noise: obj({ ampPx: num(0, 64), cellPx: num(1, 1024), seed: num(0, 0x7fffffff) }, ['ampPx', 'cellPx', 'seed']),
    });
    return obj(
      {
        frames: check((v) => v === n, `the sheet spec has ${String(n)} frames for ${a}`),
        curves: map(() => undefined, () => curve, 'part id'),
        deform: map(() => undefined, () => deform, 'part id'),
      },
      ['frames'],
    );
  };
  const q8s = check((v) => Array.isArray(v) && v.every((x) => isInt(x) && x >= 0 && x <= 256), 'expected integers in 0..256');
  const skin = obj(
    {
      grid: check((v) => isPt(v) && (v as number[]).every((x) => x >= 2 && x <= 1024), 'expected [columns, rows] in 2..1024'),
      step: num(2, MAX_STEP),
      bones: list(check((v) => typeof v === 'string' && ID_RE.test(v), 'expected a bone id'), true),
      w: q8s,
      dw: q8s,
    },
    ['grid', 'step', 'bones', 'w'],
  );
  const offset = obj(Object.fromEntries(CHANNELS.map((ch) => [ch, num(-hi(ch), hi(ch))])));
  const ref = (what: string): Field => check((v) => typeof v === 'string', `expected a ${what} id`);
  obj({
    extends: check((v) => typeof v === 'string' && ID_RE.test(v), 'expected a rig name'),
    source: check((v) => v === 'portrait', 'expected "portrait"'),
    frame: check((v) => isInt(v) && v >= FRAME && v <= MAX_FRAME && v % 2 === 0, `expected an even frame size in ${String(FRAME)}..${String(MAX_FRAME)}`),
    sample: check((v) => v === 'nearest' || v === 'ss2', 'expected "nearest" or "ss2"'),
    res: check((v) => v === 1 || v === 2, 'expected 1 or 2'),
    box: check((v) => Array.isArray(v) && v.length === 4 && v.every((x) => isInt(x) && x >= 0), 'expected [x, y, w, h] non-negative integers'),
    dirs: list((v, path) => {
      const e = typeof v === 'string' ? dirError(v) : 'expected a direction name';
      if (e !== undefined) bad(path, e);
    }, true),
    dirOffsets: map(dirError, () => map(() => undefined, () => offset, 'part or bone id'), 'direction'),
    parts: list(
      obj(
        { id, parent: ref('part'), bone: ref('bone'), skin, blend: check((v) => v === 'add', 'expected "add"'), ...view, views: map(dirError, () => obj(view), 'direction') },
        ['id'],
      ),
      false,
    ),
    bones: list(obj({ id, part: ref('part'), parent: ref('bone'), head: pt }, ['id', 'part', 'head']), false),
    actions: map((a) => (ACTION_NAMES.includes(a) ? undefined : `unknown action (allowed: ${ACTION_NAMES.join(', ')})`), action, 'action'),
  })(j, '');
  return errors.length === n0 ? (j as RigJson) : undefined;
}

// ---- bake ----

interface Resolved {
  readonly name: string;
  /** The rig, then its bases. */
  readonly chain: readonly string[];
  readonly dirs: readonly Dir[];
  readonly parts: readonly RigPart[];
  readonly actions: Readonly<Partial<Record<Action, RigAction>>>;
  readonly frame: number;
  readonly smooth: boolean;
  readonly res: 1 | 2;
  readonly box: RigJson['box'];
  readonly dirOffsets: NonNullable<RigJson['dirOffsets']>;
  readonly bones: readonly RigBone[];
}

/**
 * Applies `extends`: dirs, frame, sample, res, box and dirOffsets from the nearest rig that sets them, parts and bones merged by id
 * (fields and views), actions replaced by name.
 */
function resolveRig(name: string, raws: ReadonlyMap<string, RigJson | undefined>, errors: string[]): Resolved | undefined {
  const chain: string[] = [];
  for (let cur: string | undefined = name; cur !== undefined; ) {
    if (chain.includes(cur)) return void errors.push(`${name}: extends cycle ${[...chain, cur].join(' -> ')}`);
    if (!raws.has(cur)) return void errors.push(`${chain.at(-1) ?? name}/rig.json: extends unknown rig ${cur}`);
    const raw = raws.get(cur);
    if (raw === undefined) return undefined; // invalid rig.json, already reported
    chain.push(cur);
    cur = raw.extends;
  }
  let dirs: readonly Dir[] | undefined;
  let frame: number | undefined;
  let sample: RigJson['sample'];
  let res: RigJson['res'];
  let box: RigJson['box'];
  let dirOffsets: RigJson['dirOffsets'];
  const parts: RigPart[] = [];
  const bones: RigBone[] = [];
  const actions: Partial<Record<Action, RigAction>> = {};
  for (const n of [...chain].reverse()) {
    const r = raws.get(n) as RigJson;
    dirs = r.dirs ?? dirs;
    frame = r.frame ?? frame;
    sample = r.sample ?? sample;
    res = r.res ?? res;
    box = r.box ?? box;
    dirOffsets = r.dirOffsets ?? dirOffsets;
    for (const b of r.bones ?? []) {
      const i = bones.findIndex((q) => q.id === b.id);
      if (i < 0) bones.push(b);
      else bones[i] = b;
    }
    for (const p of r.parts ?? []) {
      const i = parts.findIndex((q) => q.id === p.id);
      const old = parts[i];
      if (old === undefined) parts.push(p);
      else parts[i] = { ...old, ...p, views: { ...old.views, ...p.views } };
    }
    Object.assign(actions, r.actions);
  }
  const n0 = errors.length;
  const e = (msg: string): void => void errors.push(`${name}/rig.json (with bases): ${msg}`);
  if (dirs === undefined) e('dirs: required');
  if (parts.length === 0) e('parts: at least one part is required');
  if (Object.keys(actions).length === 0) e('actions: at least one action is required');
  const ids = new Set(parts.map((p) => p.id));
  for (const p of parts) {
    for (const f of ['png', 'pivot', 'at'] as const) if (p[f] === undefined) e(`part ${p.id}: ${f} is required`);
    if (p.parent !== undefined && !ids.has(p.parent)) e(`part ${p.id}: unknown parent ${p.parent}`);
    const seen = [p.id];
    for (let q = p.parent; q !== undefined; q = parts.find((x) => x.id === q)?.parent) {
      if (seen.includes(q)) {
        e(`part ${p.id}: parent cycle ${[...seen, q].join(' -> ')}`);
        break;
      }
      seen.push(q);
    }
  }
  const F = frame ?? FRAME;
  const smooth = sample === 'ss2';
  const boneOf = new Map<string, RigBone>();
  bones.forEach((b) => {
    if (ids.has(b.id) || boneOf.has(b.id)) e(`bone ${b.id}: duplicate id (bones and parts share one id space)`);
    if (!ids.has(b.part)) e(`bone ${b.id}: unknown part ${b.part}`);
    if (b.parent !== undefined && boneOf.get(b.parent)?.part !== b.part) e(`bone ${b.id}: parent ${b.parent} must be an earlier bone of part ${b.part}`);
    boneOf.set(b.id, b);
  });
  if (!smooth) {
    if (res === 2) e('res 2 needs sample "ss2"');
    if (bones.length > 0) e('bones need sample "ss2"');
    if (dirOffsets !== undefined) e('dirOffsets need sample "ss2"');
  }
  if (box !== undefined) {
    const [x, y, w, h] = box;
    if (w <= 0 || h <= 0 || x + w > F || y + h > F) e(`box: [${box.join(', ')}] must be non-empty and inside the ${String(F)} px frame`);
  }
  for (const p of parts) {
    if (!smooth && (p.skin !== undefined || p.bone !== undefined || p.blend !== undefined)) e(`part ${p.id}: skin, bone and blend need sample "ss2"`);
    if (p.bone !== undefined && (p.parent === undefined || boneOf.get(p.bone)?.part !== p.parent)) e(`part ${p.id}: bone ${p.bone} must be a bone of its parent part`);
    const s = p.skin;
    if (s === undefined) continue;
    for (const b of s.bones) if (boneOf.get(b)?.part !== p.id) e(`part ${p.id}: skin bone ${b} is not a bone of this part`);
    const nv = s.grid[0] * s.grid[1];
    const nb = s.bones.length;
    if (s.w.length !== nv * nb) e(`part ${p.id}: skin.w has ${String(s.w.length)} weights, expected ${String(nv * nb)} (grid ${String(s.grid[0])}x${String(s.grid[1])} x ${String(nb)} bones)`);
    else
      for (let v = 0; v < nv; v++) {
        const ws = s.w.slice(v * nb, v * nb + nb);
        const sum = ws.reduce((x, y) => x + y, 0);
        const nz = ws.filter((x) => x > 0).length;
        if (sum !== 256 || nz > 3) {
          e(`part ${p.id}: skin vertex ${String(v)} weights sum to ${String(sum)} with ${String(nz)} bones (expected 256 with at most 3)`);
          break;
        }
      }
    if (s.dw !== undefined && s.dw.length !== nv) e(`part ${p.id}: skin.dw has ${String(s.dw.length)} values, expected ${String(nv)}`);
  }
  for (const [a, act] of Object.entries(actions)) {
    for (const [pid, c] of Object.entries(act.curves ?? {})) {
      if (!ids.has(pid) && !boneOf.has(pid)) e(`actions.${a}.curves: unknown part ${pid}`);
      const light = LIGHT_CHANNELS.filter((ch) => c[ch] !== undefined);
      if (light.length > 0 && (!smooth || !ids.has(pid))) e(`actions.${a}.curves.${pid}: ${light.join(', ')} need sample "ss2" and a part`);
    }
    for (const pid of Object.keys(act.deform ?? {})) {
      if (!smooth) e(`actions.${a}.deform: deformers need sample "ss2"`);
      else if (!ids.has(pid)) e(`actions.${a}.deform: unknown part ${pid}`);
    }
  }
  for (const [d, offs] of Object.entries(dirOffsets ?? {}))
    for (const pid of Object.keys(offs)) if (!ids.has(pid) && !boneOf.has(pid)) e(`dirOffsets.${d}: unknown part or bone ${pid}`);
  return errors.length === n0
    ? { name, chain, dirs: dirs ?? [], parts, actions, frame: F, smooth, res: res ?? 1, box, dirOffsets: dirOffsets ?? {}, bones }
    : undefined;
}

interface Placed {
  readonly part: RigPart;
  readonly img: Image;
  readonly pivot: Pt;
  readonly at: Pt;
  readonly z: number;
  readonly hide: boolean;
}

/** Composites the parts of one frame: world = parent world * T(at + d) * R(rot) * S(sx, sy); inverse-mapped nearest neighbour. */
function renderFrame(placed: readonly Placed[], curves: RigAction['curves'], f: number, FRAME: number): Image {
  const data = new Uint8Array(FRAME * FRAME * 4);
  const world = new Map<string, Mat>();
  const byId = new Map(placed.map((p) => [p.part.id, p]));
  const worldOf = (p: Placed): Mat => {
    const memo = world.get(p.part.id);
    if (memo !== undefined) return memo;
    const c = curves?.[p.part.id];
    const ch = (k: Channel, def: number): number => c?.[k]?.[f] ?? def;
    const [rot, sx, sy] = [ch('rot', 0), ch('sx', 100), ch('sy', 100)];
    const local: Mat = [
      Math.round((cosQ16(rot) * sx) / 100),
      Math.round((-sinQ16(rot) * sy) / 100),
      (p.at[0] + ch('dx', 0)) * Q,
      Math.round((sinQ16(rot) * sx) / 100),
      Math.round((cosQ16(rot) * sy) / 100),
      (p.at[1] + ch('dy', 0)) * Q,
    ];
    const parent = p.part.parent === undefined ? undefined : byId.get(p.part.parent);
    const w = parent === undefined ? local : mul(worldOf(parent), local);
    world.set(p.part.id, w);
    return w;
  };
  const order = placed.map((p, i) => ({ p, i })).sort((x, y) => x.p.z - y.p.z || x.i - y.i);
  for (const { p } of order) {
    const [a, b, tx, c, d, ty] = worldOf(p);
    if (p.hide) continue;
    const det = a * d - b * c;
    if (det === 0) continue;
    const { width: iw, height: ih, data: src } = p.img;
    for (let Y = 0; Y < FRAME; Y++)
      for (let X = 0; X < FRAME; X++) {
        const vx = X * Q + Q / 2 - tx;
        const vy = Y * Q + Q / 2 - ty;
        const u = Math.floor((d * vx - b * vy) / det) + p.pivot[0];
        const v = Math.floor((a * vy - c * vx) / det) + p.pivot[1];
        if (u < 0 || v < 0 || u >= iw || v >= ih) continue;
        const s = (v * iw + u) * 4;
        const sa = src[s + 3] ?? 0;
        if (sa === 0) continue;
        const o = (Y * FRAME + X) * 4;
        if (sa === 255) {
          data.set(src.subarray(s, s + 4), o);
          continue;
        }
        const da = data[o + 3] ?? 0;
        const oa = sa * 255 + da * (255 - sa);
        for (let k = 0; k < 3; k++) data[o + k] = Math.round(((src[s + k] ?? 0) * sa * 255 + (data[o + k] ?? 0) * da * (255 - sa)) / oa);
        data[o + 3] = Math.round(oa / 255);
      }
  }
  return { width: FRAME, height: FRAME, data };
}

// ---- smooth (ss2) render ----

/** Premultiplied integer RGBA of a part image: rgb = c * a, alpha = a * 255 (all 0..65025). */
const PM_FULL = 65025;
const premul = new WeakMap<Image, Int32Array>();
function premultiplied(img: Image): Int32Array {
  let pm = premul.get(img);
  if (pm !== undefined) return pm;
  pm = new Int32Array(img.width * img.height * 4);
  for (let i = 0; i < pm.length; i += 4) {
    const a = img.data[i + 3] ?? 0;
    for (let k = 0; k < 3; k++) pm[i + k] = (img.data[i + k] ?? 0) * a;
    pm[i + 3] = a * 255;
  }
  premul.set(img, pm);
  return pm;
}

/** 1 for each grid cell whose source (plus a 1 px margin) has any alpha; cached per image and step. */
const cellCache = new WeakMap<Image, Map<number, Uint8Array>>();
function liveCells(img: Image, step: number, nx: number, ny: number): Uint8Array {
  const byStep = cellCache.get(img) ?? new Map<number, Uint8Array>();
  cellCache.set(img, byStep);
  const key = step * 4096 + nx * 64 + ny;
  const memo = byStep.get(key);
  if (memo !== undefined) return memo;
  const live = new Uint8Array(nx * ny);
  for (let j = 0; j < ny - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const x0 = Math.max(0, i * step - 1);
      const y0 = Math.max(0, j * step - 1);
      const x1 = Math.min(img.width, (i + 1) * step + 1);
      const y1 = Math.min(img.height, (j + 1) * step + 1);
      let any = 0;
      for (let y = y0; y < y1 && any === 0; y++) for (let x = x0; x < x1; x++) if ((img.data[(y * img.width + x) * 4 + 3] ?? 0) > 0) any = 1;
      live[j * nx + i] = any;
    }
  byStep.set(key, live);
  return live;
}

/** Integer hash to [-Q, Q). */
function hashQ(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1) ^ Math.imul(z, 0x9e3779b1) ^ seed;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return ((h >>> 0) % (2 * Q)) - Q;
}
/** Bilinear integer value noise at image px (x, y), in Q16 (-Q..Q). */
function noiseQ(x: number, y: number, z: number, n: Noise): number {
  const c = n.cellPx;
  const gx = Math.floor(x / c);
  const gy = Math.floor(y / c);
  const rx = x - gx * c;
  const ry = y - gy * c;
  const h = (i: number, j: number): number => hashQ(gx + i, gy + j, z, n.seed);
  return Math.floor((h(0, 0) * (c - rx) * (c - ry) + h(1, 0) * rx * (c - ry) + h(0, 1) * (c - rx) * ry + h(1, 1) * rx * ry) / (c * c));
}
/** The deformer offset (Q16 image px) at vertex (x, y) of frame f. */
function deformAt(d: Deform | undefined, x: number, y: number, f: number): [number, number] {
  let ox = 0;
  let oy = 0;
  const w = d?.wave;
  if (w !== undefined) {
    const along = w.axis === 'x' ? y : x;
    const off = w.ampPx * sinQ16(Math.floor((360 * along) / w.wavelengthPx) + (w.phase ?? 0) + w.phasePerFrame * f);
    if (w.axis === 'x') ox += off;
    else oy += off;
  }
  const n = d?.noise;
  if (n !== undefined) {
    ox += Math.floor((n.ampPx * noiseQ(x, y, f * 2, n)) / 1);
    oy += Math.floor((n.ampPx * noiseQ(x, y, f * 2 + 1, n)) / 1);
  }
  return [ox, oy];
}

interface Pose {
  readonly rot: number;
  readonly dx: number;
  readonly dy: number;
  /** Scale in 1/10000 (curve percent times offset percent). */
  readonly sx: number;
  readonly sy: number;
}
/** T(x + dx, y + dy) * R(rot) * S(sx, sy); x, y in art px. */
const trs = (p: Pose, x: number, y: number): Mat => [
  Math.round((cosQ16(p.rot) * p.sx) / 10000),
  Math.round((-sinQ16(p.rot) * p.sy) / 10000),
  (x + p.dx) * Q,
  Math.round((sinQ16(p.rot) * p.sx) / 10000),
  Math.round((cosQ16(p.rot) * p.sy) / 10000),
  (y + p.dy) * Q,
];
const IDENT: Mat = [Q, 0, 0, 0, Q, 0];
/** M applied to a Q16 point. */
const xf = (M: Mat, x: number, y: number): [number, number] => [rq(M[0] * x + M[1] * y) + M[2], rq(M[3] * x + M[4] * y) + M[5]];

/**
 * The smooth render: each part is a mesh (its skin grid, or a 32 px grid) whose vertices go through the bones, deformers and
 * the part tree into a 2x supersampled premultiplied buffer; triangles are rasterised with integer edge functions (top-left
 * fill rule) and sample the part bilinearly; the buffer is box-filtered 2x2 into the frame, and colour bleeds 2 px into the
 * transparent border so linear filtering at runtime shows no dark halo. Integer arithmetic throughout (values below 2^53).
 */
function renderSmooth(r: Resolved, placed: readonly Placed[], act: RigAction, f: number, dir: Dir): Image {
  const F = r.frame;
  const S = F * 2;
  const buf = new Int32Array(S * S * 4);
  const offs = r.dirOffsets[dir];
  const poseOf = (id: string): Pose => {
    const c = act.curves?.[id];
    const o = offs?.[id];
    const ch = (k: Channel, def: number): number => c?.[k]?.[f] ?? def;
    return {
      rot: ch('rot', 0) + (o?.rot ?? 0),
      dx: ch('dx', 0) + (o?.dx ?? 0),
      dy: ch('dy', 0) + (o?.dy ?? 0),
      sx: ch('sx', 100) * (o?.sx ?? 100),
      sy: ch('sy', 100) * (o?.sy ?? 100),
    };
  };
  const byId = new Map(placed.map((p) => [p.part.id, p]));
  const boneById = new Map(r.bones.map((b) => [b.id, b]));
  const bones = new Map<string, Mat>();
  const boneMat = (id: string): Mat => {
    const memo = bones.get(id);
    if (memo !== undefined) return memo;
    const b = boneById.get(id);
    const owner = b === undefined ? undefined : byId.get(b.part);
    if (b === undefined || owner === undefined) return IDENT;
    const hx = b.head[0] - owner.pivot[0];
    const hy = b.head[1] - owner.pivot[1];
    const local = mul(trs(poseOf(id), hx, hy), [Q, 0, -hx * Q, 0, Q, -hy * Q]);
    const m = b.parent === undefined ? local : mul(boneMat(b.parent), local);
    bones.set(id, m);
    return m;
  };
  const world = new Map<string, Mat>();
  const worldOf = (p: Placed): Mat => {
    const memo = world.get(p.part.id);
    if (memo !== undefined) return memo;
    const parent = p.part.parent === undefined ? undefined : byId.get(p.part.parent);
    let base = parent === undefined ? IDENT : worldOf(parent);
    if (p.part.bone !== undefined) base = mul(base, boneMat(p.part.bone));
    const w = mul(base, trs(poseOf(p.part.id), p.at[0], p.at[1]));
    world.set(p.part.id, w);
    return w;
  };
  const toSS = 128 * r.res;
  const order = placed.map((p, i) => ({ p, i })).sort((x, y) => x.p.z - y.p.z || x.i - y.i);
  for (const { p } of order) {
    const W = worldOf(p);
    if (p.hide) continue;
    const c = act.curves?.[p.part.id];
    const alpha = c?.alpha?.[f] ?? 256;
    const bright = c?.bright?.[f] ?? 256;
    if (alpha === 0) continue;
    const { width: iw, height: ih } = p.img;
    const skin = p.part.skin;
    const step = skin?.step ?? 32;
    const nx = skin?.grid[0] ?? Math.ceil(iw / step) + 1;
    const ny = skin?.grid[1] ?? Math.ceil(ih / step) + 1;
    if ((nx - 1) * step < iw || (ny - 1) * step < ih) throw new Error(`part ${p.part.id}: skin grid ${String(nx)}x${String(ny)} step ${String(step)} does not cover the ${String(iw)}x${String(ih)} image`);
    const deform = act.deform?.[p.part.id];
    const skinMats = skin?.bones.map(boneMat) ?? [];
    const nb = skinMats.length;
    // Vertex positions in supersampled Q8.
    const vx = new Float64Array(nx * ny);
    const vy = new Float64Array(nx * ny);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const v = j * nx + i;
        const [ox, oy] = deformAt(deform, i * step, j * step, f);
        const dw = skin?.dw?.[v] ?? 256;
        let x = (i * step - p.pivot[0]) * Q + Math.round((ox * dw) / 256);
        let y = (j * step - p.pivot[1]) * Q + Math.round((oy * dw) / 256);
        if (nb > 0 && skin !== undefined) {
          let sx = 0;
          let sy = 0;
          for (let b = 0; b < nb; b++) {
            const w = skin.w[v * nb + b] ?? 0;
            if (w === 0) continue;
            const [bx, by] = xf(skinMats[b] ?? IDENT, x, y);
            sx += w * bx;
            sy += w * by;
          }
          x = Math.round(sx / 256);
          y = Math.round(sy / 256);
        }
        const [px, py] = xf(W, x, y);
        vx[v] = Math.round(px / toSS);
        vy[v] = Math.round(py / toSS);
      }
    const live = liveCells(p.img, step, nx, ny);
    const src = premultiplied(p.img);
    const tri = (a: number, b: number, d: number): void => rasterTri(buf, S, src, iw, ih, vx, vy, nx, step, a, b, d, alpha, bright, p.part.blend === 'add');
    for (let j = 0; j < ny - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        if (live[j * nx + i] === 0) continue;
        const a = j * nx + i;
        tri(a, a + 1, a + nx + 1);
        tri(a, a + nx + 1, a + nx);
      }
  }
  // 2x2 box filter to the frame, un-premultiplied.
  const data = new Uint8Array(F * F * 4);
  for (let Y = 0; Y < F; Y++)
    for (let X = 0; X < F; X++) {
      const o = (Y * F + X) * 4;
      const s0 = (2 * Y * S + 2 * X) * 4;
      const s1 = s0 + S * 4;
      const sum = (k: number): number => (buf[s0 + k] ?? 0) + (buf[s0 + 4 + k] ?? 0) + (buf[s1 + k] ?? 0) + (buf[s1 + 4 + k] ?? 0);
      const A = sum(3);
      const a8 = Math.round(A / 1020);
      if (a8 === 0) continue;
      for (let k = 0; k < 3; k++) data[o + k] = Math.min(255, Math.round((sum(k) * 255) / A));
      data[o + 3] = a8;
    }
  bleed(data, F, 2);
  return { width: F, height: F, data };
}

/** Rasterises one mesh triangle (vertex indices into the grid) into the supersampled premultiplied buffer. */
function rasterTri(
  buf: Int32Array,
  S: number,
  src: Int32Array,
  iw: number,
  ih: number,
  vx: Float64Array,
  vy: Float64Array,
  nx: number,
  step: number,
  i0: number,
  i1: number,
  i2: number,
  alpha: number,
  bright: number,
  add: boolean,
): void {
  let [a, b, c] = [i0, i1, i2];
  const E = (p: number, q: number, x: number, y: number): number => ((vx[q] ?? 0) - (vx[p] ?? 0)) * (y - (vy[p] ?? 0)) - ((vy[q] ?? 0) - (vy[p] ?? 0)) * (x - (vx[p] ?? 0));
  let area = E(a, b, vx[c] ?? 0, vy[c] ?? 0);
  if (area === 0) return;
  if (area < 0) {
    [b, c] = [c, b];
    area = -area;
  }
  // Top-left rule: an edge owns its w == 0 pixels if it runs down (dy > 0) or flat to the left.
  const owns = (p: number, q: number): boolean => {
    const dy = (vy[q] ?? 0) - (vy[p] ?? 0);
    return dy > 0 || (dy === 0 && (vx[q] ?? 0) - (vx[p] ?? 0) < 0);
  };
  const [o0, o1, o2] = [owns(b, c), owns(c, a), owns(a, b)];
  const uv = (v: number): [number, number] => [(v % nx) * step * 256, Math.floor(v / nx) * step * 256];
  const [ua, va] = uv(a);
  const [ub, vb] = uv(b);
  const [uc, vc] = uv(c);
  const xs = [vx[a] ?? 0, vx[b] ?? 0, vx[c] ?? 0];
  const ys = [vy[a] ?? 0, vy[b] ?? 0, vy[c] ?? 0];
  const X0 = Math.max(0, Math.floor((Math.min(...xs) - 128) / 256));
  const X1 = Math.min(S - 1, Math.ceil((Math.max(...xs) - 128) / 256));
  const Y0 = Math.max(0, Math.floor((Math.min(...ys) - 128) / 256));
  const Y1 = Math.min(S - 1, Math.ceil((Math.max(...ys) - 128) / 256));
  for (let Y = Y0; Y <= Y1; Y++) {
    const py = Y * 256 + 128;
    for (let X = X0; X <= X1; X++) {
      const px = X * 256 + 128;
      const w0 = E(b, c, px, py);
      const w1 = E(c, a, px, py);
      const w2 = E(a, b, px, py);
      if (w0 < 0 || w1 < 0 || w2 < 0 || (w0 === 0 && !o0) || (w1 === 0 && !o1) || (w2 === 0 && !o2)) continue;
      // Source position in Q8 image px (relative to vertex a, so the products stay small), then to pixel-centre space.
      const u = ua + Math.floor((w1 * (ub - ua) + w2 * (uc - ua)) / area) - 128;
      const v = va + Math.floor((w1 * (vb - va) + w2 * (vc - va)) / area) - 128;
      const tx = u >> 8;
      const ty = v >> 8;
      const fx = u & 255;
      const fy = v & 255;
      let r0 = 0;
      let g0 = 0;
      let b0 = 0;
      let a0 = 0;
      for (let k = 0; k < 4; k++) {
        const sx = tx + (k & 1);
        const sy = ty + (k >> 1);
        if (sx < 0 || sy < 0 || sx >= iw || sy >= ih) continue;
        const w = ((k & 1) === 0 ? 256 - fx : fx) * ((k >> 1) === 0 ? 256 - fy : fy);
        if (w === 0) continue;
        const s = (sy * iw + sx) * 4;
        r0 += w * (src[s] ?? 0);
        g0 += w * (src[s + 1] ?? 0);
        b0 += w * (src[s + 2] ?? 0);
        a0 += w * (src[s + 3] ?? 0);
      }
      let sa = Math.floor((a0 + 32768) / 65536);
      if (sa === 0) continue;
      let sr = Math.floor((r0 + 32768) / 65536);
      let sg = Math.floor((g0 + 32768) / 65536);
      let sb = Math.floor((b0 + 32768) / 65536);
      if (bright !== 256) {
        sr = Math.min(PM_FULL, Math.floor((sr * bright) / 256));
        sg = Math.min(PM_FULL, Math.floor((sg * bright) / 256));
        sb = Math.min(PM_FULL, Math.floor((sb * bright) / 256));
      }
      if (alpha !== 256) {
        sr = Math.floor((sr * alpha) / 256);
        sg = Math.floor((sg * alpha) / 256);
        sb = Math.floor((sb * alpha) / 256);
        sa = Math.floor((sa * alpha) / 256);
      }
      const o = (Y * S + X) * 4;
      const da = buf[o + 3] ?? 0;
      if (add) {
        buf[o] = Math.min(PM_FULL, (buf[o] ?? 0) + sr);
        buf[o + 1] = Math.min(PM_FULL, (buf[o + 1] ?? 0) + sg);
        buf[o + 2] = Math.min(PM_FULL, (buf[o + 2] ?? 0) + sb);
        buf[o + 3] = da + Math.round((sa * (PM_FULL - da)) / PM_FULL);
      } else {
        const keep = PM_FULL - sa;
        buf[o] = sr + Math.round(((buf[o] ?? 0) * keep) / PM_FULL);
        buf[o + 1] = sg + Math.round(((buf[o + 1] ?? 0) * keep) / PM_FULL);
        buf[o + 2] = sb + Math.round(((buf[o + 2] ?? 0) * keep) / PM_FULL);
        buf[o + 3] = sa + Math.round((da * keep) / PM_FULL);
      }
    }
  }
}

/** Copies the mean colour of opaque neighbours into transparent pixels, `rings` times (alpha stays 0). */
function bleed(data: Uint8Array, F: number, rings: number): void {
  for (let ring = 0; ring < rings; ring++) {
    const filled: [number, number, number, number][] = [];
    for (let Y = 0; Y < F; Y++)
      for (let X = 0; X < F; X++) {
        const o = (Y * F + X) * 4;
        if ((data[o + 3] ?? 0) > 0 || (data[o] ?? 0) + (data[o + 1] ?? 0) + (data[o + 2] ?? 0) > 0) continue;
        let n = 0;
        let r = 0;
        let g = 0;
        let b = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const x = X + dx;
            const y = Y + dy;
            if ((dx === 0 && dy === 0) || x < 0 || y < 0 || x >= F || y >= F) continue;
            const q = (y * F + x) * 4;
            const has = ring === 0 ? (data[q + 3] ?? 0) > 0 : (data[q + 3] ?? 0) > 0 || (data[q] ?? 0) + (data[q + 1] ?? 0) + (data[q + 2] ?? 0) > 0;
            if (!has) continue;
            n++;
            r += data[q] ?? 0;
            g += data[q + 1] ?? 0;
            b += data[q + 2] ?? 0;
          }
        if (n > 0) filled.push([o, Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
      }
    for (const [o, r, g, b] of filled) {
      data[o] = r;
      data[o + 1] = g;
      data[o + 2] = b;
    }
  }
}

export interface BakeResult {
  /** Bytes by path relative to the sheets source dir, e.g. `fiara/idle/E/00.png`, `fiara/license.txt`. */
  readonly outputs: ReadonlyMap<string, Uint8Array>;
  /** bake.lock.json text, or undefined when there is no concrete rig. */
  readonly lock: string | undefined;
  readonly rigs: readonly string[];
  readonly errors: readonly string[];
}

const FILE_RE = /^(_?[A-Za-z0-9]+)\/(rig\.json|license\.txt|prep\.lock\.json|parts\/[A-Za-z0-9_-]+\.png|keys\/([A-Za-z]+)\/([A-Z]+)\/(\d{2})\.png)$/;
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
const byPath = <T>([x]: [string, T], [y]: [string, T]): number => (x < y ? -1 : x > y ? 1 : 0);

/** Bakes every concrete rig (names starting with `_` are bases only). Pure: files in, bytes out. */
export function bakeRigs(files: SourceFiles): BakeResult {
  const errors: string[] = [];
  const byRig = new Map<string, Map<string, Uint8Array>>();
  for (const [path, bytes] of [...files].sort(byPath)) {
    if (path === LOCK_NAME || path.endsWith('.gitkeep')) continue;
    const m = FILE_RE.exec(path);
    if (!m) {
      errors.push(`${path}: unexpected file (expected <rig>/rig.json, license.txt, prep.lock.json, parts/<name>.png or keys/<action>/<dir>/<NN>.png)`);
      continue;
    }
    const rig = m[1] as string;
    const own = byRig.get(rig) ?? new Map<string, Uint8Array>();
    own.set(path.slice(rig.length + 1), bytes);
    byRig.set(rig, own);
  }
  const raws = new Map<string, RigJson | undefined>();
  for (const [rig, own] of byRig) {
    const json = own.get('rig.json');
    if (json === undefined) errors.push(`${rig}: no rig.json`);
    else raws.set(rig, parseRig(`${rig}/rig.json`, new TextDecoder().decode(json), errors));
  }
  const characters = new Set(sheetCharacters());
  const outputs = new Map<string, Uint8Array>();
  const lock: Record<string, { inputs: Record<string, string>; outputs: Record<string, string> }> = {};
  const decoded = new Map<string, Image>();
  const decode = (label: string, bytes: Uint8Array, size?: number): Image | undefined => {
    try {
      const img = decoded.get(label) ?? decodePng(bytes);
      decoded.set(label, img);
      if (size !== undefined && (img.width !== size || img.height !== size))
        return void errors.push(`${label}: ${String(img.width)}x${String(img.height)}, expected ${String(size)}x${String(size)}`);
      return img;
    } catch (e) {
      return void errors.push(`${label}: ${(e as Error).message}`);
    }
  };
  const rigs = [...raws.keys()].filter((n) => !n.startsWith('_')).sort();
  for (const name of rigs) {
    if (!characters.has(name)) {
      errors.push(`${name}: unknown character (a rig is named after its sheet sprite; prefix bases with _)`);
      continue;
    }
    const r = resolveRig(name, raws, errors);
    if (r === undefined) continue;
    const n0 = errors.length;
    const find = (rel: string): [string, Uint8Array] | undefined => {
      for (const n of r.chain) {
        const b = byRig.get(n)?.get(rel);
        if (b !== undefined) return [`${n}/${rel}`, b];
      }
      return undefined;
    };
    const license = find('license.txt');
    if (license === undefined) errors.push(`${name}: no license.txt in the rig or its bases (every new asset needs a licence note)`);
    const own = byRig.get(name) ?? new Map<string, Uint8Array>();
    const keys = new Map<string, Image>();
    for (const [rel, bytes] of own) {
      const k = /^keys\/(.+)\/(\d{2})\.png$/.exec(rel);
      if (!k) continue;
      const [action, dir] = (k[1] as string).split('/') as [Action, Dir];
      const act = r.actions[action];
      if (act === undefined || !r.dirs.includes(dir) || Number(k[2]) >= act.frames) errors.push(`${name}/${rel}: key for a frame the rig does not bake`);
      else {
        const img = decode(`${name}/${rel}`, bytes, r.frame);
        if (img) keys.set(`${action}/${dir}/${k[2] as string}`, img);
      }
    }
    const out = new Map<string, Uint8Array>();
    for (const dir of r.dirs) {
      const placed: Placed[] = [];
      for (const part of r.parts) {
        const v = { ...part, ...part.views?.[dir] };
        const file = find(`parts/${v.png as string}`);
        if (file === undefined) {
          errors.push(`${name}: part ${part.id}${part.views?.[dir] ? ` (${dir})` : ''}: parts/${v.png as string} not found in ${r.chain.join(', ')}`);
          continue;
        }
        const img = decode(file[0], file[1]);
        if (img) placed.push({ part, img, pivot: v.pivot as Pt, at: v.at as Pt, z: v.z ?? 0, hide: v.hide === true });
      }
      if (errors.length > n0) break;
      for (const [action, act] of Object.entries(r.actions) as [Action, RigAction][])
        for (let f = 0; f < act.frames; f++) {
          const nn = String(f).padStart(2, '0');
          let img = keys.get(`${action}/${dir}/${nn}`);
          if (img === undefined) {
            try {
              img = r.smooth ? renderSmooth(r, placed, act, f, dir) : renderFrame(placed, act.curves, f, r.frame);
            } catch (err) {
              errors.push(`${name}: ${(err as Error).message}`);
              break;
            }
          }
          out.set(`${name}/${action}/${dir}/${nn}.png`, encodePng(img));
        }
      if (errors.length > n0) break;
    }
    if (errors.length > n0 || license === undefined) continue;
    out.set(`${name}/license.txt`, license[1]);
    if (r.box !== undefined) out.set(`${name}/box.json`, new TextEncoder().encode(`${JSON.stringify(r.box)}\n`));
    const sorted = [...out].sort(byPath);
    for (const [p, b] of sorted) outputs.set(p, b);
    const inputs = r.chain.flatMap((n) => [...(byRig.get(n) ?? [])].map(([rel, b]): [string, string] => [`${n}/${rel}`, sha256(b)])).sort(byPath);
    lock[name] = { inputs: Object.fromEntries(inputs), outputs: Object.fromEntries(sorted.map(([p, b]) => [p, sha256(b)])) };
  }
  const text = rigs.length === 0 ? undefined : `${JSON.stringify({ generatedBy: 'pnpm assets:bake', version: BAKE_VERSION, rigs: lock }, null, 2)}\n`;
  return { outputs, lock: text, rigs, errors };
}

const lockedOutputs = (lock: string | undefined): string[] => {
  try {
    const j = JSON.parse(lock ?? '{}') as { rigs?: Record<string, { outputs?: Record<string, string> }> };
    return Object.values(j.rigs ?? {}).flatMap((r) => Object.keys(r.outputs ?? {}));
  } catch {
    return [];
  }
};

/** What `--check` reports: LOCK_NAME if the lock differs, outputs that are missing or differ, and orphans of the previous lock. */
export function staleFiles(res: BakeResult, prevLock: string | undefined, readOutput: (rel: string) => Uint8Array | undefined): string[] {
  const stale: string[] = [];
  if (prevLock !== res.lock) stale.push(LOCK_NAME);
  for (const [rel, bytes] of res.outputs) {
    const cur = readOutput(rel);
    if (cur === undefined || !Buffer.from(cur).equals(bytes)) stale.push(rel);
  }
  for (const rel of lockedOutputs(prevLock)) if (!res.outputs.has(rel) && readOutput(rel) !== undefined) stale.push(rel);
  return stale;
}

export function runBake(opts: { readonly check: boolean; readonly rigsDir?: string; readonly sheetsDir?: string }): { code: number; message: string } {
  const rigsDir = opts.rigsDir ?? resolve(root, RIGS_DIR);
  const sheetsDir = opts.sheetsDir ?? resolve(root, SOURCE_DIR);
  const lockPath = join(rigsDir, LOCK_NAME);
  const prevLock = existsSync(lockPath) ? readFileSync(lockPath, 'utf8') : undefined;
  const res = bakeRigs(readSources(rigsDir));
  if (res.errors.length > 0) return { code: 1, message: res.errors.join('\n') };
  const read = (rel: string): Uint8Array | undefined => (existsSync(join(sheetsDir, rel)) ? new Uint8Array(readFileSync(join(sheetsDir, rel))) : undefined);
  const stale = staleFiles(res, prevLock, read);
  const full = (rel: string): string => (rel === LOCK_NAME ? lockPath : join(sheetsDir, rel));
  if (res.rigs.length === 0 && stale.length === 0)
    return { code: 0, message: `assets:bake: no rigs under ${RIGS_DIR}, nothing to bake${opts.check ? ' (check ok)' : ''}` };
  const summary = `${String(res.rigs.length)} rig(s), ${String(res.outputs.size)} file(s)`;
  if (opts.check)
    return stale.length === 0
      ? { code: 0, message: `assets:bake: ${summary} up to date (check ok)` }
      : { code: 1, message: `stale baked frames (run pnpm assets:bake, then pnpm assets:sheets):\n${stale.map(full).join('\n')}` };
  for (const rel of stale) {
    const p = full(rel);
    const bytes = rel === LOCK_NAME ? (res.lock === undefined ? undefined : new TextEncoder().encode(res.lock)) : res.outputs.get(rel);
    if (bytes === undefined) rmSync(p, { force: true });
    else {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, bytes);
    }
  }
  return { code: 0, message: `assets:bake: ${summary}, ${String(stale.length)} written or removed; now run pnpm assets:sheets` };
}

if (import.meta.main) {
  const r = runBake({ check: process.argv.includes('--check') });
  (r.code === 0 ? console.log : console.error)(r.message);
  process.exit(r.code);
}
