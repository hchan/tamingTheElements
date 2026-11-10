// Fills the <!-- gen:NAME --> ... <!-- /gen:NAME --> blocks in docs/GAME-DESIGN.md from src/core/data.
// Run with `pnpm docs:gen`. tests/repo/docs-tables.test.ts fails when the doc is stale.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ABILITIES_A } from '../../src/core/data/abilities-a';
import { ABILITIES_B } from '../../src/core/data/abilities-b';
import { CHAPTERS } from '../../src/core/data/chapters';
import type { Objective } from '../../src/core/data/chapters';
import { CHARACTERS } from '../../src/core/data/characters';
import { ELEMENTS, elementRelation } from '../../src/core/data/elements';
import { ABILITY_NAMES, CHARACTER_TEXT } from '../../src/core/data/text-ids';
import type { AbilityDef } from '../../src/core/data/types';

const root = resolve(import.meta.dirname, '../..');
export const DOC_PATH = resolve(root, 'docs/GAME-DESIGN.md');

const MULT = { adv: '1.25', dis: '0.8', neutral: '1' } as const;

function table(header: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]): string => `| ${cells.join(' | ')} |`;
  return [line(header), line(header.map(() => '---')), ...rows.map(line)].join('\n');
}

function abilityName(id: string): string {
  return ABILITY_NAMES.get(id as never) ?? id;
}

function dash(n: number | undefined): string {
  return n === undefined ? '-' : String(n);
}

function objective(o: Objective): string {
  switch (o.kind) {
    case 'levelAtLeastFirst':
      return `first elemental reaches level ${String(o.level)}`;
    case 'garrisonSizeAtLeast':
      return `garrison >= ${String(o.size)}`;
    case 'countAtLevel':
      return `${String(o.count)} elementals at level ${String(o.level)}`;
    case 'defeatBoss':
      return 'defeat the Eternal Void';
  }
}

function elements(): string {
  const rows = ELEMENTS.map((att) => [att, ...ELEMENTS.map((def) => MULT[elementRelation(att, def)])]);
  return table(['Attacker \\ Defender', ...ELEMENTS], rows);
}

function characters(): string {
  const rows = CHARACTERS.map((c) => [
    CHARACTER_TEXT.get(c.id)?.name ?? c.id,
    c.element,
    c.alignment,
    String(c.speed),
    String(c.maxHealth),
    c.abilities.map(abilityName).join(', '),
  ]);
  return table(['Race', 'Element', 'Alignment', 'Speed', 'HP', 'Abilities'], rows);
}

function abilities(): string {
  const all: readonly AbilityDef[] = [...ABILITIES_A, ...ABILITIES_B];
  const rows = all.map((a) => {
    const users = CHARACTERS.filter((c) => c.abilities.includes(a.id)).map(
      (c) => CHARACTER_TEXT.get(c.id)?.name ?? c.id,
    );
    return [
      abilityName(a.id),
      a.kind,
      a.damage === Number.MAX_VALUE ? 'inf' : dash(a.damage ?? a.heal),
      String(a.cooldownMs),
      dash(a.durationMs),
      String(a.maxActive),
      dash(a.speed),
      a.kind === 'capture' ? 'all players from chapter 2' : users.length > 0 ? users.join(', ') : 'unused',
    ];
  });
  return table(['Ability', 'Kind', 'Dmg/Heal', 'Cooldown ms', 'Dur ms', 'Max', 'Speed', 'Used by'], rows);
}

function chapters(): string {
  const rows = CHAPTERS.map((c) => [
    String(c.chapter),
    c.maxXp === null ? '-' : String(c.maxXp),
    c.xpGain.min === c.xpGain.max ? String(c.xpGain.min) : `${String(c.xpGain.min)}-${String(c.xpGain.max)}`,
    c.objectives.length > 0 ? c.objectives.map(objective).join(' and ') : '-',
  ]);
  return table(['Chapter', 'XP cap', 'XP/win', 'Objective'], rows);
}

export const GENERATORS: Readonly<Record<string, () => string>> = { elements, characters, abilities, chapters };

/** Replace the body of every known gen block in `md`; throws if a block is missing. */
export function applyTables(md: string): string {
  let out = md;
  for (const [name, render] of Object.entries(GENERATORS)) {
    const re = new RegExp(`(<!-- gen:${name} -->\\n)[\\s\\S]*?(<!-- /gen:${name} -->)`);
    if (!re.test(out)) throw new Error(`GAME-DESIGN.md is missing gen block "${name}"`);
    const body = render();
    out = out.replace(re, (_m, open: string, close: string) => `${open}${body}\n${close}`);
  }
  return out;
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === import.meta.filename) {
  const current = readFileSync(DOC_PATH, 'utf8');
  const next = applyTables(current);
  if (next !== current) writeFileSync(DOC_PATH, next);
}
