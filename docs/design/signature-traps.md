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

## Visuals today (view layer, shipped with this doc)

The four trap kinds that exist in the sim now each have their own painted silhouette and motion (`src/game/fx/trap-paint.ts`, driven by
`trapPhase` in `trap-fx.ts`, mounted by `trap-view.ts`): Fire Bomb is a charred pod with pulsing ember seams and rising cinders, Puddle a
murky pool with spreading ripples and bubbles, Spike a cracked mound whose bone tusks heave up while arming and shake near the end,
Gust a counter-turning grit spiral. Arming shows assembly (`arm` 0 to 1); the last 40 ticks quicken the motion (`urgency`); reduced
motion freezes the clock at a fixed pose. Headless screenshots: `tests/e2e/trap-art.spec.ts`. The twelve signature things reuse these four
painters first (Builds on column), then get their own painters when each is implemented.
