/**
 * PC health probe: one ssh round trip that reads WSL, load, RAM, disk, GPU, the lane locks (`flock -n`), queued jobs and the
 * frame-check evidence files (~/tte-offload/state/frames-{ok,stall}, touched by job.sh and remote-run.sh), and classifies the
 * PC as up / busy / down / broken. The answer is cached for 60 s at <git-common-dir>/tte-pc-probe.json (atomic rename; the
 * alias is stored only as a hash). Output is one redacted line: never the host, address, user, key or alias.
 *
 *   tsx tools/ci/pc-probe.ts [--frames] [--json]     (package.json script `pc:probe`)
 *   exit 0 up or busy, 94 down, 96 frames stall, 97 disk low or lane clone missing, 2 usage / no remote
 *
 * `--frames` also runs `timeout 20 node tools/dev/pc-frame-check.cjs` in an idle lane under its lock (never while a job runs).
 * Times are epoch milliseconds (`now`), TTLs seconds. Missing metrics never block: only a measured bad value classifies.
 */
import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { LANES, type Lane, type LaneName } from './pc-job';
import type { PcView } from './pc-decide';
import { PID1_MIN_AGE_SEC, type Remote } from './pc-remote';

export type Probe = PcView & {
  /** Epoch ms when measured. */
  at: number;
  /** Hash of the alias (cache key); never the alias. */
  key?: string;
  load1?: number;
  memMb?: number;
  diskGb?: number;
  gpuTemp?: number;
  queued?: Record<LaneName, number>;
  frames?: 'ok' | 'stall' | 'skipped';
};
export interface ProbeOpts {
  frames?: boolean;
  /** Overall limit for all tries (default 10 000; 45 000 with frames). */
  timeoutMs?: number;
  tries?: number;
}

export const LOAD_BUSY = 10;
export const MEM_BASE_MB = 2048;
export const MEM_PER_WORKER_MB = 1536;
export const DISK_MIN_GB = 10;
export const FRAMES_STALL_WINDOW_SEC = 600;

const BODY = String.raw`
BASE=$HOME/tte-offload
FRAMES=$1
NOW=$(date +%s)
have_flock() { command -v flock >/dev/null 2>&1; }
mtime() { stat -c %Y "$1" 2>/dev/null || stat -f %m "$1" 2>/dev/null; }
age_of() { local m; [ -e "$1" ] || return 1; m=$(mtime "$1"); [ -n "$m" ] && echo $((NOW - m)); }
FDONE=0; FRES=skipped
lane() { # name clone lock
  local n=$1 c=$BASE/$2 k=$BASE/$3 st=idle q=0 d rc
  [ -e "$k" ] || k=/dev/null
  if have_flock; then ( flock -n 9 ) 9<"$k" 2>/dev/null || st=busy; fi
  for d in "$BASE"/jobs/*-"$n"-*; do
    [ -f "$d/status.json" ] && grep -q '"state": *"queued"' "$d/status.json" 2>/dev/null && q=$((q + 1))
  done
  echo "lane_$n=$st"; echo "queued_$n=$q"
  if [ -e "$c/.git" ]; then echo "clone_$n=1"; else echo "clone_$n=0"; fi
  if [ "$FRAMES" = frames ] && [ $FDONE = 0 ] && [ $st = idle ] && [ -f "$c/tools/dev/pc-frame-check.cjs" ]; then
    (
      if have_flock; then flock -n 9 || exit 9; fi
      cd "$c" || exit 8
      [ -s "$HOME/.nvm/nvm.sh" ] && { export NVM_DIR=$HOME/.nvm; . "$NVM_DIR/nvm.sh" >/dev/null 2>&1; }
      unset DISPLAY WAYLAND_DISPLAY
      if command -v timeout >/dev/null 2>&1; then timeout 20 node tools/dev/pc-frame-check.cjs </dev/null >/dev/null 2>&1
      else node tools/dev/pc-frame-check.cjs </dev/null >/dev/null 2>&1; fi
    ) 9<"$k"
    rc=$?
    mkdir -p "$BASE/state"
    case $rc in
      0) touch "$BASE/state/frames-ok"; FDONE=1; FRES=ok ;;
      8|9|127) ;;
      *) touch "$BASE/state/frames-stall"; FDONE=1; FRES=stall ;;
    esac
  fi
}
probe_main() {
  local v
  echo v=1
  v=$(ps -o etimes= -p 1 2>/dev/null | tr -d ' ')
  case "$v" in ''|*[!0-9]*) v= ;; esac
  echo "pid1_age=$v"
  echo "load1=$(cut -d' ' -f1 /proc/loadavg 2>/dev/null)"
  echo "nproc=$(nproc 2>/dev/null)"
  echo "mem_kb=$(awk '/MemAvailable/ {print $2}' /proc/meminfo 2>/dev/null)"
  echo "disk_kb=$(df -Pk "$HOME" 2>/dev/null | awk 'NR==2 {print $4}')"
  echo "gpu=$(nvidia-smi --query-gpu=temperature.gpu --format=csv,noheader,nounits 2>/dev/null </dev/null | head -n 1 | tr -d ' ')"
  echo "gpu_apps=$(nvidia-smi --query-compute-apps=pid --format=csv,noheader 2>/dev/null </dev/null | grep -c .)"
  __LANES__
  echo "frames_ok_age=$(age_of "$BASE/state/frames-ok")"
  echo "frames_stall_age=$(age_of "$BASE/state/frames-stall")"
  echo "frames=$FRES"
}
probe_main
`;

/** The probe, as one bash 3.2-safe script that prints key=value lines; run with `bash -s [frames]`. */
export function probeScript(lanes: Record<LaneName, Lane> = LANES): string {
  const q = (s: string): string => {
    if (!/^[A-Za-z0-9_./-]+$/.test(s)) throw new Error(`unsafe lane value: ${s}`);
    return s;
  };
  const calls = (Object.entries(lanes) as [LaneName, Lane][]).map(([n, l]) => `lane ${q(n)} ${q(l.clone)} ${q(l.lock)}`).join('\n  ');
  return `#!/bin/bash\n${BODY.replace('__LANES__', calls)}`;
}

const num = (m: Map<string, string>, k: string): number | undefined => {
  const v = m.get(k);
  if (v === undefined || !/^-?\d+(\.\d+)?$/.test(v)) return undefined;
  return Number(v);
};

/** Turn the script's stdout (and the ssh exit code; 124 = our timeout, 255 = ssh failed) into a classified Probe. */
export function parseProbe(stdout: string, code: number, now: number): Probe {
  if (code === 124) return { state: 'down', why: 'timeout', at: now };
  if (code === 255) return { state: 'down', why: 'unreachable', at: now };
  const m = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const hit = /^([a-z0-9_]+)=(.*)$/.exec(line.trim());
    if (hit) m.set(hit[1] as string, hit[2] as string);
  }
  if (code !== 0 || m.get('v') !== '1') return { state: 'down', why: 'wsl', at: now };

  const load1 = num(m, 'load1');
  const memKb = num(m, 'mem_kb');
  const diskKb = num(m, 'disk_kb');
  const gpuTemp = num(m, 'gpu');
  const pid1 = num(m, 'pid1_age');
  const okAge = num(m, 'frames_ok_age');
  const stallAge = num(m, 'frames_stall_age');
  const lanes = {} as Record<LaneName, 'idle' | 'busy'>;
  const queued = {} as Record<LaneName, number>;
  let cloneMissing = false;
  for (const n of Object.keys(LANES) as LaneName[]) {
    lanes[n] = m.get(`lane_${n}`) === 'busy' ? 'busy' : 'idle';
    queued[n] = num(m, `queued_${n}`) ?? 0;
    if (m.get(`clone_${n}`) === '0') cloneMissing = true;
  }
  const f = m.get('frames');
  const extra: Omit<Probe, 'state' | 'why' | 'lanes' | 'gpuJobs' | 'young'> & { at: number } = {
    at: now,
    queued,
    ...(load1 === undefined ? {} : { load1 }),
    ...(memKb === undefined ? {} : { memMb: Math.round(memKb / 1024) }),
    ...(diskKb === undefined ? {} : { diskGb: Math.round(diskKb / 1048576) }),
    ...(gpuTemp === undefined ? {} : { gpuTemp }),
    ...(f === 'ok' || f === 'stall' || f === 'skipped' ? { frames: f } : {}),
  };
  if (diskKb !== undefined && diskKb < DISK_MIN_GB * 1048576) return { state: 'broken', why: 'disk', ...extra };
  if (cloneMissing) return { state: 'broken', why: 'clone', ...extra };
  if (stallAge !== undefined && (okAge === undefined || stallAge < okAge) && stallAge < FRAMES_STALL_WINDOW_SEC) return { state: 'broken', why: 'frames', ...extra };

  const maxWorkers = Math.max(...Object.values(LANES).map((l) => l.workers));
  const view = { lanes, gpuJobs: num(m, 'gpu_apps') ?? 0, young: pid1 !== undefined && pid1 < PID1_MIN_AGE_SEC };
  if (load1 !== undefined && load1 > LOAD_BUSY) return { state: 'busy', why: 'load', ...view, ...extra };
  if (memKb !== undefined && memKb < (MEM_BASE_MB + MEM_PER_WORKER_MB * maxWorkers) * 1024) return { state: 'busy', why: 'ram', ...view, ...extra };
  return { state: 'up', ...view, ...extra };
}

export const keyOf = (alias: string): string => createHash('sha256').update(alias).digest('hex').slice(0, 12);

function once(r: Remote, script: string, frames: boolean, ms: number): Promise<{ code: number; stdout: string }> {
  const args = [
    '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=5', '-o', 'ServerAliveInterval=5', '-o', 'ServerAliveCountMax=2',
    r.alias, 'wsl', '-d', r.distro, '--cd', '~', '--', 'bash', '-s', ...(frames ? ['frames'] : []),
  ];
  return new Promise((done) => {
    let stdout = '';
    let finished = false;
    const end = (code: number): void => {
      if (finished) return;
      finished = true;
      clearTimeout(t);
      done({ code, stdout });
    };
    const p = spawn(r.ssh, args, { stdio: ['pipe', 'pipe', 'ignore'] });
    // On the limit do not wait for `close`: a killed wrapper can leave a child holding the pipe open.
    const t = setTimeout(() => {
      p.kill('SIGKILL');
      end(124);
    }, ms);
    p.stdout.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    p.stdin.on('error', () => undefined);
    p.on('error', () => end(255));
    p.on('close', (code) => end(code ?? 255));
    p.stdin.end(script);
  });
}

/** One ssh round trip, retried when ssh itself fails or times out (at most `tries`, all within `timeoutMs`). */
export async function probe(remote: Remote, opts: ProbeOpts = {}): Promise<Probe> {
  const frames = opts.frames === true;
  const total = opts.timeoutMs ?? (frames ? 45_000 : 10_000);
  const tries = opts.tries ?? 2;
  const script = probeScript();
  const t0 = Date.now();
  let res = { code: 255, stdout: '' };
  for (let i = 0; i < tries; i++) {
    const left = total - (Date.now() - t0);
    if (left <= 0) break;
    res = await once(remote, script, frames, left);
    if (res.code !== 255 && res.code !== 124) break;
    if (i + 1 < tries) await new Promise((r) => setTimeout(r, 300));
  }
  return { ...parseProbe(res.stdout, res.code, Date.now()), key: keyOf(remote.alias) };
}

/** `<git-common-dir>/tte-pc-probe.json` for the checkout at `cwd` (shared by all worktrees). */
export function cacheFile(cwd: string): string {
  const g = spawnSync('git', ['rev-parse', '--git-common-dir'], { cwd, encoding: 'utf8' });
  if (g.status === 0 && g.stdout.trim()) return resolve(cwd, g.stdout.trim(), 'tte-pc-probe.json');
  return resolve(cwd, '.scratch', 'tte-pc-probe.json');
}

/** The cached probe when it is younger than `ttlSec` (and, when given, was made for the same alias hash `key`). */
export function readCache(file: string, now: number, ttlSec: number, key?: string): Probe | undefined {
  try {
    const p = JSON.parse(readFileSync(file, 'utf8')) as Probe;
    if (typeof p.at !== 'number' || typeof p.state !== 'string') return undefined;
    if (now - p.at > ttlSec * 1000 || p.at > now + 5000) return undefined;
    if (key !== undefined && p.key !== undefined && p.key !== key) return undefined;
    return p;
  } catch {
    return undefined;
  }
}

/** Atomic write (temp file in the same dir, then rename). Best effort: a failure never fails a run. */
export function writeCache(file: string, p: Probe): void {
  try {
    mkdirSync(resolve(file, '..'), { recursive: true });
    const tmp = `${file}.${String(process.pid)}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(p)}\n`);
    renameSync(tmp, file);
  } catch {
    /* ignore */
  }
}

/** Record what a PC attempt learned: 94 -> down, 96 -> broken (frames), 95 -> busy, 0/1 -> up. Other codes change nothing. */
export function noteExit(file: string, code: number, now: number): void {
  const prev = readCache(file, now, 3600);
  const lanes: Record<LaneName, 'idle' | 'busy'> = prev && 'lanes' in prev ? prev.lanes : { short: 'idle', full: 'idle' };
  const keep = prev?.key === undefined ? {} : { key: prev.key };
  const view = (state: 'up' | 'busy', why?: 'load'): Probe => ({ state, ...(why ? { why } : {}), lanes, gpuJobs: 0, young: false, at: now, ...keep });
  if (code === 94) writeCache(file, { state: 'down', why: 'unreachable', at: now, ...keep });
  else if (code === 96) writeCache(file, { state: 'broken', why: 'frames', at: now, ...keep });
  else if (code === 95) writeCache(file, view('busy', 'load'));
  else if (code === 0 || code === 1) writeCache(file, view('up'));
}

/** One redacted line; never the alias, host, address, user or key. */
export function formatProbe(p: Probe, cached = false): string {
  const bits: string[] = [];
  if (p.load1 !== undefined) bits.push(`load ${p.load1.toFixed(1)}`);
  if (p.memMb !== undefined) bits.push(`RAM ${(p.memMb / 1024).toFixed(1)} GB free`);
  if (p.diskGb !== undefined) bits.push(`disk ${String(p.diskGb)} GB free`);
  if (p.gpuTemp !== undefined) bits.push(`GPU ${String(p.gpuTemp)}C`);
  if ('gpuJobs' in p) bits.push(`${String(p.gpuJobs)} GPU job${p.gpuJobs === 1 ? '' : 's'}`);
  if ('lanes' in p) bits.push(`lanes ${(Object.entries(p.lanes) as [string, string][]).map(([n, s]) => `${n} ${s}`).join(', ')}`);
  if (p.frames) bits.push(`frames ${p.frames}`);
  const head = p.state === 'up' || p.state === 'busy' ? `PC ${p.state}${p.why ? ` (${p.why})` : ''}` : `PC ${p.state} (${p.why})`;
  return `${head}${bits.length ? `: ${bits.join(', ')}` : ''}${cached ? ' [cached]' : ''}`;
}

const aliasOf = (env: NodeJS.ProcessEnv, cwd: string): string | undefined => {
  const e = env['TTE_REMOTE']?.trim();
  if (e) return e;
  const r = spawnSync('git', ['config', '--get', 'tte.remote'], { cwd, encoding: 'utf8' });
  return (r.status === 0 && r.stdout.trim()) || undefined;
};

/** Exit code for a probe: 0 up/busy, 94 down, 96 frames, 97 disk/clone. */
export const probeExit = (p: Probe): number => (p.state === 'down' ? 94 : p.state === 'broken' ? (p.why === 'frames' ? 96 : 97) : 0);

export async function main(argv: readonly string[], env: NodeJS.ProcessEnv = process.env, cwd = process.cwd(), out: { write(s: string): unknown } = process.stdout): Promise<number> {
  const frames = argv.includes('--frames');
  const json = argv.includes('--json');
  const bad = argv.find((a) => a !== '--frames' && a !== '--json');
  if (bad !== undefined) {
    process.stderr.write('usage: pc:probe [--frames] [--json]\n');
    return 2;
  }
  const alias = aliasOf(env, cwd);
  if (!alias) {
    process.stderr.write('no PC configured (git config tte.remote <ssh alias> or TTE_REMOTE)\n');
    return 2;
  }
  const file = cacheFile(cwd);
  const ttl = Number(env['TTE_PC_PROBE_TTL_SEC'] ?? 60);
  const now = Date.now();
  const hit = frames ? undefined : readCache(file, now, Number.isFinite(ttl) ? ttl : 60, keyOf(alias));
  const remote: Remote = { alias, distro: env['TTE_REMOTE_DISTRO'] || 'Ubuntu', ssh: env['TTE_SSH'] || 'ssh' };
  const p = hit ?? (await probe(remote, { frames }));
  if (!hit) writeCache(file, p);
  const { key: _key, ...shown } = p;
  void _key;
  out.write(`${json ? JSON.stringify(shown) : formatProbe(p, hit !== undefined)}\n`);
  return probeExit(p);
}

if (process.argv[1]?.endsWith('pc-probe.ts')) void main(process.argv.slice(2)).then((c) => process.exit(c));
