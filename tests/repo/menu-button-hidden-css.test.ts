import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const main = readFileSync(resolve(import.meta.dirname, '../../src/ui/styles/main.css'), 'utf8');

describe('hidden menu buttons', () => {
  it('button.menuButton sets display, so [hidden] needs its own display:none rule', () => {
    expect(main).toMatch(/button\.menuButton\[hidden\][^{]*\{\s*display:\s*none;/);
  });
});
