// Headless replay verifier (`pnpm replay:verify <file...>`): re-simulates each replay and fails on a hash mismatch.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { SIM_VERSION, verifyReplayLog } from '../src/core/index';

export interface Verification {
  readonly ok: boolean;
  readonly message: string;
}

export function verifyReplayText(json: string): Verification {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch (e) {
    return { ok: false, message: `ERROR ${e instanceof Error ? e.message : String(e)}` };
  }
  const v = verifyReplayLog(raw, { simVersion: SIM_VERSION });
  if (v.ok) return { ok: true, message: `OK (${String(v.tickCount)} ticks)` };
  return { ok: false, message: v.kind === 'invalid' ? `ERROR ${v.message}` : v.message };
}

export function main(files: readonly string[]): number {
  if (files.length === 0) {
    console.error('usage: pnpm replay:verify <file.replay.json...>');
    return 2;
  }
  let failed = 0;
  for (const f of files) {
    const r = verifyReplayText(readFileSync(f, 'utf8'));
    console.log(`${r.ok ? 'PASS' : 'FAIL'} ${f}: ${r.message}`);
    if (!r.ok) failed++;
  }
  return failed === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
