/**
 * Run one command in its own process group with a wall-clock cap; on timeout kill the whole group (children of children too).
 * Used by nightly-fix.ts through spawnSync, so the parent stays synchronous:
 *   node --import tsx tools/ci/group-run.ts <cwd> <timeoutMs> <cmd> [args...]   (env is inherited)
 * Prints one JSON line `{"code","signal","timedOut","error","stdout","stderr"}` (each stream capped to its last 4 MB).
 */
import { spawn } from 'node:child_process';

const CAP = 4 * 1024 * 1024;
const [cwd, timeout, cmd, ...args] = process.argv.slice(2);
const emit = (o: Record<string, unknown>): void => {
  process.stdout.write(`${JSON.stringify(o)}\n`);
};
if (!cwd || !timeout || !cmd) {
  emit({ code: 2, signal: null, timedOut: false, error: 'usage: group-run.ts <cwd> <timeoutMs> <cmd> [args...]', stdout: '', stderr: '' });
} else {
  let out = '';
  let err = '';
  let timedOut = false;
  let error = '';
  const child = spawn(cmd, args, { cwd, env: process.env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const killGroup = (): void => {
    try {
      if (child.pid) process.kill(-child.pid, 'SIGKILL');
    } catch {
      /* already gone */
    }
  };
  const timer = setTimeout(() => {
    timedOut = true;
    killGroup();
  }, Number(timeout));
  child.stdout.on('data', (b: Buffer) => {
    out = (out + b.toString('utf8')).slice(-CAP);
  });
  child.stderr.on('data', (b: Buffer) => {
    err = (err + b.toString('utf8')).slice(-CAP);
  });
  child.on('error', (e) => {
    error = e.message;
  });
  child.on('close', (code, signal) => {
    clearTimeout(timer);
    killGroup(); // stragglers that outlived the leader
    emit({ code: code ?? (error ? 127 : 1), signal, timedOut, error, stdout: out, stderr: err });
  });
}
