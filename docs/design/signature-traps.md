# Signature slot-3 traps and minions (design table)

Status: design. Refines section 4 of [action-bar-kits.md](action-bar-kits.md) with a duration column and the sim hook for each, so each
of the 12 can be built on the **existing trap system** (`src/core/sim/systems/arcade/trap.ts`: plant 72 px ahead, arm 30 ticks, trigger
box 56 px plus 24 px, life by kind, team cap 2) with no new entity kind. A minion is a trap entity with a `chase` or `follow` flag, not a
new world object. Follow-up files: one per hero in [ideas/brainstorm/](../../ideas/brainstorm/) (`signature-slot3-<hero>.md`).

Rules for all twelve: elemental and non-humanoid (beasts, growths, vents, cairns, never people); grim and desaturated; one cooldown
renderer; counterplay always exists (Guard, Dash, Cleanse, fire burns plant and web things); the thing dies on its owner's KO; a visible
countdown ring. Ticks are 50 Hz game ticks (500 = 10 s). Numbers are first guesses for the balance pass.

## Table

| Hero | Element | Name | Kind | Builds on | Cooldown (ticks) | Duration after arming (ticks) | Behaviour | Counterplay | Sim hook |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| curomo | water | Brine Leech | minion | Puddle (mobile) | 600 | 250 | A pale eel-leech slides along the floor toward the foe at 70% hero speed and latches on contact for 150 ticks: slow 30%, 1 hp per 10 ticks. Dies on any hit or at 12 hp. | Cleanse or Dash breaks the latch; any hit kills it; fire evaporates it; Guard blocks the latch | Trap entity gets a `chase` flag: each tick it steps toward the foe; on overlap it applies the Puddle slow plus a drip tick. 5 hp tithe on cast. |
| ishimi | water | Bloat Slime | trap | Puddle | 500 | 250 | A slime sac swells during arming, bursts on touch into three globs: foe slowed 50% for 120 ticks and the floor stays sticky for 60 ticks. | Dash through; Cleanse; burning the sac early (it pops for no damage) | Puddle with a longer linger and a splash radius; no new state. |
| morblass | water | Rime Urchin | trap | Spike | 550 | 160 | A frozen urchin mine: spines extend when armed; touch freezes (stun 40 ticks) and deals 12. | Guard stops the freeze; Cleanse after; fire melts it in 20 ticks | Spike with shorter stun, a lower hit and a `freeze` status tag for the view. |
| cyclonius | air | Dust Devil | minion | Gust (mobile) | 650 | 200 | A small whirl of grit drifts at the foe on a slight curve, shoving (light knockback every 40 ticks, no damage); pushes foes toward walls and traps. | Guard; Dash sideways; 10 hp of damage kills it | Gust with a `chase` flag and a repeating shove instead of a single one; curve from a deterministic offset by tick. |
| echo | air | Resonance Chime | trap | Gust (two-stage) | 500 | 150 | A hanging bone chime: stepped near, it rings and deals 14, then rings again 50 ticks later in a bigger radius (14 more). The second ring shows a ripple first. | Leave the radius in the ripple window; Guard the second ring | Fire Bomb style fuse run twice: a `stage` counter on the trap, second radius 1.5x. |
| wispera | air | Mote Swarm | minion | Gust (mobile) | 650 | 150 | A cloud of pale gnat-lights orbits the foe, stealing 1 hp per 12 ticks and healing Wispera (capped at 10 hp total). | Cleanse disperses it; area attacks (tornado, wind-cone, hurricane) kill it; Dash does not shake it | `chase` flag plus orbit radius 24 px; steal and heal through the existing steal-health path. |
| fiara | fire | Ember Moth | minion | Fire Bomb (mobile) | 500 | 200 | A glowing moth flutters at the foe and bursts on contact (20 damage, 56 px blast) or after 200 ticks. | Any hit pops it early (half blast); water extinguishes; Guard | Fire Bomb with a `chase` flag and the blast radius cut from 112 to 56; 5 hp tithe. |
| lavax | fire | Magma Vent | trap | Fire Bomb + Puddle | 600 | 120 | A hairline crack arms for 30 ticks, then erupts a lava column (22 damage, burning, 112 px) and leaves a lava pool for 100 ticks (1 damage per 10 ticks). | Dash out; water or ice hardens it; Guard | Fire Bomb that on trigger leaves a damaging Puddle; cap 1. |
| sindarosa | fire | Ashen Maw | trap | Spike | 550 | 160 | A buried maw of ash: on touch it snaps shut (18 damage, root 60 ticks, burning). A bite, not a blast. | Cleanse removes the root; water douses it; Dash before it closes (arm tell: wisps rise) | Spike with a root instead of a stun (reuse Snag root) and a burn. |
| pax | earth | Grave Tusks | trap | Spike | 700 | 160 | Bone tusks buried in the soil: on touch they burst up for 20 damage and stun 70 ticks, then crumble. | Guard (reduces it to a stumble); Dash; soil heaves during arming | Spike with a longer stun and cap 1. |
| rokcore | earth | Stone Husk | minion | Spike (static blocker) | 650 | 300 | A hunched rock-crab walks in front of Rokcore and blocks shots; it does not attack. Shell of 40 hp. | Fire and air go around; the shell breaks at 40 damage; Charge shoves it | Trap entity with `follow owner` and a projectile-block test (reuse `shotBlocked` terrain rule); no damage. |
| treenoc | earth | Gnarlroot | minion | Spike (turret) | 700 | 300 | A rooted thorn sapling that does not move: whips foes within 140 px (8 damage, light knockback every 50 ticks) and roots a foe that lingers. | Fire burns it in 40 ticks; keep range; Cleanse frees the root | Trap that stays armed and repeats its hit every 50 ticks instead of triggering once; cap 2. |
| kindrel | fire | Cinder Brand | trap | Spike | 500 | 200 | A smouldering ember; the foe that touches it is branded for 150 ticks and takes +25% from Kindrel's melee. | Cleanse removes the brand; water douses; Dash past | Spike with a `brand` status (damage multiplier, integer per mille) |
| brazgor | fire | Pyre Totem | trap | Spike (static) | 650 | 300 | A horned brazier. While Brazgor stands within 100 px of it he takes 30% less damage. Foes can break it (20 hp). | Bait him away; shoot it; water douses it | Trap with an `aura` flag (owner-only damage reduction inside a radius) |
| ouroth | fire | Brimstone Coil | trap | Puddle (ring) | 600 | 200 | A ring of embers 140 px across. A foe inside cannot Dash. | Walk out of the ring; Cleanse; water | Puddle with a `dashLock` status while inside |
| nykra | water | Riptide | trap | Puddle (strip) | 550 | 250 | A 160x40 current. Foes on it are carried 3 px per tick away from Nykra; Nykra on it gains +2 speed. | Step off sideways; Dash | Puddle with a `flow` vector |
| abyssor | water | Ink Cloud | trap | Puddle (cloud) | 600 | 250 | A cloud of ink. A foe inside has its hero cooldowns tick at half rate. | Leave the cloud; Cleanse; air abilities blow it away | Puddle with a `cooldownSlowPm` status |
| glimmaw | water | Lantern Lure | trap | Gust (static) | 550 | 150 | A floating lure. Foes within 160 px drift 1 px per tick toward it; touching it pops it (12). | Walk against the pull; shoot it (8 hp) | Gust with a `well` pull vector |
| durrok | earth | Mudslick | trap | Puddle | 500 | 250 | A slick of wet clay. A foe stepping on it slides 80 px in its facing direction and cannot turn for 30 ticks. | Dash before the slide; Guard; fire bakes it | Puddle with a forced-slide impulse (`setKnockback`) |
| quarrak | earth | Rubble Wall | trap | Spike (solid) | 650 | 350 | A 40x140 wall of scree. Foes cannot walk through it (they go around); 30 hp. Shots pass. | Break it with melee; walk around it | Trap with a `solid` flag (movement clamp) |
| umbrel | earth | Sporeling | minion | Gust (follow) | 600 | 400 | A puffball that waddles at Umbrel's side. Each time Umbrel casts Spore Burst, every live sporeling puffs a spore cloud too (6 + wound). 20 hp; costs a 5 hp tithe. | Kill it (area attacks); fire burns it in 30 ticks | Trap entity with `follow owner` and a `castEcho` hook |
| vortigal | air | Thermal | trap | Gust | 550 | 200 | A rising column. Vortigal entering it resets her Stoop cooldown; foes entering are shoved 60 px. | Stand on it to deny it; Guard | Gust with an `ownerRefund` hook |
| hyalia | air | Drifting Polyp | trap | Gust (mobile, straight) | 600 | 300 | A small jelly drifts forward at 1 px per tick. Touching it silences the foe for 60 ticks (no hero abilities; Guard and Dash still work) and deals 10. | Shoot it (10 hp); jump the lane; Cleanse | Gust with a straight `drift` and a `silence` status |
| zephra | air | Arc Pylon | trap | Spike (pair) | 500 | 300 | A charged mote. With 2 pylons alive, a lightning tether between them deals 12 to a foe crossing it (once per 40 ticks). | Break a pylon (6 hp); go around | Trap pair; integer segment-box test between the 2 live pylons |

The last twelve rows (Kindrel to Zephra) are the Roster 24 signatures: design only, none is in the sim yet. New mechanics (not used by the first twelve): brand, aura, dash lock, flow, cooldown slow, well, slide, solid wall, cast-echo, refund, silence and tether.

## Visuals today (view layer, shipped with this doc)

The four trap kinds that exist in the sim now are flat ground decals (an ellipse 0.6 tall, 62 px wide; `src/game/fx/trap-paint.ts`,
driven by `trapPhase` in `trap-fx.ts`, mounted by `trap-view.ts`). Every kind shares a dark stain and a 12-segment element-coloured
rune ring, then adds its own accents: Fire Bomb is a flame vent (glowing cracks, three licking tongues, cinders), Puddle a frosted mere
with ripples and bubbles, Spike a ring of bone tusks heaving up, Gust a counter-turning grit spiral. Phases: arming lights the ring one
segment at a time while the accents grow (`arm` 0 to 1, drawn dim); armed is the full ring pulsing; the last 40 ticks quicken the
motion (`urgency`); reduced motion freezes the clock at a fixed pose. The trigger range is a faint dotted ground ellipse, not a box. Headless screenshots: `tests/e2e/trap-art.spec.ts`. The twelve signature things reuse these four
painters first (Builds on column), then get their own painters when each is implemented.
