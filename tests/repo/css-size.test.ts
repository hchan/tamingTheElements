import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '../..');
const MAX_LINES = 800;

function cssFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? cssFiles(join(dir, e.name)) : e.name.endsWith('.css') ? [join(dir, e.name)] : [],
  );
}

describe('CSS file size', () => {
  const files = [...cssFiles(resolve(root, 'src')), ...cssFiles(resolve(root, 'public/assets/css'))];
  it('finds CSS files', () => {
    expect(files.length).toBeGreaterThan(10);
  });
  it.each(files.map((f) => f.slice(root.length + 1)))('%s is at most 800 lines', (rel) => {
    const lines = readFileSync(resolve(root, rel), 'utf8').split('\n').length;
    expect(lines, `${rel} has ${String(lines)} lines (cap ${String(MAX_LINES)}): split it by area, keeping rule order (see src/ui/styles/main.css)`).toBeLessThanOrEqual(MAX_LINES);
  });
});
