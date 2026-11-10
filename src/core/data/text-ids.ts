import { abilityId, characterId } from './ids';
import type { AbilityId, CharacterId } from './ids';

/** Display strings only (text.json); the sim never reads this module. */
export const CHARACTER_TEXT: ReadonlyMap<CharacterId, { readonly name: string; readonly description: string }> = new Map([
  [characterId('curomo'), { name: "Curomo", description: "A race of water serpents.  They have rarely travelled above water, but have been more frequently since the imbalance" }],
  [characterId('cyclonius'), { name: "Cyclonius", description: "A race of Wind creatures born as sons from the Air Titan.  They are determined to make their lineage proud.  However, their over-zealous  ambitions have twisted their ideals for their quest for power and have caused them to slowly lose their sanity..." }],
  [characterId('dummy'), { name: "Dummy", description: "Dummy Target - not very useful in combat, but great in practice" }],
  [characterId('echo'), { name: "Echo", description: "A race of beings with no emotions.  Tho their life spans are short, they are known to travel many miles in their lifetime." }],
  [characterId('eternal-void'), { name: "Eternal Void", description: "Last Boss" }],
  [characterId('fiara'), { name: "Fiara", description: "A cousin of phoenixes.  They are fierce but yet uphold truth and justice" }],
  [characterId('ishimi'), { name: "Ishimi", description: "One of the newer races inPria.  Although gross in nature, these slime-like creatures have developed a symbiotic relationship with the oceans and rivers in Pria" }],
  [characterId('lavax'), { name: "Lavax", description: "A race born in molten.  They are good friends with rokcores, but would rather stay neutral over the battles in Pria" }],
  [characterId('morblass'), { name: "Morblass", description: "Little is known of this race.  What is known is that they are guardians to the oceans in Pria" }],
  [characterId('pax'), { name: "Pax", description: "A race of rock creatures that were born in the center of Pria.  They were once guardions of this planet, but having seen so much destruction over the millennium, their desire is now rule Pria" }],
  [characterId('rokcore'), { name: "Rokcore", description: "A race of stone golems.  They are the cousins of paxes, and they still believe in peace above everything else" }],
  [characterId('sindarosa'), { name: "Sindarosa", description: "A race of red dragons born in the depths of molten lava.  They have little respect for mankind and are one of the first races born in Pria" }],
  [characterId('treenoc'), { name: "Treenoc", description: "An ancient race in Pria.  These tree-like creatures hardly move, but when the unbalance first unfolded they were amongst the first races to notice it." }],
  [characterId('wispera'), { name: "Wispera", description: "Air creatures that neither sleep or rest" }],
]);

/** Ability display names; legacy text.json has no ability descriptions (all null). */
export const ABILITY_NAMES: ReadonlyMap<AbilityId, string> = new Map([
  [abilityId('adrenaline'), "Adrenaline"],
  [abilityId('capture'), "Capture"],
  [abilityId('chaos-bolt'), "Chaos Bolt"],
  [abilityId('chaos-orb'), "Chaos Orb"],
  [abilityId('circus-of-slime'), "Circus of Slime"],
  [abilityId('crimson-fire'), "Crimson Fire"],
  [abilityId('elemental-advantage-fire-cone'), "Elemental Advantage : Fire cone"],
  [abilityId('entangling-vines'), "Entangling Vines"],
  [abilityId('fade'), "Fade"],
  [abilityId('fire-blast'), "Fire Blast"],
  [abilityId('fire-dance'), "Fire Dance"],
  [abilityId('fire-heal'), "Fire Heal"],
  [abilityId('fireball'), "Fireball"],
  [abilityId('ground-shock'), "Ground Shock"],
  [abilityId('hurl-rock'), "Hurl Rock"],
  [abilityId('hurricane'), "Hurricane"],
  [abilityId('ice-blast'), "Ice Blast"],
  [abilityId('ice-shock'), "Ice Shock"],
  [abilityId('icicles'), "Icicles"],
  [abilityId('rock-armour'), "Rock Armour"],
  [abilityId('rock-pellet'), "Rock Pellet"],
  [abilityId('shards-of-ice'), "Shards of Ice"],
  [abilityId('slime-blast'), "Slime Blast"],
  [abilityId('sonar-blast'), "Sonar Blast"],
  [abilityId('steal-health'), "Steal Health"],
  [abilityId('stick'), "Stick"],
  [abilityId('strangling-branches'), "Strangling Branches"],
  [abilityId('tornado'), "Tornado"],
  [abilityId('translucent-flame'), "Translucent Flame"],
  [abilityId('wind-cone'), "Wind Cone"],
]);
