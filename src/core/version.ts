/**
 * Version of the simulation and of the hash definition, recorded in every replay header. Bump it with any change that
 * alters a hash for the same setup and commands, and re-record the goldens (docs/DETERMINISM.md).
 *
 * 2: agent RNG streams left SimState (rng holds the five sim streams); world flag bits follow FLAG_NAMES with the
 *    internal bits at 16+.
 * 3: Arcade only; Classic hashes unchanged. `rulesetArcade` flag (sorted last, no flag bit moves), `SimState.arcade`
 *    (length 0 in Classic), the `now()` game clock and the freeze gate (WP-arcade-flag).
 * 4: Arcade only; Classic hashes unchanged. Hit-stop: the Arcade hit path (`systems/arcade/hit.ts`) freezes the game
 *    clock by hit strength and emits `hitConfirmed`/`hitStop`; Arcade melee hits emit `damage` (WP-arcade-hitstop).
 * 5: Arcade only; Classic hashes unchanged. Hit-stun, Q4 knockback with wall clamp and one bounce, juggle and stun caps
 *    with `recovered`, `canAct` in the cast sites and movement, Tornado and Vines as 60-tick stuns; the Arcade entity
 *    block gains `wallBounced` (WP-arcade-stun-knockback).
 * 6: Arcade only; Classic hashes unchanged. Combo counter and damage scaling by hit index, counter hits (+1 stun tier),
 *    `comboEnded`, and `recovered` reason 0 when a stun runs out; the `input` slot runs the Arcade expiry
 *    (WP-arcade-combo).
 * 7: Arcade only; Classic hashes unchanged. Hyper meter per team (0..3000): hits give the attacker 800 and the victim
 *    600 per mille of the share of the victim's life removed, each cast +20; `meterLevel` when the bar count changes
 *    (WP-arcade-meter).
 * 8: Arcade only; Classic hashes unchanged. Supers: `Cmd.super` spends a bar for the generic Elemental Burst (a 160 px
 *    band, 5 strength-3 hits), a 40-tick super freeze, caster invulnerability and lock, `superStarted`/`superEnded`; the
 *    `health` slot runs `arcadeSuper` (WP-arcade-super-core).
 * 9: Classic and Arcade rule fixes from the parity audit (WP-parity-fixes); Classic hashes change on purpose. The bench
 *    rest heal repeats every 50 ticks from the bench and stops at the rest cap (legacy delay -1 repeats forever), and an
 *    enemy back in play keeps healing (legacy isBenched quirk). Classic walls hold y too: the player undoes its whole
 *    step, the enemy restores x, then y, then both (legacy stopOnSolids / resetIfOutOfBounds). Ability cooldowns and
 *    active counts move from the per-team block to the per-character `SimState.abil` (legacy abilitiesInfo is per
 *    character; Arcade casts book there too); a hit releases the count on the shooter team's current character
 *    (bullet-count-on-active). A Capture bullet on a faded target only sets the captured flag (no damage, keeps
 *    flying); on the last boss it keeps flying. A frozen character cannot swap.
 * 10: Arcade only; Classic hashes unchanged. 8-way aim: the Arcade entity block gains `aim` (the dir8 of the last held
 *    input); shots fly along it (diagonals +-speed on both axes), a diagonal melee is a (w + h) / 2 square off the
 *    caster's corner, and those hits knock back along it; the super band keeps the 4-way facing (WP-arcade-8way-aim).
 * 11: Arcade only; Classic hashes unchanged. Input buffer: the `input` slot records press edges every tick (frozen ones
 *    too) in the Arcade team block (`prevCmd`, `pressTick`, the new `pressUsed`); a primary, secondary or super press
 *    that cannot run at once runs on the first tick it can within 8 game ticks, once; primary and secondary within 3
 *    ticks are a super press when a bar is there (WP-arcade-buffer).
 * 12: Arcade only; Classic hashes unchanged. Rounds: the `cleanup` slot runs `arcadeRound` (intro 90 ticks, fight with
 *    a 4500 game-tick timer, KO with 60 ticks of half-speed slow motion after the KO hit-stop, round end 60), best of 3
 *    (`matchEnded` after 2 round wins, a draw round scores for both), time over by roster HP per mille, a full reset
 *    between rounds (meters carry over), `roundStarted`/`fight`/`ko`/`timeOver`/`roundEnded`; nobody acts or is hit
 *    outside `fight`; a KO keeps the damage multiplier; the Arcade world block gains `roundWinner` (WP-arcade-rounds).
 * 13: Arcade only; Classic hashes unchanged. Dash: `Cmd.dash` (bit 11) or a double tap of a direction within 12 game
 *    ticks starts a 12-tick dash at 3x speed (invulnerable on dash ticks 2..7, 6 ticks of recovery, ready again 30 ticks
 *    after the start), a perfect dodge (+100 meter, once per dash), and a dash within 10 ticks of a confirmed hit cancels
 *    melee recovery; `dashed`/`perfectDodge`; the Arcade entity block gains `dashDodged` and the team block
 *    `confirmTick` (WP-arcade-dash).
 * 14: Arcade only; Classic hashes unchanged. Guard and parry: holding `Cmd.guard` (bit 12) blocks every hit but a super
 *    (250 pm chip, light knockback, 8 ticks of block-stun, no combo; `guarded`) and drains the guard meter (2000 pm of
 *    the chip's share of max HP; +5 per game tick while not guarding); empty, `guardBroken` and 60 ticks of stun. A guard
 *    press opens an 8-tick parry window (`parried`, no damage, 10 ticks of hit-stop, +150 meter; projectiles reflect,
 *    melee attackers are stunned 20); a whiffed window locks parries for 20 ticks. The Arcade entity block renames
 *    `guardState`/`guardMeter` to `blockUntil`/`guardDrain` (WP-arcade-guard-parry).
 * 15: Arcade only; Classic hashes unchanged. Weather: `Cmd.weather` (bit 14, buffered) calls the caster's element
 *    weather (Sun, Rain, Sandstorm, Gale, Eclipse) for 500 game ticks; a new one replaces, the same one refreshes;
 *    1500-tick cooldown per character, 16 ticks of recovery (counter-hittable), +50 meter; hits of the favoured element
 *    x1.2 and of its counter /1.2 (after the chart, before combo scaling); `weatherChanged`/`weatherEnded`. The Arcade
 *    entity block gains `weatherReadyAt`, the team block a sixth press tick, the world block the weather slot
 *    (WP-arcade-weather).
 * 16: Arcade only; Classic hashes unchanged. Elemental clash: the `collision` slot runs `arcadeClash`; overlapping
 *    projectiles of opposing teams clash by their owners' elements, the advantaged one survives with damage
 *    `max(hp - loserHp / 2, hp / 4)`, any other relation destroys both; `clash`, +50 meter to each side
 *    (WP-arcade-clash).
 * 17: Arcade only (data); Classic hashes unchanged. Arcade numbers: per race, max HP is `floor(maxHealth * hpPm /
 *    1000)` and ability hits deal `damagePm / 1000` (after the weather, before the combo scale; the super is not
 *    scaled), from ARCADE_RACE_NUMBERS (default 4000 / 1000); hit-stun by strength is 32/38/44/48 (was 12/16/22/26);
 *    the guard drain is 8000 pm (was 2000); Fireball and Crimson Fire cool down in 26 and 18 game ticks (Classic 30
 *    and 20; `cooldownTicksFor`) (WP-arcade-numbers).
 * 18: Arcade only; Classic hashes unchanged. Tag team: a tag (the swap keys) needs the active character free and books
 *    150 game ticks (Classic 250); the partner enters at the outgoing spot with its facing and aim, 20 ticks of
 *    invulnerability (60 after a KO) and a free primary cast (the entrance attack; `tagIn`); a bullet hit releases the
 *    count on its shooter (bullet-count-on-active fixed in Arcade); benched characters heal 10 pm of max HP every 10
 *    game ticks up to the rest cap, and only while benched (rest-heal-enemy-in-play fixed in Arcade) (WP-arcade-tag).
 * 19: Arcade only; Classic hashes unchanged. Weather power: weather is locked until the team's weather charge (a new
 *    team field, 0..1000 pm, reset each round) reaches WEATHER_CHARGE_FULL; ranged heroes (primary range/omni) gain
 *    WEATHER_CHARGE_CAST per primary or secondary cast, the others WEATHER_CHARGE_STEP per walked tick; a cast spends
 *    the whole charge and the 1500-tick cooldown becomes a 50-tick lockout (WP-arcade-weather-charge).
 * 20: Arcade only; Classic hashes unchanged. Arcade playfield insets (top 200, bottom 80 px): the Arcade arena is the
 *    rectangle between the top HUD rows and the action bar, for movement, knockback, entrances, spawns and projectile
 *    expiry; the start row is its centre (WP-arcade-playfield-bounds).
 * 21: Arcade only; Classic hashes unchanged. Stage terrain: each round draws 3 to 5 point-symmetric element patches
 *    (stage from the seed, then the weather: a cast swaps the stage and patches after a 30-tick telegraph); a fire
 *    patch doubles its own-element hero's damage, water heals 10 pm of max HP per 50 ticks, earth is a rock for the
 *    other elements (blocks bodies and every shot but an earth hero's), air doubles speed; the total modifier is
 *    capped at 2500 pm; new Arcade state slots (stage, patches, team in-patch flag) (WP-arcade-terrain).
 * 22: Arcade only; Classic hashes unchanged. 2v2 tune: a hero's Arcade max HP in a two-hero roster is further scaled by
 *    ARCADE_2V2_LIFE_PM (per race, default 600 pm; 1v1 unchanged), benched heroes heal 3 pm per 10 ticks (was 10), and
 *    the scripted Arcade AI of a tag team fires along rock-cut lines for part of every 256 ticks, so that 2v2 rounds
 *    end instead of timing out (WP-arcade-2v2-tune).
 * 23: Arcade only; Classic hashes unchanged. The four super archetypes and their 12 race variants replace the generic
 *    Elemental Burst: Inferno Beam, Vortex, Quake Rings, Tidal Wave (FUN-DESIGN 2.5); new statuses (super speed, super
 *    armour, tidal slow); the super id rides in the super entity's hitMask (WP-arcade-supers).
 * 24: Arcade only; Classic hashes unchanged. Melee Charge (FUN-DESIGN 2.17): `Cmd.charge` (bit 15, buffered) rushes a
 *    melee hero up to 360 px along the 8-way line towards the opponent (12 ticks at 5x speed), a touch lands a light hit
 *    with 20 ticks of hit-stun and a free primary, 300-tick cooldown; `chargeStarted`/`chargeEnded`. The Arcade entity
 *    block gains `chargeUntil`/`chargeReadyAt`, the team block a seventh press tick; CHORD_FLAG moves to bit 7
 *    (WP-arcade-charge).
 * 25: Arcade only (data); Classic hashes unchanged. The Eternal Void, the World Tour's final boss, gets its own
 *    ARCADE_RACE_NUMBERS row [580, 1000] (was the default 4000 / 1000): 580 HP alone, legacy damage, so a 3-hero team
 *    can beat it (boss probe, FUN-DESIGN 2.18) (WP-tour-void-boss).
 * 26: Arcade only; Classic hashes unchanged. Snag (FUN-DESIGN 2.20) replaces Capture in Arcade: the Entangling Vines
 *    melee sits on a Snag slot of Treenoc, Wispera (sonar-blast), Curomo (shards-of-ice) and Echo (fade), a 240 x 40 px
 *    throw along the aim with a 400-tick cooldown that roots (no walk, Dash or Charge) for 60 ticks; fire shots and a
 *    Sun cast free it, guard wastes it, 75 ticks of immunity follow; `snag` event. The Arcade entity block gains
 *    `rootUntil`/`rootImmuneUntil`; the Arcade AI throws it (WP-snag).
 * 27: Arcade only; Classic hashes unchanged. Snag tuning (WP-snag-tune, FUN-DESIGN 2.20): the throw hurts (SNAG_DAMAGE 30
 *    before the thrower's damagePm) and stuns 20 ticks (SNAG_STUN_TICKS; the old vines hit stunned 60); new
 *    ARCADE_RACE_NUMBERS rows for Treenoc, Wispera, Curomo and Echo and re-fit 2v2 life factors; the Arcade AI no longer
 *    throws with overlapped boxes (the rope starts behind the foe and missed) and steps away to open the gap instead.
 */
export const SIM_VERSION = 27;
