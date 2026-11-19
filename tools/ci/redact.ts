import { spawnSync } from 'node:child_process';

type Env = Readonly<Record<string, string | undefined>>;

/** Remote alias: TTE_REMOTE, else `git config tte.remote`. */
export function remoteAlias(env: Env, cwd = process.cwd()): string | undefined {
  const e = env['TTE_REMOTE']?.trim();
  if (e) return e;
  const r = spawnSync('git', ['config', '--get', 'tte.remote'], { cwd, encoding: 'utf8' });
  const v = r.status === 0 ? r.stdout.trim() : '';
  return v || undefined;
}

/** Hide addresses, user@host and home paths: output gets pasted into ideas and commits. */
export function redact(s: string): string {
  return s
    .replace(/(?<![\w.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\w.])/g, '<addr>')
    .replace(/(?<![\w.-])[\w.-]+@[\w-]+(?:\.[\w-]+)+/g, '<user@host>')
    .replace(/\/home\/[\w.-]+\//g, '~/')
    .replace(/\/Users\/[\w.-]+\//g, '~/');
}
