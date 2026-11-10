import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { checkMenuIsPhaserFree, checkSizes, chunkName, staticImports, suggestBudget } from '../../tools/ci/size-check';

const budget = { chunks: { index: 100, phaser: 1000 }, totalGzip: 1200 };
const m = (name: string, gzip: number) => ({ name, file: `assets/${name}-AAAAAAAA.js`, gzip });

describe('size-check', () => {
  it('strips content hashes, including hashes that contain dashes', () => {
    expect(chunkName('assets/index-BRhiXssy.js')).toBe('index');
    expect(chunkName('assets/phaser-config-CcWld0us.js')).toBe('phaser-config');
    expect(chunkName('assets/index-qa-ONtr7.css')).toBe('index.css');
    expect(chunkName('assets/logo.png')).toBe('logo.png');
  });

  it('passes within budget and reports over-budget, unbudgeted and vanished chunks', () => {
    expect(checkSizes([m('index', 100), m('phaser', 1000)], { ...budget, totalGzip: 1100 })).toEqual([]);
    expect(checkSizes([m('index', 101), m('phaser', 1000)], budget)[0]).toContain('budget 100');
    expect(checkSizes([m('index', 1), m('phaser', 1), m('extra', 1)], budget)[0]).toContain('no budget');
    expect(checkSizes([m('index', 1)], budget)[0]).toContain('not in dist');
  });

  it('suggests measured plus 10% headroom', () => {
    expect(suggestBudget([m('index', 1000), m('phaser', 2000)]).chunks).toEqual({ index: 1100, phaser: 2200 });
  });

  it('finds static but not dynamic imports', () => {
    expect(staticImports('import{a}from"./x-12345678.js";import"./y.js";await import(`./z.js`);')).toEqual(['./x-12345678.js', './y.js']);
  });

  it('flags a phaser preload and a static phaser import from the entry', () => {
    const root = join(homedir(), 'claudetmp');
    mkdirSync(root, { recursive: true });
    const dist = mkdtempSync(join(root, 'size-check-'));
    mkdirSync(join(dist, 'assets'));
    writeFileSync(join(dist, 'index.html'), '<script type="module" src="/assets/index-AAAAAAAA.js"></script>');
    writeFileSync(join(dist, 'assets/index-AAAAAAAA.js'), 'import"./helper-BBBBBBBB.js";await import(`./phaser-CCCCCCCC.js`);');
    writeFileSync(join(dist, 'assets/helper-BBBBBBBB.js'), 'export{};');
    expect(checkMenuIsPhaserFree(dist)).toEqual([]);
    writeFileSync(join(dist, 'assets/helper-BBBBBBBB.js'), 'import{x}from"./phaser-CCCCCCCC.js";');
    expect(checkMenuIsPhaserFree(dist)[0]).toContain('statically imports the phaser chunk');
    writeFileSync(join(dist, 'index.html'), '<script type="module" src="/assets/index-AAAAAAAA.js"></script><link rel="modulepreload" href="/assets/phaser-CCCCCCCC.js">');
    expect(checkMenuIsPhaserFree(dist).join('\n')).toContain('preloads the phaser chunk');
  });
});
