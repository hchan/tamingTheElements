/**
 * Client for the shared GPU job server on the PC (tools/gpu-queue/ctl.py). One CLI, `pnpm gpu:<verb>`:
 *   gpu:submit <queue.json> [--with <path>]... [--now] [--wait]   upload and queue (--now is admin only)
 *   gpu:status | gpu:list [--all] | gpu:cancel <id> [--force] | gpu:log <id> [--follow] | gpu:wait <id>
 *   gpu:fetch <id> <dest-dir>      results (out/, meta.jsonl, progress.log)
 *   gpu:setup [--rotate]           upload ctl.py + gpu-queue.py, create tokens (the admin token is printed once, never stored)
 *   gpu:admin pause|resume|reorder <id> --before <id>     needs TTE_JOBS_ADMIN_TOKEN (coordinator session only)
 * Add --json for the raw reply. The PC alias comes from TTE_REMOTE or `git config tte.remote` (never printed: output is redacted).
 * Owner id: TTE_JOBS_OWNER, else `<worktree name>-<8 hex of sha256(toplevel)>`. User token: TTE_JOBS_TOKEN or
 * `<config dir>/token` (config dir: TTE_JOBS_CONFIG_DIR, default ~/.config/tte-jobs).
 * Exit codes: 0 ok, 1 job failed, 2 usage, 6 invalid queue, 77 not yours / admin needed, 93 lost, 94 PC unreachable, 97 not set up / disk low.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { redact, remoteAlias } from '../ci/e2e-route';
import { EXIT, sshArgs, type Remote } from '../ci/pc-remote';

const PROTO = 1;
const CTL = 'tte-jobs/bin/ctl.py';
const HERE = dirname(new URL(import.meta.url).pathname);
export const ID_RE = /^[A-Za-z0-9_-]{1,48}$/;
const FINAL = new Set(['done', 'failed', 'cancelled', 'lost']);

export class UsageError extends Error {}
export type Env = Record<string, string | undefined>;
export type Reply = Record<string, unknown> & { proto?: number };
export type Ctx = { remote: Remote; owner: string; token: string; admin?: string; env: Env; cwd: string; out: NodeJS.WritableStream; err: NodeJS.WritableStream };

export function ownerId(env: Env, cwd: string): string {
  const e = env['TTE_JOBS_OWNER']?.trim();
  if (e) {
    if (!ID_RE.test(e)) throw new UsageError('TTE_JOBS_OWNER must match [A-Za-z0-9_-]{1,48}');
    return e;
  }
  const r = spawnSync('git', ['rev-parse', '--show-toplevel'], { cwd, encoding: 'utf8' });
  const top = r.status === 0 ? r.stdout.trim() : resolve(cwd);
  const name = basename(top).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 39) || 'w';
  return `${name}-${createHash('sha256').update(top).digest('hex').slice(0, 8)}`;
}

const configDir = (env: Env): string => env['TTE_JOBS_CONFIG_DIR'] || join(homedir(), '.config', 'tte-jobs');
export function userToken(env: Env): string | undefined {
  const t = env['TTE_JOBS_TOKEN']?.trim();
  if (t) return t;
  try {
    return readFileSync(join(configDir(env), 'token'), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

type Raw = { code: number; stdout: Buffer };
/** One remote call: stdin line 1 is the token(s) (never argv), then an optional byte stream. */
const call = (c: Ctx, args: string[], tokenLine: string, body?: Buffer, stdoutTo?: NodeJS.WritableStream): Promise<Raw> =>
  callRemote(c, ['python3', CTL, ...args], tokenLine, body, stdoutTo);
function callRemote(c: Ctx, cmd: string[], tokenLine: string | undefined, body?: Buffer, stdoutTo?: NodeJS.WritableStream): Promise<Raw> {
  return new Promise((resolveRun) => {
    const p = spawn(c.remote.ssh, sshArgs(c.remote, cmd), { stdio: ['pipe', 'pipe', 'pipe'] });
    const chunks: Buffer[] = [];
    if (stdoutTo) p.stdout.pipe(stdoutTo);
    else p.stdout.on('data', (d: Buffer) => chunks.push(d));
    p.stderr.on('data', (d: Buffer) => c.err.write(redact(d.toString('utf8'))));
    p.on('error', () => resolveRun({ code: EXIT.ssh, stdout: Buffer.alloc(0) }));
    p.on('close', (code) => resolveRun({ code: code ?? EXIT.ssh, stdout: Buffer.concat(chunks) }));
    p.stdin.on('error', () => undefined);
    if (tokenLine !== undefined) p.stdin.write(`${tokenLine}\n`);
    p.stdin.end(body);
  });
}

const tokenLine = (c: Ctx, admin = false): string => (admin && c.admin ? `${c.token} ${c.admin}` : c.token);

export class CtlError extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
  }
}

function parseReply(raw: Raw): Reply {
  const line = raw.stdout.toString('utf8').split('\n').filter((l) => l.startsWith('{')).pop();
  if (!line) throw new CtlError('empty reply from the PC', EXIT.unreachable);
  const r = JSON.parse(line) as Reply;
  if (r.proto !== PROTO) throw new CtlError(`server speaks protocol ${String(r.proto)}, client ${String(PROTO)}: run pnpm gpu:setup`, 97);
  return r;
}

async function ask(c: Ctx, args: string[], opts: { admin?: boolean; body?: Buffer } = {}): Promise<Reply> {
  const raw = await call(c, args, tokenLine(c, opts.admin), opts.body);
  if (raw.code === EXIT.ssh) throw new CtlError('PC unreachable (ssh failed)', EXIT.unreachable);
  if (raw.code !== 0) throw new CtlError(`ctl exited ${String(raw.code)}`, raw.code);
  return parseReply(raw);
}

type Flags = { pos: string[]; json: boolean; now: boolean; wait: boolean; all: boolean; force: boolean; follow: boolean; rotate: boolean; with: string[]; before?: string };
export function parseArgs(argv: string[]): Flags {
  const f: Flags = { pos: [], json: false, now: false, wait: false, all: false, force: false, follow: false, rotate: false, with: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] as string;
    if (a === '--json') f.json = true;
    else if (a === '--now') f.now = true;
    else if (a === '--wait') f.wait = true;
    else if (a === '--all') f.all = true;
    else if (a === '--force') f.force = true;
    else if (a === '--follow') f.follow = true;
    else if (a === '--rotate') f.rotate = true;
    else if (a === '--with' || a === '--before') {
      const v = argv[++i];
      if (!v) throw new UsageError(`${a} needs a value`);
      if (a === '--with') f.with.push(v);
      else f.before = v;
    } else if (a.startsWith('--')) throw new UsageError(`unknown flag ${a}`);
    else f.pos.push(a);
  }
  return f;
}

const need = (f: Flags, n: number, usage: string): void => {
  if (f.pos.length < n) throw new UsageError(`usage: ${usage}`);
};
const needId = (id: string | undefined): string => {
  if (!id || !ID_RE.test(id)) throw new UsageError(`bad job id "${id ?? ''}"`);
  return id;
};

function tarOf(dir: string, names: string[]): Buffer {
  const r = spawnSync('tar', ['-cf', '-', '-C', dir, ...names], { maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new UsageError(`tar failed: ${String(r.stderr)}`);
  return r.stdout;
}

const print = (c: Ctx, f: Flags, r: Reply, human: string): void => void c.out.write(f.json ? `${JSON.stringify(r)}\n` : `${human}\n`);

async function submit(c: Ctx, f: Flags): Promise<number> {
  need(f, 1, 'gpu:submit <queue.json> [--with <path>]... [--now] [--wait]');
  const queue = resolve(c.cwd, f.pos[0] as string);
  if (!existsSync(queue)) throw new UsageError(`no such file ${f.pos[0] as string}`);
  mkdirSync(join(c.cwd, '.scratch'), { recursive: true });
  const stage = mkdtempSync(join(c.cwd, '.scratch', 'gpu-submit-'));
  let body: Buffer;
  try {
    cpSync(queue, join(stage, 'queue.json'));
    const names = ['queue.json'];
    for (const w of f.with) {
      const src = resolve(c.cwd, w);
      const rel = relative(c.cwd, src);
      if (rel.startsWith('..') || resolve(rel) === rel) throw new UsageError(`--with ${w} must be inside the working directory`);
      mkdirSync(dirname(join(stage, rel)), { recursive: true });
      cpSync(src, join(stage, rel), { recursive: true });
      names.push(rel);
    }
    body = tarOf(stage, names);
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
  const r = await ask(c, ['submit', '--owner', c.owner, ...(f.now ? ['--now'] : [])], { body, admin: f.now });
  const id = String(r['id']);
  print(c, f, r, `queued ${id}: place ${String(r['place'])} (${String(r['ahead'])} ahead), start ${String(r['start'])}, ${String(r['eta'] ?? '')}`.trim());
  return f.wait ? await wait(c, { ...f, pos: [id] }) : 0;
}

async function wait(c: Ctx, f: Flags): Promise<number> {
  const id = needId(f.pos[0]);
  const poll = Number(c.env['TTE_JOBS_POLL_MS'] ?? 5000);
  let offset = 0;
  let fails = 0;
  for (;;) {
    let r: Reply;
    try {
      r = await ask(c, ['log', id, '--offset', String(offset)]);
      fails = 0;
    } catch (e) {
      if (!(e instanceof CtlError) || e.code !== EXIT.unreachable || ++fails > 10) throw e;
      await new Promise((res) => setTimeout(res, poll));
      continue;
    }
    const text = String(r['text'] ?? '');
    if (text) c.out.write(text);
    offset = Number(r['offset'] ?? offset);
    const state = String(r['state']);
    if (FINAL.has(state)) {
      const rc = r['rc'];
      c.err.write(`job ${id}: ${state}${typeof rc === 'number' ? ` (rc ${String(rc)})` : ''}\n`);
      return state === 'done' ? 0 : state === 'lost' ? EXIT.lost : state === 'cancelled' ? 130 : 1;
    }
    await new Promise((res) => setTimeout(res, poll));
  }
}

async function fetchJob(c: Ctx, f: Flags): Promise<number> {
  need(f, 2, 'gpu:fetch <id> <dest-dir>');
  const id = needId(f.pos[0]);
  const dest = resolve(c.cwd, f.pos[1] as string);
  mkdirSync(dest, { recursive: true });
  const tar = spawn('tar', ['-xf', '-', '-C', dest], { stdio: ['pipe', 'inherit', 'inherit'] });
  const done = new Promise<number>((res) => tar.on('close', (code) => res(code ?? 1)));
  const raw = await call(c, ['fetch', id], tokenLine(c), undefined, tar.stdin);
  const tcode = await done;
  if (raw.code === EXIT.ssh) throw new CtlError('PC unreachable (ssh failed)', EXIT.unreachable);
  if (raw.code !== 0) throw new CtlError(`ctl exited ${String(raw.code)}`, raw.code);
  if (tcode !== 0) throw new CtlError('could not unpack the results', 1);
  c.err.write(`fetched ${id} into ${f.pos[1] as string}\n`);
  return 0;
}

async function setup(c: Ctx, f: Flags): Promise<number> {
  const root = resolve(HERE, '..', '..');
  const files = [join(HERE, 'ctl.py'), join(root, 'tools', 'assets', 'roster24-art', 'gpu-queue.py')];
  for (const p of files) if (!existsSync(p)) throw new UsageError(`missing ${relative(root, p)}`);
  const step = async (cmd: string[], body?: Buffer): Promise<Raw> => {
    const r = await callRemote(c, cmd, undefined, body);
    if (r.code === EXIT.ssh) throw new CtlError('PC unreachable (ssh failed)', EXIT.unreachable);
    if (r.code !== 0) throw new CtlError(`setup step "${cmd[0] as string}" exited ${String(r.code)}`, 97);
    return r;
  };
  await step(['mkdir', '-p', 'tte-jobs/bin']);
  await step(['tar', '-xf', '-', '-C', 'tte-jobs/bin'], tarOf(dirname(files[0] as string), [basename(files[0] as string)]));
  await step(['tar', '-xf', '-', '-C', 'tte-jobs/bin'], tarOf(dirname(files[1] as string), [basename(files[1] as string)]));
  const init = parseReply(await step(['python3', CTL, 'init', ...(f.rotate ? ['--rotate'] : [])]));
  if (init['initialized']) {
    const dir = configDir(c.env);
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(join(dir, 'token'), `${String(init['token'])}\n`, { mode: 0o600 });
    c.token = String(init['token']);
    c.out.write(`token saved to ${join(dir, 'token')}\nADMIN TOKEN (shown once, not stored; coordinator session only): ${String(init['admin'])}\nexport it as TTE_JOBS_ADMIN_TOKEN\n`);
  } else if (!userToken(c.env)) {
    c.err.write('server already has tokens but this machine has none: set TTE_JOBS_TOKEN, or rerun with --rotate (invalidates everyone else)\n');
    return 77;
  }
  const t = await call(c, ['selftest'], tokenLine(c));
  const rep = t.stdout.toString('utf8').split('\n').filter((l) => l.startsWith('{')).pop();
  c.out.write(`selftest: ${t.code === 0 ? 'ok' : `failed (exit ${String(t.code)}) ${rep ?? ''}`}\n`);
  return t.code === 0 ? 0 : 97;
}

export async function run(argv: string[], env: Env, cwd: string, out: NodeJS.WritableStream, err: NodeJS.WritableStream): Promise<number> {
  const verb = argv[0];
  if (!verb) throw new UsageError('usage: gpu:<submit|status|list|cancel|log|fetch|wait|setup|admin> ...');
  const f = parseArgs(argv.slice(1));
  const alias = remoteAlias(env, cwd);
  if (!alias) throw new UsageError('no PC configured (git config tte.remote <ssh alias> or TTE_REMOTE)');
  const remote: Remote = { alias, distro: env['TTE_REMOTE_DISTRO'] || 'Ubuntu', ssh: env['TTE_SSH'] || 'ssh' };
  const token = userToken(env);
  const c: Ctx = { remote, owner: ownerId(env, cwd), token: token ?? '', admin: env['TTE_JOBS_ADMIN_TOKEN']?.trim() || undefined, env, cwd, out, err };
  if (verb === 'setup') return await setup(c, f);
  if (!token) throw new UsageError('no job token: run pnpm gpu:setup once, or set TTE_JOBS_TOKEN');
  switch (verb) {
    case 'submit':
      return await submit(c, f);
    case 'wait':
      return await wait(c, f);
    case 'fetch':
      return await fetchJob(c, f);
    case 'log': {
      if (f.follow) return await wait(c, f);
      const r = await ask(c, ['log', needId(f.pos[0])]);
      c.out.write(String(r['text'] ?? ''));
      return 0;
    }
    case 'cancel': {
      need(f, 1, 'gpu:cancel <id> [--force]');
      const r = await ask(c, ['cancel', '--owner', c.owner, ...(f.force ? ['--force'] : []), needId(f.pos[0])], { admin: f.force });
      print(c, f, r, `${String(r['id'])}: ${String(r['state'])}`);
      return 0;
    }
    case 'list': {
      const r = await ask(c, ['list', '--owner', c.owner, ...(f.all ? ['--all'] : [])]);
      const rows = (r['jobs'] as Record<string, unknown>[]) ?? [];
      print(c, f, r, rows.length ? rows.map((j) => `${String(j['id'])}  ${String(j['owner'])}  ${String(j['state'])}${j['place'] ? `  place ${String(j['place'])}` : ''}`).join('\n') : 'no jobs');
      return 0;
    }
    case 'status': {
      const r = await ask(c, ['status']);
      const g = r['gpu'] as Record<string, number | null>;
      const lanes = r['lanes'] as Record<string, { running: unknown[]; queued: unknown[] }>;
      const laneText = Object.entries(lanes).map(([k, v]) => `${k} ${String(v.running.length)} running ${String(v.queued.length)} queued`).join(', ');
      print(c, f, r, `gpu ${String(g['temp'])} C util ${String(g['util'])}%, load ${JSON.stringify(r['load'])}, disk ${String(r['disk_free_gb'])} GB free, art window ${r['window_open'] ? 'open' : 'closed'}, ${laneText}`);
      return 0;
    }
    case 'admin': {
      const sub = f.pos[0];
      if (!c.admin) throw new CtlError('admin verbs need TTE_JOBS_ADMIN_TOKEN (coordinator session only)', 77);
      if (sub === 'pause' || sub === 'resume') print(c, f, await ask(c, [sub], { admin: true }), `gpu lane ${sub}d`);
      else if (sub === 'reorder' && f.pos[1] && f.before) print(c, f, await ask(c, ['reorder', needId(f.pos[1]), '--before', needId(f.before)], { admin: true }), 'reordered');
      else throw new UsageError('usage: gpu:admin pause|resume|reorder <id> --before <id>');
      return 0;
    }
    default:
      throw new UsageError(`unknown verb ${verb}`);
  }
}

export async function main(argv: string[]): Promise<number> {
  try {
    return await run(argv, process.env, process.cwd(), process.stdout, process.stderr);
  } catch (e) {
    process.stderr.write(`${redact((e as Error).message)}\n`);
    return e instanceof CtlError ? e.code : 2;
  }
}

if (process.argv[1]?.endsWith('jobs.ts')) void main(process.argv.slice(2)).then((c) => process.exit(c));
