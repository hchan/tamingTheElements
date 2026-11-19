/** Transport to the PC job server (tools/gpu-queue/ctl.py): one ssh call per request, token on stdin line 1 (never argv). */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import { redact } from '../ci/redact';
import { EXIT, sshArgs, type Remote } from '../ci/pc-remote';

export class UsageError extends Error {}
export const PROTO = 1;
export const CTL = 'tte-jobs/bin/ctl.py';
export const ID_RE = /^[A-Za-z0-9_-]{1,48}$/;
export const FINAL = new Set(['done', 'failed', 'cancelled', 'lost']);

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

export const configDir = (env: Env): string => env['TTE_JOBS_CONFIG_DIR'] || join(homedir(), '.config', 'tte-jobs');
export function userToken(env: Env): string | undefined {
  const t = env['TTE_JOBS_TOKEN']?.trim();
  if (t) return t;
  try {
    return readFileSync(join(configDir(env), 'token'), 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

export type Raw = { code: number; stdout: Buffer };
/** One remote call: stdin line 1 is the token(s) (never argv), then an optional byte stream. */
export const call = (c: Ctx, args: string[], tokenLine: string, body?: Buffer | Readable, stdoutTo?: NodeJS.WritableStream): Promise<Raw> =>
  callRemote(c, ['python3', CTL, ...args], tokenLine, body, stdoutTo);
export function callRemote(c: Ctx, cmd: string[], tokenLine: string | undefined, body?: Buffer | Readable, stdoutTo?: NodeJS.WritableStream): Promise<Raw> {
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
    if (body && !Buffer.isBuffer(body)) body.pipe(p.stdin);
    else p.stdin.end(body);
  });
}

export const tokenLine = (c: Ctx, admin = false): string => (admin && c.admin ? `${c.token} ${c.admin}` : c.token);

export class CtlError extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
  }
}

export function parseReply(raw: Raw): Reply {
  const line = raw.stdout.toString('utf8').split('\n').filter((l) => l.startsWith('{')).pop();
  if (!line) throw new CtlError('empty reply from the PC', EXIT.unreachable);
  const r = JSON.parse(line) as Reply;
  if (r.proto !== PROTO) throw new CtlError(`server speaks protocol ${String(r.proto)}, client ${String(PROTO)}: run pnpm gpu:setup`, 97);
  return r;
}

export async function ask(c: Ctx, args: string[], opts: { admin?: boolean; body?: Buffer } = {}): Promise<Reply> {
  const raw = await call(c, args, tokenLine(c, opts.admin), opts.body);
  if (raw.code === EXIT.ssh) throw new CtlError('PC unreachable (ssh failed)', EXIT.unreachable);
  if (raw.code !== 0) throw new CtlError(`ctl exited ${String(raw.code)}`, raw.code);
  return parseReply(raw);
}


export type RawLane = 'cpu-short' | 'cpu-full';
export type QueueClient = {
  caps(): Promise<boolean>;
  submitRaw(lane: RawLane, id: string, dir: string): Promise<string>;
  waitRaw(rawId: string): Promise<number>;
  fetchRaw(rawId: string, dest: string): Promise<void>;
  cancelRaw(rawId: string): Promise<void>;
};

/** Raw (cpu-lane) jobs: submit a job dir, follow it to its own exit code, fetch out/, cancel. Everything printed goes through redact(). */
export function queueClient(remote: Remote, env: Env, cwd: string, err: NodeJS.WritableStream): QueueClient {
  const scrub = (s: string): string => redact(s.split(remote.alias).join('<pc>'));
  const quiet = { write: (s: string | Uint8Array): boolean => err.write(scrub(String(s))) } as NodeJS.WritableStream;
  const c: Ctx = { remote, owner: ownerId(env, cwd), token: userToken(env) ?? '', env, cwd, out: quiet, err: quiet };
  const guarded = async <T>(f: () => Promise<T>): Promise<T> => {
    try {
      return await f();
    } catch (e) {
      if (e instanceof CtlError) throw new CtlError(scrub(e.message), e.code);
      throw e;
    }
  };
  const rawName = (id: string): string => {
    if (!ID_RE.test(id)) throw new UsageError(`bad job id ${id}`);
    return id;
  };
  return {
    async caps() {
      try {
        const raw = await call(c, ['version'], tokenLine(c));
        if (raw.code !== 0) return false;
        const caps = parseReply(raw)['caps'];
        return Array.isArray(caps) && caps.includes('raw-e2e');
      } catch {
        return false;
      }
    },
    submitRaw: (lane, id, dir) =>
      guarded(async () => {
        const tar = spawn('tar', ['-cf', '-', '-C', dir, '.'], { stdio: ['ignore', 'pipe', 'inherit'] });
        const tarDone = new Promise<number>((res) => tar.on('close', (code) => res(code ?? 1)));
        const raw = await call(c, ['submit-raw', '--owner', c.owner, '--lane', lane, rawName(id)], tokenLine(c), tar.stdout);
        const tcode = await tarDone;
        if (raw.code === EXIT.ssh) throw new CtlError('PC unreachable (ssh failed)', EXIT.unreachable);
        if (raw.code !== 0) throw new CtlError(`submit-raw exited ${String(raw.code)}`, raw.code);
        if (tcode !== 0) throw new CtlError('could not pack the job dir', 1);
        return String(parseReply(raw)['id']);
      }),
    waitRaw: (rawId) =>
      guarded(async () => {
        const poll = Number(env['TTE_JOBS_POLL_MS']) || 2000;
        let offset = 0;
        let fails = 0;
        for (;;) {
          let r: Reply;
          try {
            r = await ask(c, ['log', rawName(rawId), '--offset', String(offset)]);
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
            if (state === 'lost') return EXIT.lost;
            if (state === 'cancelled') return 130;
            return typeof rc === 'number' ? rc : state === 'done' ? 0 : 1;
          }
          await new Promise((res) => setTimeout(res, poll));
        }
      }),
    fetchRaw: (rawId, dest) =>
      guarded(async () => {
        mkdirSync(dest, { recursive: true });
        const tar = spawn('tar', ['-xf', '-', '-C', dest], { stdio: ['pipe', 'inherit', 'inherit'] });
        const done = new Promise<number>((res) => tar.on('close', (code) => res(code ?? 1)));
        const raw = await call(c, ['fetch', rawName(rawId)], tokenLine(c), undefined, tar.stdin);
        const tcode = await done;
        if (raw.code === EXIT.ssh) throw new CtlError('PC unreachable (ssh failed)', EXIT.unreachable);
        if (raw.code !== 0) throw new CtlError(`ctl exited ${String(raw.code)}`, raw.code);
        if (tcode !== 0) throw new CtlError('could not unpack the results', 1);
      }),
    cancelRaw: (rawId) =>
      guarded(async () => {
        await ask(c, ['cancel', '--owner', c.owner, rawName(rawId)]);
      }),
  };
}
