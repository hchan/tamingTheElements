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
 * 28: Arcade only; Classic hashes unchanged. Smarter Arcade AI (WP-arcade-ai-smarter, FUN-DESIGN 2.21): guard reflex, Hard
 *    sidestep dash, spacing, Hard super on a rooted foe, Rushdown charge, Hard weather and earlier tag; agent memory grows.
 * 29: Arcade only; Classic hashes unchanged. Auto-face (WP-arcade-auto-face, FUN-DESIGN 2.22): with no diagonal held, the Arcade aim and
 *    4-way facing follow the foe, so attacks face the opponent whichever way the hero was moving; a held diagonal still overrides.
 * 30: Arcade only; Classic hashes unchanged. Curomo's Arcade numbers 6300/1560 -> 6000/1250 hpPm/damagePm (Arcade tournament win rate
 *    87.5% -> 60%, the outlier of docs/ABILITY-AUDIT.md finding 1); Classic data untouched.
 * 31: Arcade only; Classic hashes unchanged. Arcade numbers re-fit (8-seed tournament, every race 45-57%): wispera 7900/1400 -> 7300/1280
 *    (66%), echo 5300/1530 -> 6200/1600 (35%), cyclonius 4490/1010 -> 4800/1080 (39%), morblass 3370/930 -> 3950/1070 (40%),
 *    curomo 6000/1250 -> 5800/1200, fiara 5140/1450 -> 5400/1520 (docs/ABILITY-AUDIT.md finding 3); Classic data untouched.
 * 32: Arcade only; Classic hashes unchanged. Panning wide arena (WP 38d): the Arcade playfield is ARCADE_ARENA_WIDTH = 1920
 *    wide (was 1280); fighters start on the old 1280 span centred in it (x 480 and 1360, ARCADE_P1/P2_START_X), the round
 *    reset and the terrain spawn keep-clear use the same spots, and terrain layouts are drawn about the new centre (960).
 * 33: Arcade only; Classic hashes unchanged. Traps (WP 39): command bit 6 is Trap in Arcade (Classic keeps it as capture);
 *    the `traps` system after `movement`; the Arcade block grows (entity trapReadyAt/trapSlowUntil, a trap press slot per
 *    team, a 4 x 7 world trap table), so every Arcade hash changes even with no trap cast.
 * 34: Arcade only; Classic hashes unchanged. Trap tuning (WP 39e, ideas/brainstorm/trap-balance-findings.md): lives after
 *    arming bomb 150 -> 120, puddle 300 -> 250, spike 200 -> 160, gust 200 -> 150; Puddle slow 600 -> 500 pm and linger
 *    40 -> 60 ticks; Gust knockback 224 -> 288 Q4; a Fire Bomb or Spike hit is its base times the owner race's damagePm,
 *    floored at TRAP_HIT_FLOOR 20 before the element chart (Sindarosa, Rokcore and Lavax traps hit for 13 to 19 before).
 * 35: Arcade only; Classic hashes unchanged. AI trap follow-up (WP 39f, ideas/brainstorm/ai-trap-use.md): the Normal plant rate
 *    80 -> 240 pm per tick, and Normal and Hard press a foe held by their Puddle or just shoved by their Gust (a Charge, else
 *    close in); the hash definition is unchanged, only scripted-AI commands differ.
 * 36: Arcade only (data); Classic hashes unchanged. Lavax's Arcade life hpPm 3500 -> 3900 (damagePm 870 unchanged): 24-seed Normal win rate
 *    40.5% -> 44.7%, no other race moves by more than 3.4 pp (ideas/brainstorm/arcade-low-races-analysis.md); Classic data untouched.
 * 37: Arcade only (data); Classic hashes unchanged. Arcade life hpPm Cyclonius 4800 -> 5000, Rokcore 2470 -> 2600, Lavax 3900 -> 4000
 *    (damagePm unchanged; the 3v3 tag golden script fires 18 blasts, was 16): 24-seed Normal win rates 41.7/44.7/44.7% -> 47.7/47.0/45.1%, every race 45.1-54.9%
 *    (ideas/brainstorm/arcade-low-races-analysis.md); Classic data untouched.
 * 38: Arcade only (scripted AI); Classic hashes unchanged. The scripted Arcade AI's follow-up memory (press window [14], own Gust
 *    count [15]) is reset outside the `fight` phase, so the Gust count dropping to 0 at the round reset no longer opens a spurious
 *    45-tick press at the start of a round, and a leftover window from the last round is dropped
 *    (ideas/brainstorm/ai-round-reset-gust-window.md); the hash definition is unchanged, only scripted-AI commands differ.
 * 39: Arcade only; Classic hashes unchanged. Elemental ability (FUN-DESIGN 2.24, ideas/in-progress/elemental-ability.md): command
 *    bit 10 (swap4, which Arcade never has) is the elemental press, buffered; Ember (fire: damage dealt x1.25), Gale (air: walk
 *    x1.3), Stoneskin (earth: damage taken x0.8) for 250 game ticks, Cleanse (water: ends its Snag root, Puddle slow, Ice Blast and
 *    tidal slows); cooldown 1750 ticks (water 1250), none for void heroes; the Arcade entity block gains elemReadyAt/elemUntil,
 *    the team block a ninth press tick (CHORD_FLAG moves to bit 9); `elementalCast`/`elementalEnded`; the scripted Arcade AI uses it.
 * 40: Arcade only (data); Classic hashes unchanged. Team life table: ARCADE_2V2_LIFE_PM lavax 537 -> 900, wispera 1050 -> 700 (2v2/3v3 balance probe:
 *    Lavax was the weakest team hero, Wispera the strongest; against the Normal AI 2v2 Lavax 55.9% / Wispera 55.7%) (WP 44).
 * 41: Arcade only; Classic hashes unchanged, and so is every 1x hero. Giant heroes (ideas/in-progress/giant-heroes-size-for-speed.md, data/size.ts):
 *    a per-character integer size in percent; Rokcore is 200 (2x): a 160 x 160 box spawned on the 1x centre, +45% life, +12% damage,
 *    knockback taken / 1.6 and walk and dash speed x0.72 (Classic ignores size).
 * 42: Arcade only; Classic hashes unchanged. Sudden death (ideas/in-progress/sf-round-timer-draws.md): a draw round that leaves both
 *    teams on ROUNDS_TO_WIN starts one extra round at 10% life with a 1500-tick timer (new world slot `ArcadeW.sudden`;
 *    the terrain patch table moves up one); the match winner is then the team with more round wins.
 * 43: Arcade only; AI only (Classic hashes unchanged). Combo follow-up: during a hit stun Normal and Hard heroes step onto the stunned foe's
 *    line (ranged) or close in (melee) when a slot is ready, and use Charge as a follow-up from range.
 * 44: Arcade only; AI only (Classic hashes unchanged). Zoning: a Normal or Hard ranged hero (primary ability ranged) loses its step towards the foe inside
 * 760 px (larger axis) and backs off inside 500 px when it has no attack press, whatever rule asked for the step (ideas/brainstorm/ranged-heroes-fight-at-melee-range).
 * Re-recorded: the Arcade goldens (AI-driven commands changed).
 * 45: Arcade only; Classic hashes unchanged. Giant heroes slice 2 (ideas/in-progress/giant-heroes-size-for-speed.md): Ishimi is a 1.5x mid-size (150: 120 x 120 box,
 *    life x1.225, damage x1.06, knockback / 1.3, speed x0.86; hpPm 6400 -> 4800, dmgPm 1550 -> 1420 to compensate), and a Snag root lasts
 *    less on a bigger hero (-250 pm per extra 1x, floor 400 pm; 2x root 45 ticks). Sizes up to 4x (3x curves) were already supported.
 *    Re-record reason: Ishimi stats and Snag duration change Arcade outcomes (goldens, Arcade baselines).
 * 46: Arcade only; Classic hashes unchanged. Balance retune after giant heroes slice 2 (ideas/brainstorm/balance-outliers.md): data-only
 *    ARCADE_RACE_NUMBERS changes for pax, wispera, sindarosa, cyclonius, fiara, curomo, echo, morblass, treenoc and rokcore (Arcade 1v1
 *    tournament, was pax 63.6 percent and wispera 37.5, now every race 46.6-52.8). Re-record reason: Arcade numbers change Arcade
 *    outcomes (Arcade goldens, Arcade baselines).
 * 47: Arcade only; Classic hashes unchanged. Common Cleanse (ideas/in-progress/elemental-cleanse.md): `Cmd.cleanse` (bit 9, the swap3 bit, buffered as
 *    Press 9) ends the caster's Snag root, Puddle slow, Ice Blast and tidal slows for all 12 heroes, cooldown 500 ticks, new event
 *    `cleanse {element, team, cleared}`; Arcade entity block 24 -> 25 ints (`cleanseReadyAt`), team block 22 -> 23 (pressTick 9 -> 10 slots);
 *    Normal and Hard AI press it when rooted or slowed. Re-record reason: the Arcade state layout, the AI commands and the
 *    new press change Arcade hashes and outcomes (Arcade goldens, Arcade baselines).
 * 48: Arcade only; AI only (Classic hashes unchanged). 2v2 time-over fix (ideas/in-progress/2v2-time-over-regression.md): the SIM_VERSION 44 zoning clamp
 *    is off while the hero has a living partner to tag in (`partnerPm >= 0`), so team matches close in again. Two ranged heroes per side kept out of range
 *    and the 2v2 time-over rate went 2.3 percent (43) -> 13.4 (44); it is 3.5 now (Arcade 2v2, `fun:report --team-size 2 --all`). Re-record reason: the AI
 *    commands of every 2v2 or 3v3 Arcade match change (Arcade goldens, Arcade baselines).
 * 49: Arcade only; Classic hashes unchanged. 2v2 balance retune (ideas/in-progress/arcade-balance-after-cleanse.md): data-only `ARCADE_2V2_LIFE_PM` changes
 *    (the 2v2 tournament played fixed partner teams, curomo+morblass 70 percent and cyclonius+pax 27, race spread 26.1-70.5; now 42.0-58.0). The 1v1
 *    Arcade tournament is unchanged (43.8-53.4 percent). Re-record reason: 2v2 life changes Arcade 2v2 outcomes (Arcade 2v2 goldens and baseline).
 * 50: Arcade only; Classic hashes unchanged. Melee-useful Charge and Dash (ideas/brainstorm/action-bar-rethink-hero-kits.md): a charging hero is armoured
 *    (hits deal damage but no knockback or hit-stun), the arrival hit is medium strength (CHARGE_DAMAGE 8 -> 12, CHARGE_STUN_TICKS 20 -> 26), and a
 *    melee swing through an invulnerable dasher is a perfect dodge (+meter) that readies the dash again at once. Re-record reason: Charge and
 *    Dash outcomes change Arcade hashes (Arcade goldens, Arcade baselines).
 * 51: Arcade only; Classic hashes unchanged. Shorter round intro (ideas/brainstorm/qa-r8-scorecard-and-status.md, passive first seconds):
 *    `ROUND_INTRO_TICKS` 90 -> 70 (1.4 s, ROUND n then FIGHT, as Street Fighter). Re-record reason: every Arcade round starts 20 ticks earlier, so Arcade
 *    hashes and outcomes change (Arcade goldens, Arcade baselines).
 * 52: Arcade only; Classic hashes unchanged. Super payoff (ideas/brainstorm/qa-r15-super-payoff-weak.md): every super's damage x3 (beam hit 12 -> 36, vortex
 *    9 -> 27, quake ring 20 -> 60, tidal wave 50 -> 150) and the heal shares of Phoenix Rise 100 -> 35 pm and Siren Gale 150 -> 50 pm, so a full-meter super
 *    at point blank takes about 30 percent of the foe's life (was 10 percent; 144 race pairs, mean 10.2 -> 30.0, min 4 -> 13, max 33 -> 79 on a chart edge).
 *    Re-record reason: super damage changes Arcade outcomes (Arcade goldens, Arcade baselines).
 * 53: Arcade only; Classic hashes unchanged. Post-super balance retune (ideas/done/balance-post-super.md): data-only `ARCADE_RACE_NUMBERS` life changes (2v2 factors rescaled so 2v2 life is unchanged) after the x3 supers
 *    moved Arcade win rates (1v1 spread 39.2-58.0 percent; now 44.9-54.0, 16 seeds): hpPm curomo 5780 -> 5450, cyclonius 5090 -> 5600, echo 6330 -> 6500, fiara 5230 -> 4600, ishimi 4800 -> 5000, pax 5100 -> 4850, rokcore 2060 -> 1850, wispera 7550 -> 7850. Re-record reason: life changes
 *    every Arcade hash and outcome (Arcade goldens, Arcade baselines).
 * 54: Arcade only; Classic hashes unchanged. Stage hazards (ideas/brainstorm/stage-selection-hazards.md, systems/arcade/hazard.ts): one telegraphed hazard
 *    of the stage's element at a time, HAZARD_FIRST_TICKS into a fight and then every HAZARD_PERIOD_TICKS plus a seeded jitter, each with a
 *    HAZARD_WARN_TICKS (1 s) warning: a fire lava-vent lane (4 percent of max life), a water tide drifting both fighters 1 px per tick for 3 s, an earth
 *    rockfall on a fighter's spot (5 percent) and an air gust band (1 px per tick, 4 while dashing or knocked back). Hazard damage never KOs and skips
 *    invulnerable fighters. Ten new Arcade world ints (`HAZARD_BASE`) and three event kinds (76..78). Re-record reason: stage hazards add hashed
 *    Arcade world state and change Arcade outcomes (Arcade goldens, Arcade baselines).
 * 55: Arcade only; AI only (Classic hashes unchanged). Hazard dodge (ideas/brainstorm/stage-selection-hazards.md): `ArcadeView.hazard` shows the live
 *    hazard's box and game ticks to its strike, and the scripted AI walks out of a warned lava lane, rockfall square or gust band by the shortest way
 *    that fits the playfield once its level's reaction time (ARCADE_AI_KNOBS) has passed, and stops a step back in (Easy is blind half the time, as
 *    for traps; a tide has no way out). Re-record reason: the AI commands of every Arcade match with a hazard change (Arcade goldens, Arcade baselines).
 * 56: Arcade only (Classic hashes unchanged). Fairer earth rockfall (ideas/brainstorm/qa-r20-ai-hazard-dodge-not-observed.md): the rock is
 *    HAZARD_ROCK_PX 112 (was 176) and the earth warning HAZARD_EARTH_WARN_TICKS 100 (2 s, was 50; other hazards keep 50; `hazardWarnTicks(kind)`,
 *    the AI reaction counts from the warning's start). Probe, 96 seeds: fighters inside at the strike Normal 41.2 to 21.0 percent, Hard 31.7 to 13.5.
 *    Re-record reason: earth strike box, timing and AI dodge change every Arcade earth-stage match (Arcade goldens, Arcade baselines).
 * 57: Arcade only (Classic hashes unchanged). Pax balance (Arcade 1v1 Pax 57.4 percent, target <= 54): Titan Slam ring damage 55 (was the quake's 60).
 *    Pax 57.4 to 52.3 percent, every other race within 1.7 pp. Re-record reason: Pax's super hits softer (Arcade goldens, Arcade baselines).
 * 58: Arcade only (Classic hashes unchanged). Supers land on time (ideas/done/qa-r27-super-no-sfx-and-late-damage.md; first damage was
 *    frame 41, now 17): SUPER_FREEZE_TICKS 16 (was 40) and a front-loaded opener (the first hit that lands, full super hit-stop) then lighter
 *    follow-ups with SUPER_FOLLOW_STOP_TICKS 4 of hit-stop: Inferno Beam 90 then 20 every 5 for 25 ticks (was 36 every 6 for 30), Vortex 64
 *    then 18 for 30 (was 27 for 36), Quake 90 then 32 with rings every 6 (was 60 every 10), Titan Slam 92 then 37; quake rings grow by a giant
 *    caster's extra width (`quakeRingSide`, so Rokcore's first ring reaches an adjacent foe); Tidal Wave 20 px per tick (was 12). Totals per
 *    super stay about as before (tools/sim/super-timing.ts). Re-record reason: super timing and damage change every Arcade match with a super
 *    (Arcade goldens, Arcade baselines).
 * 59: Arcade 2v2 only (Classic and Arcade 1v1 hashes unchanged). Curomo balance (2v2 win rate 42.0 percent, target >= 45): ARCADE_2V2_LIFE_PM curomo 732 to 800.
 *    Curomo 2v2 42.0 to 48.9 percent. Re-record reason: Curomo's tag-team life changes Arcade 2v2 outcomes (Arcade 2v2 goldens, Arcade 2v2 baseline).
 * 60: Arcade 2v2 only (Classic and Arcade 1v1 hashes unchanged). Random-partner balance (ideas/brainstorm/balance-2v2-echo-pax-r37.md step 1): ARCADE_2V2_LIFE_PM
 *    curomo 800 to 768 (-4 percent), sindarosa 773 to 812 (+5 percent). Re-record reason: tag-team life of two races changes Arcade 2v2 outcomes
 *    (Arcade 2v2 goldens, Arcade 2v2 baseline).
 * 61: Arcade 2v2 only (Classic and Arcade 1v1 hashes unchanged). Random-partner balance step 2 (ideas/brainstorm/balance-2v2-echo-pax-r37.md): ARCADE_2V2_LIFE_PM
 *    pax 612 to 594 (-3 percent), ishimi 633 to 671 (+6 percent). Re-record reason: tag-team life of two races changes Arcade 2v2 outcomes
 *    (Arcade 2v2 goldens, Arcade 2v2 baseline).
 * 62: Arcade 2v2 only (Classic and Arcade 1v1 hashes unchanged). Random-partner balance step 3 (ideas/brainstorm/balance-2v2-echo-pax-r37.md): ARCADE_2V2_LIFE_PM
 *    treenoc 715 to 680 (-5 percent), wispera 600 to 640 (+7 percent). Re-record reason: tag-team life of two races changes Arcade 2v2 outcomes
 *    (Arcade 2v2 goldens, Arcade 2v2 baseline).
 * 63: Arcade 2v2 only (Classic and Arcade 1v1 hashes unchanged). Random-partner balance step 4 (ideas/brainstorm/balance-2v2-echo-pax-r37.md): ARCADE_2V2_LIFE_PM
 *    curomo 768 to 736 (-4 percent), ishimi 671 to 720 (+7 percent). Re-record reason: tag-team life of two races changes Arcade 2v2 outcomes
 *    (Arcade 2v2 goldens, Arcade 2v2 baseline).
 * 64: Arcade 2v2 only (Classic and Arcade 1v1 hashes unchanged). Random-partner balance step 5 (ideas/brainstorm/balance-2v2-echo-pax-r37.md): ARCADE_2V2_LIFE_PM
 *    cyclonius 788 to 843 (+7 percent), pax 594 to 575 (-3 percent). Re-record reason: tag-team life of two races changes Arcade 2v2 outcomes
 *    (Arcade 2v2 goldens, Arcade 2v2 baseline).
 * 65: Arcade 2v2 only (Classic and Arcade 1v1 hashes unchanged). Random-partner balance step 6 (ideas/brainstorm/balance-2v2-echo-pax-r37.md): ARCADE_2V2_LIFE_PM
 *    sindarosa 812 to 845 (+4 percent). Re-record reason: tag-team life of one race changes Arcade 2v2 outcomes
 *    (Arcade 2v2 goldens, Arcade 2v2 baseline).
 * 66: Arcade only (Classic hashes unchanged). Movement feel (ideas/brainstorm/mvc-dash-roll-cancel.md, FUN-DESIGN 2.3a): walk ramps up (WALK_ACCEL_PM), brakes
 *    (WALK_BRAKE_PM) and turns (WALK_TURN_PM) instead of starting and stopping instantly; the dash follows DASH_CURVE_PM (fast start, slow tail, same
 *    distance); a primary or secondary press from dash tick 10 cancels the dash into the attack; walls slide along the free axis. Re-record reason:
 *    every Arcade movement trajectory changes (Arcade goldens, Arcade 1v1 and 2v2 baselines). Same version: ARCADE_RACE_NUMBERS and
 *    ARCADE_2V2_LIFE_PM retuned so the movement change keeps the race win rates in 45-55 (see docs/BALANCE.md).
 * 67: Arcade only (Classic hashes unchanged). Backward walk (owner request): walking with the held x pointing away from the foe's x runs at
 *    BACKWARD_WALK_PM = 500 (50 percent) of forward speed (x only; vertical and no-foe unchanged). Re-record reason: every Arcade trajectory
 *    with a retreating hero changes (Arcade goldens, Arcade 1v1 and 2v2 baselines).
 * 68: Arcade only (Classic hashes unchanged). Roster WP 0.1: the special hit def ids are pinned out of the ability index range
 *    (SUPER_DEF 0x100, CHARGE_DEF 0x101, TRAP_BOMB_DEF 0x102, TRAP_SPIKE_DEF 0x103; they were 30..33, right after the abilities) so the
 *    roster can grow without shifting them; no behaviour change. Re-record reason: the super effect entity's hashed `defId` changes
 *    (Arcade goldens with a super); outcomes are identical.
 * 69: Arcade only (Classic hashes unchanged). Roster WP 0.4 style-align (owner-approved 2026-11-14, ideas/brainstorm/roster-24-heroes.md): the
 *    Arcade RANGED flag follows HERO_STYLE instead of the primary ability's kind. Fiara, Morblass and Rokcore become ranged (no Charge; weather
 *    charge by casting), Wispera melee (Charge; weather charge by walking); the AI's spacing for the four flips with them. ARCADE_RACE_NUMBERS
 *    re-fit for wispera (was 57.4%) and ishimi (38.6% once the four moved); ARCADE_2V2_LIFE_PM nudged for fiara, morblass and rokcore.
 *    Re-record reason: four heroes change Charge, weather charge and AI spacing (Arcade goldens, Arcade 1v1 and 2v2 baselines; the
 *    Classic goldens change only in the header simVersion).
 * 70: Arcade only (Classic hashes unchanged). Crowd-control core (CB0, ideas cc-anim plan): new default-off flag `withCrowdControl` (sorts last,
 *    bit 128), status ids 10-15 (dazed, iced, downed, silenced, hidden ccWard and kindled), diminishing returns, events 79-81. With the flag off
 *    nothing changes. Re-stamp reason: new default-off CC flag and core; no behaviour change with it off (only the header simVersion of the
 *    replay fixtures moves; inputs and checkpoints are identical).
 * 71: Arcade only (Classic hashes unchanged). Fire Blast falloff (ideas/done/dragon-fading-fireball.md, FUN-DESIGN 2.27): the blast grows 2 px
 *    per axis per tick for its first 20 ticks (75x15 to 115x55, centred, clamped at the left and top walls) and, after 20 ticks at full damage,
 *    loses 10 pm of its spawn damage per tick down to 450 pm (fireBlastFadePm, src/core/sim/arcade-numbers.ts); hit strength stays heavy.
 *    Re-record reason: every Arcade Fire Blast hit, clash and miss changes (Arcade goldens, Arcade 1v1 and 2v2 baselines; the Classic goldens
 *    change only in the header simVersion).
 * 72: Arcade only (Classic hashes unchanged). Roster-24 batch 1: four new heroes appended after wispera (kindrel, nykra, quarrak, hyalia;
 *    character index 14-17), ability set C appended after set B (ember-bite, cinder-spray, hoof-crash, kelp-lash, boulder-roll,
 *    stinging-filament, bell-pulse; def indices 30-36; hurl-rock reused), supers 13-16, per-hero Arcade numbers, sizes and boxes, and an Arcade
 *    cooldown override for hurl-rock. New defs mean new behaviour for online peers. Re-record reason: new Arcade heroes change the Arcade
 *    round-robin baselines (1v1 and 2v2, which now include 16 heroes) and add an Arcade golden; existing goldens change only in the header
 *    simVersion.
 * 74: Arcade only (Classic hashes unchanged). Roster-24 batch 3: four new heroes (ouroth, abyssor, vortigal, umbrel; character index 22-25),
 *    abilities wyrm-coil, scorch-breath, tentacle-lash, abyssal-pull, stoop, talon-rake, spore-burst, mycelium-mend (def indices 45-52),
 *    supers 21-24, new primitives (grab that beats Guard and Parry and throws, pull via pullPx, wound status id 17 with a pulse system),
 *    per-hero Arcade numbers, sizes. Re-record reason: new Arcade heroes change the Arcade round-robin baselines (1v1 and 2v2, now 24
 *    heroes) and add an Arcade golden; the new `wound` system step changes no existing hash, existing goldens change only in the header simVersion.
 * 73: Arcade only (Classic hashes unchanged). Roster-24 batch 2: four new heroes (brazgor, glimmaw, durrok, zephra; character index 18-21),
 *    abilities forge-gore, molten-hide, lure-orb, abyss-flash, tusk-gore, bristle-stomp, static-mote, skitter (def indices 37-44), supers 17-20,
 *    new primitives (cast lunge/hop via lungePx, hovering projectile via hoverStopPx, thorns status, centred melee burst), per-hero Arcade
 *    numbers, sizes. Re-record reason: new Arcade heroes change the Arcade round-robin baselines (1v1 and 2v2, now 20 heroes) and add an
 *    Arcade golden; existing goldens change only in the header simVersion.
 * 75: Arcade only, flag withOverTime (default off; Classic and flag-off Arcade hashes unchanged): over-time statuses burning 18, venom 19,
 *    mending 20 with a pulse system (overTime slot) and Burn riders on crimson-fire and scorch-breath. Re-record reason: header simVersion only
 *    (no existing input or checkpoint changes).
 * 76: Arcade only, AI only behind withOverTime (flag-off hashes unchanged): the scripted AI cleanses burning (2+ stacks) and venom while hurt.
 *    Re-record reason: new flag-on golden arcade-ot; existing goldens change only in the header simVersion.
 * 77: Arcade only, 2v2/3v3 only (Classic and Arcade 1v1 hashes unchanged): roster-24 balance batch 3, `ARCADE_2V2_LIFE_PM` retuned for vortigal, quarrak,
 *    durrok, brazgor, hyalia, glimmaw, abyssor, umbrel and (released) sindarosa from a 26-base-seed full-roster 2v2 tournament. Re-record reason:
 *    tag-team goldens move with team life; the Arcade 2v2 baseline is re-recorded.
 * 78: Arcade only, 2v2 only (Classic, Arcade 1v1 and 3v3 hashes unchanged): `ARCADE_2V2_LIFE_SCALE_PM` = 1300 scales 2v2
 *    hero life on top of the v77 `ARCADE_2V2_LIFE_PM` table so the 2v2 round median reaches the nightly fun-gate band
 *    (44.3 s -> 62.2 s, 8 seeds). Re-record reason: 2v2 tag-team goldens move with 2v2 life; the Arcade 2v2 baseline is
 *    re-recorded; every other replay fixture changes only its simVersion header.
 */
export const SIM_VERSION = 78;
