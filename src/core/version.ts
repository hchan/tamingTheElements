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
 */
export const SIM_VERSION = 9;
