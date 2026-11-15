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
  // Roster-24 batch 1 (not in legacy text.json).
  [characterId('kindrel'), { name: "Kindrel", description: "A small ember-fox that darts through a fight, biting fast and leaving a ring of cinders behind." }],
  [characterId('nykra'), { name: "Nykra", description: "A water-horse of the dark tarns. It crashes in with its hooves and lashes from afar with kelp." }],
  [characterId('quarrak'), { name: "Quarrak", description: "A slow stone quadruped, huge and patient, that rolls boulders across the arena." }],
  [characterId('brazgor'), { name: "Brazgor", description: "A hulking forge-boar, slag-skinned and slow. It gores like a hammer and wears armour that burns whatever strikes it." }],
  [characterId('glimmaw'), { name: "Glimmaw", description: "An abyssal anglerfish that hangs lights in the dark and bites whatever follows them." }],
  [characterId('durrok'), { name: "Durrok", description: "An armoured tusker of the deep tunnels. It lunges, gores and stomps the ground bristling." }],
  [characterId('zephra'), { name: "Zephra", description: "A tiny storm-wisp, quick as a spark, that pelts from afar and skitters out of reach." }],
  [characterId('ouroth'), { name: "Ouroth", description: "A coiled fire-wyrm of the old forges. It seizes foes in its length and hurls them away, breathing flame down the arena." }],
  [characterId('abyssor'), { name: "Abyssor", description: "A kraken from the lightless trench. Its long arms lash across the arena and drag foes into its reach." }],
  [characterId('vortigal'), { name: "Vortigal", description: "A raptor of the high winds that dives from above and rakes wounds that keep on bleeding." }],
  [characterId('umbrel'), { name: "Umbrel", description: "A walking fungus of the deep caves. It spits festering spores and mends itself from the rot." }],
  [characterId('hyalia'), { name: "Hyalia", description: "A drifting jellyfish of the high winds. Its filaments sting and its bell pushes foes away." }],
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
  [abilityId('ember-bite'), "Ember Bite"],
  [abilityId('cinder-spray'), "Cinder Spray"],
  [abilityId('hoof-crash'), "Hoof Crash"],
  [abilityId('kelp-lash'), "Kelp Lash"],
  [abilityId('boulder-roll'), "Boulder Roll"],
  [abilityId('stinging-filament'), "Stinging Filament"],
  [abilityId('bell-pulse'), "Bell Pulse"],
  [abilityId('forge-gore'), "Forge Gore"],
  [abilityId('molten-hide'), "Molten Hide"],
  [abilityId('lure-orb'), "Lure Orb"],
  [abilityId('abyss-flash'), "Abyss Flash"],
  [abilityId('tusk-gore'), "Tusk Gore"],
  [abilityId('bristle-stomp'), "Bristle Stomp"],
  [abilityId('static-mote'), "Static Mote"],
  [abilityId('skitter'), "Skitter"],
  [abilityId('wyrm-coil'), "Wyrm Coil"],
  [abilityId('scorch-breath'), "Scorch Breath"],
  [abilityId('tentacle-lash'), "Tentacle Lash"],
  [abilityId('abyssal-pull'), "Abyssal Pull"],
  [abilityId('stoop'), "Stoop"],
  [abilityId('talon-rake'), "Talon Rake"],
  [abilityId('spore-burst'), "Spore Burst"],
  [abilityId('mycelium-mend'), "Mycelium Mend"],
]);

/** Snag (FUN-DESIGN 2.20): the name and line of the rope throw on a hero's ARCADE_SNAG_SLOT (data/arcade.ts). */
export const SNAG_NAME = 'Snag';
export const SNAG_DESCRIPTION = 'Throws a rope that roots the foe for a moment: no walking, Dash or Charge. Fire burns it.';

/** Traps (WP 39): the button word, and the name and line of each kind, indexed by `TrapKind` (data/arcade.ts; 0 = none). */
export const TRAP_WORD = 'Trap';
export const TRAP_NAMES: readonly string[] = ['', 'Fire Bomb', 'Puddle', 'Spike', 'Gust'];
export const TRAP_DESCRIPTIONS: readonly string[] = [
  '',
  'Plants a bomb ahead that arms after a moment, then blasts a foe who steps near, or blows up when its fuse runs out.',
  'Plants a puddle ahead that slows a foe walking through it. Dash through it; fire dries it up.',
  'Plants a spike ahead that stabs a foe who steps on it, stunning longer than a normal hit.',
  'Plants a gust ahead that shoves a foe who steps near it far away. Fire burns it.',
];
