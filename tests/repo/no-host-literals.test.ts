import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// The GPU PC is reached only through an ssh alias (TTE_REMOTE / git config tte.remote). Its address, user and key path live in
// ~/.ssh/config and the owner's memory, never in the repo: these scripts and docs are public.
const ROOTS = ['tools/ci', 'tools/dev', '.github', 'docs/TESTING.md'];

function files(p: string): string[] {
  if (!statSync(p).isDirectory()) return [p];
  return readdirSync(p).flatMap((n) => files(join(p, n)));
}
const all = ROOTS.flatMap(files).filter((f) => !/\.(png|jpe?g|gif|webp|ico|zip|woff2?)$/i.test(f));

const IPV4 = /(?<![\w.])(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}(?![\w.])/g;
const ALLOWED_IP = new Set(['127.0.0.1', '0.0.0.0']);
const USER_AT_HOST = /(?<![\w.-])[a-z_][\w.-]*@(?:\d{1,3}(?:\.\d{1,3}){3}|[a-z0-9-]+(?:\.[a-z0-9-]+)+)(?![\w-])/gi;
const ABS_HOME = /(?:\/Users\/|\/home\/)(?!<|\$|\{|\*|x\b|user\b|name\b)[\w.-]+/g;
const KEY_PATH = /\bid_(?:rsa|ed25519|ecdsa|dsa)\b|\.pem\b|IdentityFile\s+[~/.]\S*/g;

function hits(re: RegExp, keep: (m: string) => boolean = () => true): string[] {
  const out: string[] = [];
  for (const f of all) {
    const text = readFileSync(f, 'utf8');
    for (const m of text.matchAll(re)) if (keep(m[0])) out.push(`${f}: ${m[0]}`);
  }
  return out;
}

describe('no host literals in public tooling', () => {
  it('scans a non-trivial file set', () => {
    expect(all).toContain('tools/dev/remote-run.sh');
    expect(all).toContain('tools/ci/browser-slot.ts');
    expect(all).toContain('docs/TESTING.md');
    expect(all.some((f) => f.startsWith('.github/'))).toBe(true);
  });
  it('has no IPv4 addresses (loopback excepted)', () => {
    expect(hits(IPV4, (m) => !ALLOWED_IP.has(m))).toEqual([]);
  });
  it('has no user@host', () => {
    expect(hits(USER_AT_HOST, (m) => !/@users\.noreply\.github\.com$/.test(m))).toEqual([]);
  });
  it('has no absolute home paths of a real user', () => {
    expect(hits(ABS_HOME)).toEqual([]);
  });
  it('has no ssh key file names', () => {
    expect(hits(KEY_PATH)).toEqual([]);
  });
  it('detects what it should', () => {
    expect('ssh me@192.168.1.5'.match(IPV4)).toEqual(['192.168.1.5']);
    expect('ssh me@box.local'.match(USER_AT_HOST)).toEqual(['me@box.local']);
    expect('/Users/someone/x'.match(ABS_HOME)).toEqual(['/Users/someone']);
    expect('-i ~/.ssh/id_ed25519'.match(KEY_PATH)).toEqual(['id_ed25519']);
  });
});
