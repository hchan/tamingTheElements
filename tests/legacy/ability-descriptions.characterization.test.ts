import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadLegacy } from '@testing/legacy/load-legacy';

/**
 * Captures the real legacy ability description strings (GameHelper.getAbilityDescription via each
 * ability component's getDescription) for every ability at levels 0, 5, 10, 15 and 20.
 * Run with TTE_UPDATE_FIXTURES=1 to (re)write tests/fixtures/legacy/ability-descriptions.json.
 */
const FIXTURE = resolve(import.meta.dirname, '../fixtures/legacy/ability-descriptions.json');
const UPDATE = process.env['TTE_UPDATE_FIXTURES'] === '1';
const LEVELS = [0, 5, 10, 15, 20] as const;

type Obj = Record<string, unknown>;
type Component = Obj & { getDescription?: (level: number) => string; defaults: Obj };

const env = loadLegacy({ seed: 1 });
const { GameHelper } = env.globals;
const abilities = GameHelper['abilities'] as Record<string, { component: Component }>;
const getAbilityDescription = GameHelper['getAbilityDescription'] as (c: Component, level: number) => string;

function capture(): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const name of Object.keys(abilities).sort()) {
    const component = abilities[name]?.component as Component;
    const byLevel: Record<string, string> = {};
    for (const level of LEVELS) {
      byLevel[String(level)] =
        typeof component.getDescription === 'function'
          ? component.getDescription.call(component, level)
          : getAbilityDescription.call(GameHelper, component, level);
    }
    out[name] = byLevel;
  }
  return out;
}

describe('legacy ability description characterization', () => {
  it('matches ability-descriptions.json', () => {
    const actual = capture();
    expect(Object.keys(actual)).toHaveLength(30);
    if (UPDATE) writeFileSync(FIXTURE, `${JSON.stringify(actual, null, 1)}\n`);
    expect(existsSync(FIXTURE), 'fixture missing: run with TTE_UPDATE_FIXTURES=1').toBe(true);
    expect(actual).toEqual(JSON.parse(readFileSync(FIXTURE, 'utf8')));
  });
});
