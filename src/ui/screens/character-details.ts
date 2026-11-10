import {
  ABILITIES_A,
  ABILITIES_B,
  ABILITY_NAMES,
  BEATS,
  CHARACTERS,
  CHARACTER_TEXT,
  ELEMENTS,
  abilitiesFor,
  describeAbility,
  levelFromXp,
  renderAbilityDescription,
  scaledMaxHealth,
} from '@core/index';
import type { AbilityDef, AbilityDefB, ChapterNumber, Element, GarrisonEntry, SaveV1 } from '@core/index';
import { activeSaveStorage } from '../../game/platform/tester/session';
import { el } from '../dom';
import { loadSave } from './main-menu';
import type { Screen, ScreenFactory } from './screen';

export interface AbilityView {
  readonly id: string;
  readonly name: string;
  /** One plain-text line per stat, from describe.ts. */
  readonly lines: readonly string[];
}

export interface CharacterDetailsView {
  readonly name: string;
  readonly description: string;
  readonly level: number;
  readonly xp: number;
  readonly element: Element;
  readonly alignment: string;
  readonly maxHealth: number;
  readonly speed: number;
  readonly abilities: readonly AbilityView[];
  /** Elements this character's element beats / loses to. */
  readonly strongAgainst: readonly Element[];
  readonly weakAgainst: readonly Element[];
}

const ABILITY_DEFS: ReadonlyMap<string, AbilityDef | AbilityDefB> = new Map(
  [...ABILITIES_A, ...ABILITIES_B].map((a) => [a.id as string, a]),
);

/** Plain-text lines from the legacy HTML-ish description (no markup reaches the DOM). */
export function descriptionLines(def: AbilityDef | AbilityDefB, level: number): string[] {
  return renderAbilityDescription(describeAbility(def, level))
    .split('<br/>')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

export function elementRelations(element: Element): {
  strongAgainst: Element[];
  weakAgainst: Element[];
} {
  const beaten = BEATS[element];
  return {
    strongAgainst: beaten === undefined ? [] : [beaten],
    weakAgainst: ELEMENTS.filter((e) => BEATS[e] === element),
  };
}

type Member = Pick<GarrisonEntry, 'id' | 'characterName' | 'experience'>;

export function findGarrisonEntry(
  save: { readonly garrison: readonly Member[] },
  id: string | null,
): Member | undefined {
  return id === null ? undefined : save.garrison.find((g) => g.id === id);
}

/** Pure view-model; undefined when the character name is not in the data tables. */
export function characterDetails(entry: Member, chapter: ChapterNumber): CharacterDetailsView | undefined {
  const slug = entry.characterName.toLowerCase().replace(/ /g, '-');
  const def = CHARACTERS.find((c) => c.id === slug);
  if (def === undefined) return undefined;
  const level = levelFromXp(entry.experience);
  const abilities: AbilityView[] = [];
  for (const id of abilitiesFor(def, chapter, 'player')) {
    const a = ABILITY_DEFS.get(id);
    if (a === undefined) continue;
    abilities.push({ id, name: ABILITY_NAMES.get(id) ?? id, lines: descriptionLines(a, level) });
  }
  return {
    name: CHARACTER_TEXT.get(def.id)?.name ?? entry.characterName,
    description: CHARACTER_TEXT.get(def.id)?.description ?? '',
    level,
    xp: entry.experience,
    element: def.element,
    alignment: def.alignment,
    maxHealth: scaledMaxHealth(def.maxHealth, level),
    speed: def.speed,
    abilities,
    ...elementRelations(def.element),
  };
}

export interface CharacterDetailsDeps {
  readonly load: () => SaveV1 | null;
}

export function characterDetailsScreen(deps?: CharacterDetailsDeps): ScreenFactory {
  return (param): Screen => {
    let node: HTMLElement | null = null;
    return {
      mount(container) {
        const save = (deps ?? { load: () => loadSave(activeSaveStorage()) }).load();
        const page = el('div', 'menuPage');
        node = page;
        container.append(page);
        const entry = save === null ? undefined : findGarrisonEntry(save, param);
        const v = save === null || entry === undefined ? undefined : characterDetails(entry, save.chapter as ChapterNumber);
        if (v === undefined) {
          page.append(el('h1', 'heading', 'Unknown character'));
        } else {
          page.append(el('h1', 'heading', v.name));
          if (v.description !== '') page.append(el('p', 'raceDescription', v.description));
          const stats = el('div', 'characterStats');
          stats.append(
            el('div', undefined, `Level ${String(v.level)}`),
            el('div', undefined, `XP ${String(v.xp)}`),
            el('div', `element-${v.element}`, `Element: ${v.element}`),
            el('div', undefined, `Alignment: ${v.alignment}`),
            el('div', undefined, `Health: ${String(v.maxHealth)}`),
            el('div', undefined, `Speed: ${String(v.speed)}`),
          );
          page.append(stats);
          const rel = el('div', 'characterRelations');
          rel.append(
            el('div', undefined, `Strong against: ${v.strongAgainst.join(', ') || 'none'}`),
            el('div', undefined, `Weak against: ${v.weakAgainst.join(', ') || 'none'}`),
          );
          page.append(rel);
          for (const a of v.abilities) {
            const box = el('div', 'characterAbility');
            box.append(el('h2', 'heading', a.name));
            for (const line of a.lines) box.append(el('div', undefined, line));
            page.append(box);
          }
        }
        const back = el('a', 'menuLink', 'Back');
        back.setAttribute('href', '#garrison');
        page.append(back);
      },
      unmount() {
        node?.remove();
        node = null;
      },
    };
  };
}
