# Action bar rethink and hero kits (design, WP1)

Status: design plus a view-only prototype. No `src/core` change. Source idea:
[ideas/brainstorm/action-bar-rethink-hero-kits.md](../../ideas/brainstorm/action-bar-rethink-hero-kits.md). Related ideas:
[bomb-traps](../../ideas/brainstorm/bomb-traps.md), [summon-temporary-minions](../../ideas/brainstorm/summon-temporary-minions.md),
[elemental-cleanse](../../ideas/brainstorm/elemental-cleanse.md). Game code names (Arcade ruleset, `Cmd.trap`) never reach players;
the player-facing word for the third slot is the hero's own thing name below.

## 1. What exists today (read from `src/core/data`, `src/game/hud/action-bar.ts`)

- Hero slots (`characters.ts`, two abilities each): curomo ice-shock / shards-of-ice, ishimi circus-of-slime / slime-blast, morblass
  ice-blast / icicles, cyclonius tornado / wind-cone, echo fade / hurricane, wispera sonar-blast / steal-health, fiara fire-heal /
  fireball, lavax crimson-fire / fire-dance, sindarosa fire-blast / translucent-flame, pax adrenaline / ground-shock, rokcore
  rock-armour / rock-pellet, treenoc entangling-vines / strangling-branches.
- Arcade bar boxes today, one flat row in this order: ability 1, ability 2, (Snag), Tag, Tag, Charge (melee only), Weather, Dash, Guard,
  Super, Trap, Element. Keys (`bindings.ts`): 1 and 2 abilities, 3 / 4 Tag, 5 Charge, 6 Weather, 7 Dash, 8 Guard, 9 Super, 0 Trap, `-`
  elemental, plus letters C Snag, H Charge, R Weather, E Dash, Q Guard, X Super, Z Trap, V elemental.
- The Trap is one global mechanic per element (`arcade.ts` `TrapKind`: Fire Bomb, Puddle, Spike, Gust; plant 72 px ahead, arm 30 ticks,
  life 120-250 ticks, cooldown 500 ticks, team cap 2, minimum gap 64 px). The elemental ability is per element (Ember, Cleanse (water,
  ends roots and slows), Stoneskin, Gale; 25 s to 35 s cooldown). There is no minion entity yet.
- One cooldown renderer already exists (`cooldownLook` + `ActionBarView.drawCooldown`): clockwise shade, bone ready flash, static shade
  under reduced motion. Every new slot must go through it.

## 2. Bar model

Four common slots, identical for every hero (same key, same icon family, same renderer), then the hero's three:

| Group | Slot | Notes |
| --- | --- | --- |
| COMMON | Guard | as today (hold; meter 0..1000) |
| COMMON | Cleanse | new, 10 s (500 ticks) for all four elements, per [elemental-cleanse](../../ideas/brainstorm/elemental-cleanse.md); water drop, fire burn-off, earth shell break, air gust |
| COMMON | Elemental | the element's own ability (Ember, Stoneskin, Gale; water's Cleanse is then the common Cleanse, so water gets a new common elemental, proposed: Undertow, a short pull toward the caster, same 1250 tick cooldown) |
| COMMON | Weather | change weather with its animation (today a charge meter, `WEATHER_CHARGE_FULL`) |
| HERO | 1, 2 | the two signature abilities, unchanged |
| HERO | 3 | the signature trap or minion (section 4), replacing the global Trap |
| TEAM | Tag, Snag, Charge, Dash, Super | unchanged boxes, kept apart so the common and hero groups read at a glance |

### Hotkey map (OWNER DECISION 2026-11-13, replaces the earlier "keep every key" recommendation)

Owner: hero slot 3 is literally key 3; Tag moves to the end of the number row; "traps, changing weather, special should go before that", "everything down". The exact Tag keys were left loose ("9, 0, maybe 6, 7, you get the idea"); the table below puts Tag at 9 and 0 and is a one-line change if the owner prefers 6 and 7.

| Key | Slot |
| --- | --- |
| 1, 2 | hero ability 1, 2 |
| 3 | hero slot 3 (signature trap or minion; the old Trap key 0 moves here) |
| 4 | Weather |
| 5 | Super (special) |
| 6 | Guard |
| 7 | Dash |
| 8 | Charge (melee only) |
| 9, 0 | Tag |
| `-` | common elemental |
| `=` | Cleanse |

Letter aliases follow the slot, not the digit. Default bindings migrate once (stored custom bindings are kept; add a version flag and show the change in Help and the first-run card). Implementation work package: `bindings.ts`, `key-map.ts`, `bar-groups.ts` order, touch overlay order, Help and first-run hint key lookups, tests and e2e that press keys by number. Do it after the Cleanse sim lands (it adds the Cleanse slot).

## 3. Constraints for every trap and minion

- Elemental, non-humanoid, grim and desaturated (see art memory): beasts, growths, vents, cairns, never people.
- Sim: one new entity kind `minion` (owner, expiry tick, hp, Int32Array only) for the minions; traps reuse the trap entities. Cooldown
  500 to 700 ticks, team cap 1 to 2, never more than 2 live things per team. No `Math.random`; any choice uses the seeded stream.
- Counterplay always available: Guard blocks the hit (chip 25%), Dash escapes a trap radius, the new Cleanse removes root, slow, burn
  and freeze, fire burns plant and web things (`TrapReason.doused` generalised to `burned`), and every thing has a visible countdown
  ring and dies on the owner's KO.
- Each needs an animation (cast, idle, trigger, death, reduced-motion static variant) and one Web Audio synth sound (cast, trigger).
- "Cost": there is no mana, so cost is the cooldown plus the cap, plus an HP tithe for minions (the summoner pays, so spamming is
  risky). Numbers are first guesses for the balance pass (WP 4).

## 4. Per-hero signature (slot 3)

Ticks are 50 Hz game ticks (500 ticks = 10 s). Base damage numbers are before the race damage multiplier and element chart.

### Water

| Hero | Name | Kind | Behaviour | Cost, cooldown, cap | Counterplay | Animation | Sound |
| --- | --- | --- | --- | --- | --- | --- | --- |
| curomo | Brine Leech | minion | A pale eel-like leech crawls at 70% hero speed to the foe, latches for 150 ticks: slow 30% and 1 hp per 10 ticks; dies after 250 ticks or 12 hp | 5 hp tithe, 600 ticks, 1 | Cleanse or Dash breaks the latch; any hit kills it; fire evaporates it | Rises from a puddle, ripples, coils on the foe, collapses to brine | Wet slap, low gurgle loop |
| ishimi | Bloat Slime | trap | A slime sac swells during arming (30 ticks), bursts on touch into 3 globs: foe is slowed 50% for 120 ticks and the arena floor stays sticky 60 ticks (extends the Puddle) | none, 500 ticks, 2 | Dash through, Cleanse, burning the sac early (burns for no damage) | Sac pulses larger, pops with a splat, gloop decal | Squelch, wet pop |
| morblass | Rime Urchin | trap | Frozen urchin mine, spikes extend on arming; touch freezes (stun 40 ticks) and 12 damage; one hit | none, 550 ticks, 2 | Guard stops the freeze, Cleanse after, fire melts it in 20 ticks | Frost crystals grow, shatter into shards | Ice crackle, glassy ting |

### Air

| Hero | Name | Kind | Behaviour | Cost, cooldown, cap | Counterplay | Animation | Sound |
| --- | --- | --- | --- | --- | --- | --- | --- |
| cyclonius | Dust Devil | minion | A small whirl of grit drifts at the foe on a slight curve for 200 ticks, shoving (light knockback every 40 ticks, no damage); pushes foes toward walls and traps | 4 hp tithe, 650 ticks, 1 | Guard, Dash sideways, killed by 10 hp of damage | Spinning grit column with debris, thins out at the end | Rising hiss, dry rattle |
| echo | Resonance Chime | trap | A hanging bone chime pulse: when stepped near it rings, damages 14, then rings again 50 ticks later (14 more) in a bigger radius; the second ring is telegraphed by a visible ripple | none, 500 ticks, 2 | Leave the radius within the ripple window; Guard on the second ring | Hollow chime sways, concentric ripples | Two detuned tones, the second lower |
| wispera | Mote Swarm | minion | A cloud of pale gnat-lights orbits the foe for 150 ticks, stealing 1 hp per 12 ticks and giving it to wispera (the steal-health theme, capped at 10 hp) | 4 hp tithe, 650 ticks, 1 | Cleanse disperses it; area attacks (tornado, wind-cone, hurricane) kill it; Dash does not shake it | Tiny motes converge, flicker, scatter | High thin buzz that detunes |

### Fire

| Hero | Name | Kind | Behaviour | Cost, cooldown, cap | Counterplay | Animation | Sound |
| --- | --- | --- | --- | --- | --- | --- | --- |
| fiara | Ember Moth | minion | A glowing moth flutters at the foe, bursts on contact (20 damage, small blast, 56 px) or after 200 ticks; one per cast | 5 hp tithe, 500 ticks, 2 | Any hit pops it early (half blast), water extinguishes, Guard | Scorched wings flap, ember trail, burst | Dry flutter, soft whump |
| lavax | Magma Vent | trap | A hairline crack in the floor arms for 30 ticks, then erupts a lava column (22 damage, burning, 112 px) and leaves a lava pool for 100 ticks (Puddle rules, damage over time 1 per 10 ticks) | none, 600 ticks, 1 | Dash out; water or an ice attack hardens it; Guard | Glowing crack, rumble shake, spurt, cooling crust | Rumble then a fat hiss |
| sindarosa | Ashen Maw | trap | A buried maw of ash, jaws of cinder: on touch snaps shut (18 damage, roots 60 ticks, burning); not a fire bomb, it is a bite | none, 550 ticks, 2 | Cleanse removes the root; a hit from a water attack douses it; Dash before it closes (arm tell: wisps rise) | Ash heap with rising wisps, jaws snap, smoulder | Dry crunch, crackle |

### Earth

| Hero | Name | Kind | Behaviour | Cost, cooldown, cap | Counterplay | Animation | Sound |
| --- | --- | --- | --- | --- | --- | --- | --- |
| pax | Grave Tusks | trap | Bone tusks buried in the soil: on touch they burst upward, 20 damage and stun 70 ticks (longer than Spike), then crumble | none, 700 ticks, 1 | Cleanse does not remove a stun, so Guard (reduces it to a stumble) and Dash are the answers; tell: soil heaves during arming | Soil bump, tusks erupt, dust | Dull crack, stone thud |
| rokcore | Stone Husk | minion | A hunched rock-crab shape (80 hp-equivalent shell of 40) walks in front of rokcore for 300 ticks and blocks shots; it does not attack | 6 hp tithe, 650 ticks, 1 | Fire and air go around it; the shell breaks to 40 damage; melee Charge shoves it | Boulders knit into a husk, cracks spread, collapse to rubble | Grinding scrape, rock thump |
| treenoc | Gnarlroot | minion | A rooted thorn sapling that does not move: whips foes within 140 px (8 damage, light knockback every 50 ticks) for 300 ticks; roots a foe that stays near it | 5 hp tithe, 700 ticks, 2 | Fire burns it in 40 ticks (the counter), keep range, Cleanse frees the root | Sapling bursts from ground, twitching branches, rots away | Creaking wood, whip crack |

Reuse note: Bloat Slime, Rime Urchin, Ashen Maw, Grave Tusks, Magma Vent and Resonance Chime are tuned variants of the existing four
trap kinds (puddle, spike, fire bomb, gust) and reuse `trapTriggered` plumbing; the five minions (Brine Leech, Dust Devil, Mote Swarm,
Ember Moth, Stone Husk) and Gnarlroot need the new minion entity once (WP 3, first batch), then are data rows.

## 5. Prototype (view only)

`?ff=barGroups` (dev and test builds only) re-lays the existing Arcade boxes into HERO / COMMON / TEAM with a title rule over each group,
gaps between groups, the same keys, touch overlays and the one shared cooldown renderer. Code: `src/game/hud/bar-groups.ts` (pure
layout, `groupSlots`), the `arrange` hook in `ActionBarView`, the Arena wiring, unit test `bar-groups.test.ts` and e2e
`tests/e2e/action-bar-groups.spec.ts` (screenshots to `~/claudetmp/bar-groups/` at 1280x720 and 800x450). Today HERO holds abilities 1, 2
and the existing Trap (the future slot 3); COMMON holds Weather, Guard and the elemental; Cleanse appears there when the sim has it.

## 6. Follow-up work packages

2. Sim: slot model (common vs hero slots), Cleanse (shared with the elemental-cleanse agent), `Guard`/`Weather`/`Elemental` as common slots, SIM_VERSION bump.
3. Sim + view + audio: minion entity once, then one element family per batch (water, air, fire, earth), AI usage rule and a usage coverage test each.
4. Guide, Help, Tour ability info, balance pass; remove the global Trap from Help.

### Open owner idea (2026-11-13): Charge and Dash as abilities

Owner: "maybe charge, dash should be an ability". Reading: Charge and Dash stop being fixed team/common boxes and become part of each hero's kit (a hero ability, or a choice of ability for one of the hero slots), so each hero's movement option can differ per element (water slide, air blink, fire rush, earth rumble). Not decided: whether every hero keeps both, or picks one per slot. If adopted, the hotkey table above shrinks (keys 6-8 free up for Tag and others) and Charge/Dash get per-hero data, animation and sound like any ability. Revisit when the design table for the 12 heroes is reviewed.
