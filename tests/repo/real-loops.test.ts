import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const PROV = resolve(ROOT, 'tools/assets/fx-gen/provenance/real-loops.json');

interface Loop { source: string; sourceSha256: string; output: string; outputSha256: string; frames: number; frame: number; frameSha256: string[] }
const prov = JSON.parse(readFileSync(PROV, 'utf8')) as { note: string; loops: Record<string, Loop> };
const superseded = (JSON.parse(readFileSync(resolve(ROOT, 'tools/assets/loop-proc/provenance.json'), 'utf8')) as { loops: Record<string, unknown> }).loops; // installed over by loop-proc/install.py (pinned in loop-proc.test.ts)
const sha = (p: string): string => createHash('sha256').update(readFileSync(resolve(ROOT, p))).digest('hex');

describe('real roster24 loop strips (batch-m-real-loops.py)', () => {
  it('covers the four abilities and records the licence note', () => {
    expect(Object.keys(prov.loops).sort()).toEqual(['boulderRoll', 'cinderSpray', 'sporeBurst', 'stingingFilament']);
    expect(prov.note).toMatch(/AI-generated in-project.*no third-party licence/);
  });

  it.each(Object.entries(prov.loops))('%s strip and source still match the pin', (name, l) => {
    expect(existsSync(resolve(ROOT, l.source))).toBe(true);
    expect(sha(l.source)).toBe(l.sourceSha256);
    if (!(name in superseded)) expect(sha(l.output)).toBe(l.outputSha256);
    const b = readFileSync(resolve(ROOT, l.output));
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([l.frame * l.frames, l.frame]);
  });

  it.each(Object.entries(prov.loops))('%s has at least 4 distinct frames (pulse and two-ring loops repeat symmetric phases)', (_name, l) => {
    expect(l.frameSha256).toHaveLength(8);
    expect(new Set(l.frameSha256).size).toBeGreaterThanOrEqual(4);
  });
});
