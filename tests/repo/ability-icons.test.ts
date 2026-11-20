import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = 'public/assets/img/hud/ability-icons';
const TOOL = 'tools/assets/icon-gen/install-ability-icons.py';
const SLOTS = ['hurl_rock', 'lure_orb', 'skitter', 'slow', 'hoof_crash', 'talon_rake'];
interface Entry { url: string; w: number; h: number; sha256: string; pack_icon: string; approval: { reviewer: string; beats_shipped: boolean } }
interface Approval { approved: string; reviewer: string; beats_shipped: boolean; date: string }
const index = JSON.parse(readFileSync(`${DIR}/index.json`, 'utf8')) as { licence: string; icons: Record<string, Entry> };
const approval = JSON.parse(readFileSync('tools/assets/icon-gen/provenance/approval.json', 'utf8')) as Record<string, Approval>;
const PNG_SIG = '89504e470d0a1a0a';

describe('ability icons (tools/assets/icon-gen)', () => {
  it('has exactly one PNG per slot, 64 px, matching the committed art-director approval and the index sha256', () => {
    expect(Object.keys(index.icons).sort()).toEqual([...SLOTS].sort());
    expect(readdirSync(DIR).filter((f) => f.endsWith('.png')).sort()).toEqual(SLOTS.map((s) => `${s}.png`).sort());
    for (const slot of SLOTS) {
      const e = index.icons[slot];
      const a = approval[slot];
      expect(a?.reviewer, slot).toBe('art-director');
      expect(a?.beats_shipped, slot).toBe(true);
      expect(e?.pack_icon, slot).toBe(a?.approved);
      expect(e?.url, slot).toBe(`img/hud/ability-icons/${slot}.png`);
      const bytes = readFileSync(`${DIR}/${slot}.png`);
      expect(bytes.subarray(0, 8).toString('hex'), slot).toBe(PNG_SIG);
      expect(createHash('sha256').update(bytes).digest('hex'), slot).toBe(e?.sha256);
      expect([bytes.readUInt32BE(16), bytes.readUInt32BE(20)], slot).toEqual([64, 64]);
    }
  });
  it('records the CC-BY 3.0 attribution next to the art', () => {
    expect(index.licence).toBe('CC-BY 3.0');
    const credits = readFileSync(`${DIR}/CREDITS.txt`, 'utf8');
    expect(credits).toContain('J. W. Bjerk (eleazzaar)');
    expect(credits).toContain('CC-BY 3.0');
  });
});

describe('install-ability-icons.py fails closed', () => {
  const work = join('.scratch', `tte-icons-${String(process.pid)}`);
  const run = (approvals: Record<string, unknown>, files: boolean): { status: number | null; out: string } => {
    mkdirSync(work, { recursive: true });
    const src = join(work, files ? 'src' : 'empty');
    mkdirSync(src, { recursive: true });
    if (files) {
      for (const slot of SLOTS) {
        const a = approval[slot];
        if (!a) continue;
        writeFileSync(join(src, `${slot}-c1-${a.approved}.png`), readFileSync(`${DIR}/${slot}.png`));
      }
    }
    const file = join(work, 'approval.json');
    writeFileSync(file, JSON.stringify(approvals));
    const r = spawnSync('python3', ['-I', TOOL, src, file, '--check'], { encoding: 'utf8' });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  it('accepts the real approval with its candidates', () => {
    expect(existsSync(TOOL)).toBe(true);
    expect(run(approval, true).status).toBe(0);
  });
  it.each([
    ['wrong reviewer', { reviewer: 'owner' }],
    ['beats_shipped not true', { beats_shipped: 'true' }],
    ['missing approved', { approved: undefined }],
  ])('refuses %s', (_name, patch) => {
    const bad = { ...approval, slow: { ...approval['slow'], ...patch } };
    expect(run(bad, true).status).not.toBe(0);
  });
  it('refuses when no candidate file exists', () => {
    expect(run(approval, false).status).not.toBe(0);
  });
});
