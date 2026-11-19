import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(import.meta.dirname, '../../src/ui/styles/online-screen.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

interface Rule { readonly selectors: string[]; readonly body: string }

function rules(text: string): Rule[] {
  const out: Rule[] = [];
  for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const head = (m[1] ?? '').trim();
    if (head.startsWith('@')) continue;
    out.push({ selectors: head.split(',').map((s) => s.trim()), body: m[2] ?? '' });
  }
  return out;
}

describe('online-screen.css', () => {
  const all = rules(css);
  it('has rules, each selector scoped under #menu .onlineScreen or .onlineQuick/.onlineLive', () => {
    expect(all.length).toBeGreaterThan(5);
    for (const r of all) for (const s of r.selectors) expect(s, s).toMatch(/^#menu \.online(Screen|Quick|P2p|Live)/);
  });
  it('every element given a display value has a [hidden] display:none rule', () => {
    const hiddenBases = new Set(all.filter((r) => /display:\s*none/.test(r.body)).flatMap((r) => r.selectors.filter((s) => s.includes('[hidden]')).map((s) => s.replace('[hidden]', ''))));
    for (const r of all) {
      if (!/(^|;|\s)display:\s*(?!none)/.test(r.body)) continue;
      for (const s of r.selectors) {
        if (s.includes('[hidden]') || s.includes('::')) continue;
        // Only elements the screens toggle with `hidden`: buttons and the picker.
        if (/button\.onlineBig$|#quickPick$/.test(s)) expect(hiddenBases.has(s), s).toBe(true);
      }
    }
  });
});
