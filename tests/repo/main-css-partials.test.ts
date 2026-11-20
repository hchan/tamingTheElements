import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readMainCss } from './css-source';

const root = resolve(import.meta.dirname, '../..');
const stylesDir = resolve(root, 'src/ui/styles');
const mainLines = readFileSync(resolve(stylesDir, 'main.css'), 'utf8').split('\n');
const partialFiles = readdirSync(resolve(stylesDir, 'main')).filter((f) => f.endsWith('.css')).sort();
const IMPORT = /^@import '\.\/main\/(\d{2})-([a-z0-9-]+\.css)';$/;
const imports = mainLines.filter((l) => l.startsWith('@import'));

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? tsFiles(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : [],
  );
}

describe('main.css import list', () => {
  it('has only comments, blank lines and relative ./main/NN-name.css imports', () => {
    let inComment = false;
    for (const l of mainLines) {
      const t = l.trim();
      if (inComment) {
        if (t.includes('*/')) inComment = false;
        continue;
      }
      if (t.startsWith('/*')) {
        if (!t.includes('*/')) inComment = true;
        continue;
      }
      if (t === '') continue;
      expect(l, 'main.css may only hold comments and ./main/NN-name.css imports').toMatch(IMPORT);
    }
  });

  it('numbers strictly increase', () => {
    const nums = imports.map((l) => Number(IMPORT.exec(l)?.[1]));
    nums.forEach((n, i) => {
      if (i > 0) expect(n, 'import order is the cascade').toBeGreaterThan(nums[i - 1] as number);
    });
  });

  it('imports exactly the files in src/ui/styles/main/', () => {
    const names = imports.map((l) => {
      const m = IMPORT.exec(l);
      return `${m?.[1] ?? ''}-${m?.[2] ?? ''}`;
    });
    expect([...names].sort()).toEqual(partialFiles);
  });

  it('partials hold no @import, @charset or @layer', () => {
    for (const f of partialFiles) {
      expect(readFileSync(resolve(stylesDir, 'main', f), 'utf8'), f).not.toMatch(/@(import|charset|layer)\b/);
    }
  });

  it('no TypeScript file imports a partial directly', () => {
    for (const f of tsFiles(resolve(root, 'src'))) {
      expect(readFileSync(f, 'utf8'), f).not.toContain('styles/main/');
    }
  });

  it('readMainCss inlines everything', () => {
    expect(readMainCss()).not.toContain('@import');
  });

  it('keeps cascade-critical order', () => {
    const idx = (f: string): number => imports.findIndex((l) => l.includes(`/${f}.css'`));
    const before = (a: string, b: string, why: string): void => {
      expect(idx(a), `${a} must exist`).toBeGreaterThanOrEqual(0);
      expect(idx(a), `${a} must come before ${b}: ${why}`).toBeLessThan(idx(b));
    };
    before('02-menu-controls', '03-main-menu', '.mainMenuList, .mainMenuList li button, .battlegroundOrderContainer');
    before('09-help-first-run', '18-phone-targets', '#firstRunHint coarse-landscape offsets');
    before('01-base', '22-online-live', '--view-h override');
  });
});
