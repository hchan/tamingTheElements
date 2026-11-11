// Rig baker (FUN-DESIGN section 2.16 "Rig and bake", ADR-0019). Bakes cutout rigs (parts with pivots in a parent tree, per-action
// integer keyframe curves) into the per-frame PNGs that pack-sheets.ts packs: imgWorkArea/sheets/<sprite>/<action>/<dir>/<NN>.png.
// Offline and deterministic: integer degrees through a Q14 sine table, Q16 fixed-point affine matrices, nearest-neighbour sampling,
// integer alpha compositing and png-lite output, so the bytes depend only on the inputs. W, SW and NW are never baked: resolveRow
// mirrors them from E, SE and NE at runtime.
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
export interface RigPart extends PartView {
  readonly id: string;
  readonly parent?: string;
  /** Per-direction overrides (other art, pivot, position, order, hidden). */
  readonly views?: Readonly<Partial<Record<Dir, PartView>>>;
}
export const CHANNELS = ['rot', 'dx', 'dy', 'sx', 'sy'] as const;
export type Channel = (typeof CHANNELS)[number];
export interface RigAction {
  readonly frames: number;
  /** part id -> channel -> one integer per frame: rot degrees clockwise, dx/dy pixels, sx/sy percent (default 100). */
  readonly curves?: Readonly<Record<string, Readonly<Partial<Record<Channel, readonly number[]>>>>>;
}
export interface RigJson {
  readonly extends?: string;
  readonly dirs?: readonly Dir[];
  readonly parts?: readonly RigPart[];
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
const RANGE: Record<Channel, number> = { rot: 360, dx: FRAME, dy: FRAME, sx: 400, sy: 400 };
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
  const action = (a: string): Field => {
    const n = framesIn(a as Action);
    const ints = (ch: Channel): Field =>
      check((v) => Array.isArray(v) && v.length === n && v.every((x) => isInt(x) && Math.abs(x) <= RANGE[ch]), `expected ${String(n)} integers in -${String(RANGE[ch])}..${String(RANGE[ch])}`);
    const curve = obj(Object.fromEntries(CHANNELS.map((ch) => [ch, ints(ch)])));
    return obj({ frames: check((v) => v === n, `the sheet spec has ${String(n)} frames for ${a}`), curves: map(() => undefined, () => curve, 'part id') }, ['frames']);
  };
  obj({
    extends: check((v) => typeof v === 'string' && ID_RE.test(v), 'expected a rig name'),
    dirs: list((v, path) => {
      const e = typeof v === 'string' ? dirError(v) : 'expected a direction name';
      if (e !== undefined) bad(path, e);
    }, true),
    parts: list(obj({ id, parent: check((v) => typeof v === 'string', 'expected a part id'), ...view, views: map(dirError, () => obj(view), 'direction') }, ['id']), false),
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
}

/** Applies `extends`: dirs from the nearest rig that sets them, parts merged by id (fields and views), actions replaced by name. */
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
  const parts: RigPart[] = [];
  const actions: Partial<Record<Action, RigAction>> = {};
  for (const n of [...chain].reverse()) {
    const r = raws.get(n) as RigJson;
    dirs = r.dirs ?? dirs;
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
  for (const [a, act] of Object.entries(actions))
    for (const pid of Object.keys(act.curves ?? {})) if (!ids.has(pid)) e(`actions.${a}.curves: unknown part ${pid}`);
  return errors.length === n0 ? { name, chain, dirs: dirs ?? [], parts, actions } : undefined;
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
function renderFrame(placed: readonly Placed[], curves: RigAction['curves'], f: number): Image {
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

export interface BakeResult {
  /** Bytes by path relative to the sheets source dir, e.g. `fiara/idle/E/00.png`, `fiara/license.txt`. */
  readonly outputs: ReadonlyMap<string, Uint8Array>;
  /** bake.lock.json text, or undefined when there is no concrete rig. */
  readonly lock: string | undefined;
  readonly rigs: readonly string[];
  readonly errors: readonly string[];
}

const FILE_RE = /^(_?[A-Za-z0-9]+)\/(rig\.json|license\.txt|parts\/[A-Za-z0-9_-]+\.png|keys\/([A-Za-z]+)\/([A-Z]+)\/(\d{2})\.png)$/;
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
      errors.push(`${path}: unexpected file (expected <rig>/rig.json, license.txt, parts/<name>.png or keys/<action>/<dir>/<NN>.png)`);
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
        const img = decode(`${name}/${rel}`, bytes, FRAME);
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
          const img = keys.get(`${action}/${dir}/${nn}`) ?? renderFrame(placed, act.curves, f);
          out.set(`${name}/${action}/${dir}/${nn}.png`, encodePng(img));
        }
    }
    if (errors.length > n0 || license === undefined) continue;
    out.set(`${name}/license.txt`, license[1]);
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
