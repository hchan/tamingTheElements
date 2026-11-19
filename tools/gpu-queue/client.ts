/** Transport to the PC job server (tools/gpu-queue/ctl.py): one ssh call per request, token on stdin line 1 (never argv). */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
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
export const call = (c: Ctx, args: string[], tokenLine: string, body?: Buffer, stdoutTo?: NodeJS.WritableStream): Promise<Raw> =>
  callRemote(c, ['python3', CTL, ...args], tokenLine, body, stdoutTo);
export function callRemote(c: Ctx, cmd: string[], tokenLine: string | undefined, body?: Buffer, stdoutTo?: NodeJS.WritableStream): Promise<Raw> {
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

