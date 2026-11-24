import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '../..');
const sha = (p: string): string => createHash('sha256').update(readFileSync(resolve(ROOT, p))).digest('hex');
interface Row { strip: string; stripSha256: string; output: string; outputSha256: string }
const prov = JSON.parse(readFileSync(resolve(ROOT, 'tools/assets/loop-proc/provenance.json'), 'utf8')) as { loops: Record<string, Row> };
const approval = JSON.parse(readFileSync(resolve(ROOT, 'tools/assets/loop-proc/approval.json'), 'utf8')) as Record<string, { approved: string; reviewer: string; beats_shipped: boolean }>;

describe('procedural roster24 loop strips (tools/assets/loop-proc/install.py)', () => {
  it('installs exactly the five approved strips', () => {
    expect(Object.keys(prov.loops).sort()).toEqual(['abyssalPull', 'boulderRoll', 'cinderSpray', 'sporeBurst', 'stingingFilament']);
  });
  it.each(Object.entries(prov.loops))('%s is approved, and strip and installed output match the pins', (name, r) => {
    const a = approval[`loop_${name}`];
    expect(a?.reviewer).toBe('art-director');
    expect(a?.beats_shipped).toBe(true);
    expect(r.strip).toBe(`tools/assets/loop-proc/strips/${a?.approved}`);
    expect(sha(r.strip)).toBe(r.stripSha256);
    expect(sha(r.output)).toBe(r.outputSha256);
    const b = readFileSync(resolve(ROOT, r.output));
    expect([b.readUInt32BE(16), b.readUInt32BE(20)]).toEqual([1280, 160]);
  });
});
