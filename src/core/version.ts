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
 */
export const SIM_VERSION = 15;
