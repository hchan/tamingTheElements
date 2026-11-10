import { abilityId, characterId } from './ids';
import type { CharacterId } from './ids';
import type { CharacterDef } from './types';

function def(
  slug: string,
  d: Omit<CharacterDef, 'id' | 'abilities'>,
  abilities: readonly string[],
): CharacterDef {
  return { id: characterId(slug), ...d, abilities: abilities.map(abilityId) };
}

/** The 14 legacy characters (data.json). Display text lives in text-ids.ts. */
export const CHARACTERS: readonly CharacterDef[] = [
  def('curomo', { element: 'water', alignment: 'good', maxHealth: 100, speed: 6, sprite: 'curomo' }, ['ice-shock', 'shards-of-ice']),
  def('cyclonius', { element: 'air', alignment: 'evil', maxHealth: 100, speed: 7, sprite: 'cyclonius' }, ['tornado', 'wind-cone']),
  def('dummy', { element: 'void', alignment: 'neutral', maxHealth: 100, speed: 0.2, sprite: 'dummyTarget' }, ['stick']),
  def('echo', { element: 'air', alignment: 'neutral', maxHealth: 100, speed: 6, sprite: 'echo' }, ['fade', 'hurricane']),
  def('eternal-void', { element: 'void', alignment: 'evil', maxHealth: 1000, speed: 8, sprite: 'eternalVoid' }, ['chaos-bolt', 'chaos-orb']),
  def('fiara', { element: 'fire', alignment: 'good', maxHealth: 130, speed: 7, sprite: 'fiara' }, ['fire-heal', 'fireball']),
  def('ishimi', { element: 'water', alignment: 'neutral', maxHealth: 100, speed: 7, sprite: 'ishimi' }, ['circus-of-slime', 'slime-blast']),
  def('lavax', { element: 'fire', alignment: 'neutral', maxHealth: 100, speed: 6, sprite: 'lavax' }, ['crimson-fire', 'fire-dance']),
  def('morblass', { element: 'water', alignment: 'good', maxHealth: 100, speed: 7, sprite: 'morblass' }, ['ice-blast', 'icicles']),
  def('pax', { element: 'earth', alignment: 'evil', maxHealth: 150, speed: 5, sprite: 'pax' }, ['adrenaline', 'ground-shock']),
  def('rokcore', { element: 'earth', alignment: 'good', maxHealth: 120, speed: 7, sprite: 'rokcore' }, ['rock-armour', 'rock-pellet']),
  def('sindarosa', { element: 'fire', alignment: 'evil', maxHealth: 100, speed: 7, sprite: 'sindarosa' }, ['fire-blast', 'translucent-flame']),
  def('treenoc', { element: 'earth', alignment: 'neutral', maxHealth: 90, speed: 6, sprite: 'treenoc' }, ['entangling-vines', 'strangling-branches']),
  def('wispera', { element: 'air', alignment: 'good', maxHealth: 100, speed: 5, sprite: 'wispera' }, ['sonar-blast', 'steal-health']),
];

const BY_ID = new Map<CharacterId, CharacterDef>(CHARACTERS.map((ch) => [ch.id, ch]));

export function getCharacter(id: CharacterId): CharacterDef {
  const ch = BY_ID.get(id);
  if (!ch) throw new Error(`unknown character "${id}"`);
  return ch;
}
