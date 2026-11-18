/**
 * Transport to the GPU PC (ssh alias -> WSL distro): upload a job dir, follow its log with reconnects, fetch results,
 * cancel, list jobs and show host status. Nothing about the machine lives here: the caller passes a `Remote`
 * (alias from ~/.ssh/config; tests pass a fake ssh). See ~/claudetmp/plans/e2e-on-4060-plan.md (R2).
 *
 * Contract with the job renderer (tools/ci/pc-job.ts), all under ~/tte-offload/jobs/<id>/ on the PC:
 *   job.sh, start.sh, src.bundle, meta.json   uploaded by `submit` (start.sh must return quickly: setsid -f ... &)
 *   pid                                       written by job.sh at its very start (`echo $$ > pid`; the process-group leader)
 *   status.json                               {"state":"queued|running|done|error", "rc":N, "result":"ok|fail|error", ...}
 *   out/output.log                            the combined log (what `follow` streams); out/ is what `fetchResults` copies
 * The remote side is one small bash script (CTL) uploaded to ~/tte-offload/ctl.sh; every remote command is a short token list
 * (no quoting: Windows OpenSSH hands the line to wsl.exe), ids are validated against ID_RE.
 */
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { Readable } from 'node:stream';

export type Remote = { alias: string; distro: string; ssh: string };
export type JobStatus = {
  /** done|error|cancelled (from the job), lost (pid vanished), unreachable (ssh gave up), unknown. */
  state: string;
  rc: number;
  result?: 'ok' | 'fail' | 'error';
  queueSec?: number;
  syncSec?: number;
  runSec?: number;
  maxLoad?: number;
};
export type JobInfo = { id: string; state: string; rc?: number };
export type Sink = { write(chunk: Buffer | string): unknown };
export type FollowOpts = {
  /** Default: what `submit` decided for this id in this process, else true. */
  detached?: boolean;
  backoffMs?: number;
  budgetMs?: number;
  heartbeatSec?: number;
  /** Where PC-side heartbeat lines go (default process.stderr). */
  err?: Sink;
  caffeinate?: boolean;
  signal?: AbortSignal;
};

export const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
export const PID1_MIN_AGE_SEC = 600;
export const EXIT = { usage: 2, upload: 3, bundle: 92, lost: 93, unreachable: 94, busy: 95, frames: 96, ssh: 255 } as const;

export class PcError extends Error {
  constructor(message: string, readonly code: number) {
    super(message);
    this.name = 'PcError';
  }
}

const SSH_OPTS = ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=8'];
export const sshArgs = (r: Remote, cmd: string[]): string[] => [...SSH_OPTS, r.alias, 'wsl', '-d', r.distro, '--cd', '~', '--', ...cmd];
const checkId = (id: string): void => {
  if (!ID_RE.test(id)) throw new PcError(`bad job id "${id}"`, EXIT.usage);
};
const ctlCmd = (sub: string, ...args: (string | number)[]): string[] => ['bash', 'tte-offload/ctl.sh', sub, ...args.map(String)];

type Ran = { code: number; stdout: string };
const run = (r: Remote, cmd: string[], input?: string | Readable): Promise<Ran> =>
  new Promise((resolve) => {
    const p = spawn(r.ssh, sshArgs(r, cmd), { stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'inherit'] });
    let stdout = '';
    p.stdout?.on('data', (d: Buffer) => (stdout += d.toString('utf8')));
    p.on('error', () => resolve({ code: EXIT.ssh, stdout }));
    p.on('close', (code) => resolve({ code: code ?? EXIT.ssh, stdout }));
    if (typeof input === 'string') p.stdin?.end(input);
    else if (input) input.pipe(p.stdin!);
  });

// The remote helper. No `${...}`, no backticks here (template literal); bash 3.2 compatible so tests run on a Mac.
const CTL = String.raw`#!/usr/bin/env bash
R=$HOME/tte-offload; J=$R/jobs
cmd=$1; id=$2
need_id() { case "$id" in ''|*[!A-Za-z0-9_-]*) echo "bad job id" >&2; exit 2 ;; esac; d=$J/$id; [ -d "$d" ] || { echo "no such job $id" >&2; exit 91; }; }
jget() { [ -f "$1" ] && sed -n 's/.*"'"$2"'" *: *"\{0,1\}\([A-Za-z0-9._-]*\)"\{0,1\}.*/\1/p' "$1" | head -n 1; }
is_final() { s=$(jget "$d/status.json" state); case "$s" in ''|queued|running|syncing) return 1 ;; esac; return 0; }
case "$cmd" in
  age) ps -o etimes= -p 1 | tr -d ' ' ;;
  fg) need_id; cd "$d" && exec bash job.sh ;;
  status) need_id; if [ -f "$d/status.json" ]; then cat "$d/status.json"; else echo '{"state":"unknown","rc":1}'; fi ;;
  follow)
    need_id; off=$3; hb=$4; [ -n "$hb" ] || hb=60; log=$d/out/output.log; idle=0; dead=0; nopid=0
    while :; do
      fin=0; is_final && fin=1
      if [ -f "$log" ]; then
        sz=$(wc -c < "$log" | tr -d ' ')
        if [ "$sz" -ge "$off" ]; then tail -c +"$off" "$log" | head -c $((sz - off + 1)); off=$((sz + 1)); idle=0; fi
      fi
      [ $fin = 1 ] && exit 0
      pid=$(cat "$d/pid" 2>/dev/null)
      if [ -z "$pid" ]; then nopid=$((nopid + 1)); else nopid=0; fi
      if [ -n "$pid" ] && ! kill -0 "$pid" 2>/dev/null; then dead=$((dead + 1)); else dead=0; fi
      if [ $dead -ge 4 ] || [ $nopid -ge 600 ]; then
        printf '{"state":"lost","rc":93,"result":"error"}\n' > "$d/status.json"; echo "job $id lost (process gone, no final status)" >&2; exit 93
      fi
      sleep 0.3; idle=$((idle + 1))
      if [ $((idle * 3)) -ge $((hb * 10)) ]; then
        echo "[pc] $id still running; $(tail -n 1 "$d/out/health.csv" 2>/dev/null)" >&2; idle=0
      fi
    done ;;
  cancel)
    need_id; pid=$(cat "$d/pid" 2>/dev/null)
    if [ -n "$pid" ]; then
      kill -TERM -- "-$pid" 2>/dev/null || kill -TERM "$pid" 2>/dev/null
      i=0; while kill -0 "$pid" 2>/dev/null && [ $i -lt 50 ]; do sleep 0.2; i=$((i + 1)); done
      sleep 0.3; kill -KILL -- "-$pid" 2>/dev/null
    fi
    is_final || printf '{"state":"cancelled","rc":143,"result":"error"}\n' > "$d/status.json"
    echo cancelled ;;
  fetch)
    need_id; cap=$3; [ -n "$cap" ] || cap=500; [ -d "$d/out" ] || { echo "no results yet" >&2; exit 91; }
    kb=$(du -sk "$d/out" | cut -f1); ex=""
    [ "$kb" -gt $((cap * 1024)) ] && ex="--exclude=*.zip"
    exec tar $ex -C "$d/out" -cf - . ;;
  jobs)
    n=$2; [ -n "$n" ] || n=20
    ls -1 "$J" 2>/dev/null | sort -r | head -n "$n" | while read -r j; do
      printf '%s\t%s\t%s\n' "$j" "$(jget "$J/$j/status.json" state)" "$(jget "$J/$j/status.json" rc)"
    done ;;
  host)
    echo "load: $(cut -d' ' -f1-3 /proc/loadavg 2>/dev/null)"
    echo "mem: $(grep -E 'MemAvailable' /proc/meminfo 2>/dev/null | tr -s ' ')"
    echo "disk: $(df -h "$HOME" 2>/dev/null | tail -n 1 | tr -s ' ' | cut -d' ' -f4) free"
    command -v nvidia-smi >/dev/null 2>&1 && echo "gpu: $(nvidia-smi --query-gpu=temperature.gpu,utilization.gpu --format=csv,noheader 2>/dev/null)"
    for lane in short full; do
      h=""; for j in $(ls -1 "$J" 2>/dev/null | grep -- "-$lane-"); do
        case "$(jget "$J/$j/status.json" state)" in running) h="$j" ;; esac
      done
      [ -n "$h" ] || h=idle
      echo "lane $lane: $h"
    done
    echo "recent:"; bash "$0" jobs 5 | sed 's/^/  /' ;;
  *) echo "unknown subcommand" >&2; exit 2 ;;
esac
`;

const ctlReady = new Set<string>();
async function ensureCtl(r: Remote, extraDirs: string[] = []): Promise<void> {
  const key = `${r.ssh}|${r.alias}|${r.distro}|${extraDirs.join(',')}`;
  if (ctlReady.has(key)) return;
  const mk = await run(r, ['mkdir', '-p', 'tte-offload/jobs', ...extraDirs]);
  if (mk.code === EXIT.ssh) throw new PcError('PC unreachable (ssh failed)', EXIT.unreachable);
  if (mk.code !== 0) throw new PcError(`remote mkdir failed (${mk.code})`, EXIT.upload);
  const up = await run(r, ['tee', 'tte-offload/ctl.sh'], CTL);
  if (up.code !== 0) throw new PcError(`ctl upload failed (${up.code})`, EXIT.upload);
  ctlReady.add(key);
}

/** Cheap reachability check; false means exit 94. */
export async function ping(r: Remote): Promise<boolean> {
  return (await run(r, ['true'])).code === 0;
}

const detachedById = new Map<string, boolean>();

/**
 * Upload `dir` (job.sh, start.sh, src.bundle, meta.json) to jobs/<id>/ and, when the distro has been up long enough for
 * detached jobs to survive the ssh session, start it. When not detached nothing runs yet: `follow` runs it in the foreground.
 */
export async function submit(r: Remote, id: string, dir: string): Promise<{ detached: boolean }> {
  checkId(id);
  await ensureCtl(r, [`tte-offload/jobs/${id}`]);
  const age = Number.parseInt((await run(r, ctlCmd('age'))).stdout.trim(), 10);
  const detached = Number.isFinite(age) && age > PID1_MIN_AGE_SEC;
  const tar = spawn('tar', ['-cf', '-', '-C', dir, '.'], { stdio: ['ignore', 'pipe', 'inherit'], env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const tarDone = once(tar, 'close');
  const up = await run(r, ['tar', '-C', `tte-offload/jobs/${id}`, '-xf', '-'], tar.stdout);
  const [tarCode] = (await tarDone) as [number | null];
  if (up.code !== 0 || tarCode !== 0) throw new PcError(`upload failed (ssh ${up.code}, tar ${tarCode})`, EXIT.upload);
  if (detached) {
    const st = await run(r, ['bash', `tte-offload/jobs/${id}/start.sh`]);
    if (st.code !== 0) throw new PcError(`start.sh failed (${st.code})`, EXIT.upload);
  } else process.stderr.write('warning: WSL instance is young (idle timeout not off?): running in the foreground of the ssh session\n');
  detachedById.set(id, detached);
  return { detached };
}

export async function jobStatus(r: Remote, id: string): Promise<JobStatus | undefined> {
  checkId(id);
  await ensureCtl(r);
  const res = await run(r, ctlCmd('status', id));
  if (res.code !== 0) return undefined;
  return parseStatus(res.stdout);
}

export function parseStatus(text: string): JobStatus {
  let o: Record<string, unknown> = {};
  try {
    o = JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { state: 'unknown', rc: 1 };
  }
  const num = (k: string): number | undefined => (typeof o[k] === 'number' ? (o[k] as number) : undefined);
  const res = o['result'] ?? o['status'];
  const s: JobStatus = { state: typeof o['state'] === 'string' ? o['state'] : 'unknown', rc: num('rc') ?? 1 };
  if (res === 'ok' || res === 'fail' || res === 'error') s.result = res;
  for (const [k, v] of [['queueSec', 'queue'], ['syncSec', 'sync'], ['runSec', 'run']] as const) {
    const n = num(`${v}Sec`) ?? num(`${v}_sec`);
    if (n !== undefined) s[k] = n;
  }
  const ml = num('maxLoad') ?? num('max_load');
  if (ml !== undefined) s.maxLoad = ml;
  return s;
}

/** Process exit code for a finished job (plan section 3.8): lost 93, ssh given up 255, else the job's own rc. */
export function exitCodeOf(s: JobStatus): number {
  if (s.state === 'lost') return EXIT.lost;
  if (s.state === 'unreachable') return EXIT.ssh;
  return s.rc;
}

const sleep = (ms: number): Promise<void> => new Promise((res) => setTimeout(res, ms));

/** Stream the job's log to `out` (default stdout), reconnecting from the byte offset after ssh drops; resolves with the final status. */
export async function follow(r: Remote, id: string, out: Sink = process.stdout, opts: FollowOpts = {}): Promise<JobStatus> {
  checkId(id);
  await ensureCtl(r);
  const detached = opts.detached ?? detachedById.get(id) ?? true;
  const err = opts.err ?? process.stderr;
  let caf: ReturnType<typeof spawn> | undefined;
  if ((opts.caffeinate ?? process.platform === 'darwin')) {
    caf = spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore' });
    caf.on('error', () => undefined);
    caf.unref();
  }
  try {
    let offset = 1;
    let down = 0;
    const budget = opts.budgetMs ?? 15 * 60_000;
    for (;;) {
      if (opts.signal?.aborted) return { state: 'unreachable', rc: EXIT.ssh };
      const cmd = detached ? ctlCmd('follow', id, offset, opts.heartbeatSec ?? 60) : ctlCmd('fg', id);
      const code = await new Promise<number>((resolve) => {
        const p = spawn(r.ssh, sshArgs(r, cmd), { stdio: ['ignore', 'pipe', 'pipe'], signal: opts.signal });
        p.stdout.on('data', (d: Buffer) => {
          if (detached) offset += d.length;
          down = 0;
          out.write(d);
        });
        p.stderr.on('data', (d: Buffer) => err.write(d));
        p.on('error', () => resolve(EXIT.ssh));
        p.on('close', (c) => resolve(c ?? EXIT.ssh));
      });
      if (code !== EXIT.ssh) {
        const st = await jobStatus(r, id);
        if (st) return st.state === 'unknown' || st.state === 'running' || st.state === 'queued' ? { ...st, state: code === EXIT.lost ? 'lost' : 'done', rc: code } : st;
        return code === EXIT.lost ? { state: 'lost', rc: EXIT.lost, result: 'error' } : { state: 'done', rc: code };
      }
      if (!detached) return { state: 'unreachable', rc: EXIT.ssh };
      if (down === 0) down = Date.now();
      if (Date.now() - down > budget) {
        err.write(`ssh to the PC lost for over ${Math.round(budget / 60_000)} min; the job keeps running: attach later with --pc-attach ${id}\n`);
        return { state: 'unreachable', rc: EXIT.ssh };
      }
      err.write(`ssh dropped; reconnecting from byte ${offset}\n`);
      await sleep(opts.backoffMs ?? 5000);
    }
  } finally {
    caf?.kill();
  }
}

/** Copy jobs/<id>/out/ to `dest` (a local directory that must exist). Above `capMb`, traces (*.zip) are left behind. */
export async function fetchResults(r: Remote, id: string, dest: string, capMb = 500): Promise<void> {
  checkId(id);
  await ensureCtl(r);
  const p = spawn(r.ssh, sshArgs(r, ctlCmd('fetch', id, capMb)), { stdio: ['ignore', 'pipe', 'inherit'] });
  const x = spawn('tar', ['-xf', '-', '-C', dest], { stdio: ['pipe', 'inherit', 'inherit'] });
  p.stdout.pipe(x.stdin);
  const [[pc], [xc]] = (await Promise.all([once(p, 'close'), once(x, 'close')])) as [[number | null], [number | null]];
  if (pc !== 0 || xc !== 0) throw new PcError(`fetch failed (ssh ${pc}, tar ${xc})`, EXIT.upload);
}

/** Kill the job's process group (TERM, then KILL) and mark it cancelled unless it already finished. */
export async function cancel(r: Remote, id: string): Promise<boolean> {
  checkId(id);
  await ensureCtl(r);
  return (await run(r, ctlCmd('cancel', id))).code === 0;
}

/** Newest-first job list from the PC. */
export async function jobs(r: Remote, limit = 20): Promise<JobInfo[]> {
  await ensureCtl(r);
  const res = await run(r, ctlCmd('jobs', limit));
  if (res.code !== 0) throw new PcError(`jobs failed (${res.code})`, res.code === EXIT.ssh ? EXIT.unreachable : EXIT.usage);
  return res.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [jid = '', state = '', rc = ''] = line.split('\t');
      const info: JobInfo = { id: jid, state: state || 'unknown' };
      if (rc !== '' && Number.isFinite(Number(rc))) info.rc = Number(rc);
      return info;
    });
}

/** Human-readable host and queue summary: load, memory, disk, GPU, lane holders, last jobs. */
export async function status(r: Remote): Promise<string> {
  await ensureCtl(r);
  const res = await run(r, ctlCmd('host'));
  if (res.code !== 0) throw new PcError(`status failed (${res.code})`, res.code === EXIT.ssh ? EXIT.unreachable : EXIT.usage);
  return res.stdout;
}
