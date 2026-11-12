---
status: in-progress
added: 2026-11-12
---

# WP 39: bomb and trap ability (SF2 / Archon II flavour)

A placed hazard with a fuse: the hero drops it, it arms after a short delay, and it fires when the foe walks over it or when its fuse runs out. One button, four element variants, a cooldown and a small cap per team. Design only; nothing is built yet. Replaces the brainstorm stub `ideas/brainstorm/bomb-traps.md`. Related: `ideas/in-progress/wp38-panning-arena.md` (traps live in world coordinates, so they pan for free), FUN-DESIGN 2.7 (dash), 2.8 (guard), 2.15 (terrain), 2.20 (Snag), 2.22 (auto-face), and the `add-ability` skill (gameplay change: the owner pre-approved design, so this is a report-afterwards design).

Player-facing names: the button is **Trap**; variants are Fire Bomb, Puddle, Spike, Gust. No mode words on screen.

## Current state (read from the code)

- All four ability slots per character are used (`ABILITY_SLOTS = 4`, `SimState.abil` = cooldown + active count per slot), and Snag already overrides a slot for four heroes. A trap therefore does **not** take a slot; it gets its own Arcade state, like Dash, Guard and Charge.
- `Command` is a u16 and every bit is named: 0..10 classic, 11 dash, 12 guard, 13 super, 14 weather, 15 charge (`src/core/sim/commands.ts`). The packet and replay formats are u16 (`net/packet.ts`, `replay/rle.ts`, `replay/validate.ts`). There is no free bit. See "Input" for the decision.
- `SimState.arcade` is an `Int32Array` with three blocks: per entity (`ArcadeE`, `ARCADE_E = 20`), per team (`ArcadeT`, `ARCADE_T = 20`), world (`ArcadeW`, with the terrain patches at `ArcadeW.patches`, `PATCH_MAX = 5` rects of 4 ints). Hash and snapshot already iterate it; it is empty in Classic.
- Snag (`systems/arcade/snag.ts`): `rootUntil` / `rootImmuneUntil`, fire frees the rope (`SNAG_FIRE_ABILITIES`), Sun frees all roots, a guarding target wastes the throw.
- One hit path: `applyArcadeHit(world, sink, attackerTeam, attacker, victim, base, abilityDefId, dir)` gives hit-stop, stun, knockback, combo scaling, meter and guard/parry/dash-invulnerability for free. A trap must go through it, never subtract HP itself.

## Design

### The loop

1. **Place.** Press Trap: the hero plants a trap `TRAP_PLACE_PX = 72` ahead of its feet along the aim (8-way, auto-face rules of 2.22; the 4-way `dir` if no aim), clamped to the playfield and to the hero's own row band. Short cast recovery (`TRAP_CAST_TICKS = 14`: no walking, can still guard).
2. **Arming.** For `TRAP_ARM_TICKS` the trap is inert (dashed ring, "ARMING"). Nothing can trigger it, friend or foe. This is the anti-trap-on-a-rooted-foe and anti-spawn-camp window.
3. **Armed.** It triggers when a **foe** character's box overlaps the trigger box (inflated by `TRAP_TRIGGER_PX`), or when `TRAP_LIFE_TICKS` since arming run out (timeout). Timeout fires the same effect at the trap's spot, so a bomb is still a zoning threat if nobody steps on it.
4. **Fired.** The effect runs once (the fire bomb blast, a spike, a gust shove) or, for the Puddle, as a lingering patch. The trap slot frees.
5. **Cleared.** Round reset, a KO that ends the round, a hit by a countering fire shot (below), or its owner's death clear it without effect.

Friendly fire is off: a trap only affects the opposing team and ignores its own team's fighters, including benched and tagging ones. (Archon II's both-sides bombs are funny but a 1v1 fighter with a cooldown is better with readable rules.) The owner can always walk over its own trap.

### Variants (by the caster's element; kept to one rule each)

| Variant | Element | Fires on | Effect |
| --- | --- | --- | --- |
| Fire Bomb | fire | overlap or timeout | blast box `TRAP_BLAST_PX` (square, 112 px) around the trap, `TRAP_FIRE_DAMAGE` base through `applyArcadeHit`, medium hit-stop and stun, knockback away from the centre |
| Puddle | water | overlap (it stays) | no damage; foes inside walk at `TRAP_PUDDLE_SLOW_PM` of speed, and for `TRAP_PUDDLE_LINGER_TICKS` after leaving; dashes are not slowed (dash is the counter); expires on its life |
| Spike | earth | overlap or timeout | one spike hit: `TRAP_SPIKE_DAMAGE`, longer stun, small upward-juggle value (`juggle` +1) but low knockback |
| Gust mine | air | overlap or timeout | no damage; a big horizontal shove (`TRAP_GUST_KB_Q4`) away from the trap, 8-way along the line from the trap to the foe, into the wall bounce already in `arcade/knockback.ts` |

Heroes with no element or an omni element (Pax and the void heroes, `omni-special`) use the **stage element** (`ArcadeW.stage`) when there is one, else the Fire Bomb. Open question for the owner: give Pax a fifth neutral "Decoy" trap later (its own idea file), not in this WP.

Why these four: each does exactly one thing the others cannot (damage, slow, juggle, reposition), and each has a different counter (guard and dash for the bomb, dash through the Puddle, jump-away is not a verb here so walk around the Spike and the Gust, see below).

### Cooldown and cap

- **Cooldown** `TRAP_COOLDOWN_TICKS = 500` (10 s) per hero, booked from the cast (a cast that is refused places nothing and spends nothing). It is per CHARACTER, not per team (like `abil`), so in 2v2 a benched hero's cooldown keeps running.
- **Cap** `TRAP_TEAM_MAX = 2` live traps per team (`TRAP_WORLD_MAX = 4`). The cap is on the team: the third cast is refused (an error blip, no cooldown spent) so the player can read "no more". With a 10 s cooldown and 5 to 8 s lifetime the cap is rarely reached in 1v1; it matters in 2v2 tag (two heroes) and with the Puddle's long life.
- **Placement rules** (refused, nothing spent): the spot is inside an earth rock patch (a foe-of-other-element cannot stand there, so a trap on it is unreachable), within `TRAP_MIN_GAP_PX = 64` of an existing trap (no stacking), or the caster is stunned, in a dash, a charge or a super.
- **Allowed while** rooted (the root only stops walking, dash and charge), while guarding (the cast ends the hold), and during the entrance attack of a tag-in.

### Interactions

- **Snag (rope root).** The classic loop is "root, then drop a trap on the stuck foe". It must be strong but not a guaranteed combo: the root is 60 ticks, the arm delay is 30, so a trap dropped at the start of a root arms before the root ends and the foe cannot step off. Mitigations, in order of preference: (1) the trap is placed ahead of the caster, not under the foe, so the foe is not on it unless close; (2) `TRAP_ARM_TICKS = 30` plus `TRAP_CAST_TICKS = 14` makes the root nearly spent; (3) the `rootImmuneUntil` window (75 ticks) already prevents chains. Measure it (balance test "snag then trap") before adding a rule such as "a rooted fighter ignores traps for the rest of the root". Fire Bomb frees nobody; the **blast box counts as a fire hit**, so it frees a rooted foe (the shot still deals its damage), which also makes the Fire Bomb a poor follow-up to Snag on purpose.
- **Guard / parry.** The trap hit goes through `applyArcadeHit`, so a guarding foe blocks the Fire Bomb and Spike (chip and guard drain as any hit), and a parry in the window parries it (the trap still frees). A Gust shove and the Puddle slow are not blocked by guard (they are not damage), but a guarding foe does not walk anyway. A trap that fires on a guarded foe still frees its slot: guarding through a trap is the safe, boring answer and costs the guard meter.
- **Dash.** Dash i-frames (`invulnUntil`) carry through a trap box without firing it: a trap only triggers when a foe is not invulnerable at the tick of overlap (so a dash that ends inside the box fires it on the next tick). Dashing across the Fire Bomb is the intended skill answer. A perfect dodge event is not awarded (no attacker intent), to avoid meter farming.
- **Projectiles and fire.** A fire-element projectile (the same `SNAG_FIRE_ABILITIES` list, plus Fire Bomb blasts) that overlaps an enemy **Puddle or Gust mine** removes it (`doused` / `burned`), the shot continues. Fire does not affect an enemy Fire Bomb or Spike. This is the single counter-play rule from the brainstorm note ("fire burns traps"), kept tiny.
- **Terrain patches (2.15).** A trap on a same-element patch arms `TRAP_PATCH_ARM_BONUS = 10` ticks faster (a small, readable edge; first slice may skip it). A trap cannot be placed in an earth rock (see above). A weather swap that re-seeds patches (`swapAt`) does not touch traps; a trap that ends up inside a newly placed rock fires on timeout only.
- **Weather (2.14).** First slice: none. Later idea: Sun halves the Puddle life, Rain adds to the Puddle slow.
- **Hit-stop and super freeze.** Trap timers are in game ticks (`now(s)`), so a freeze or a super cut-in pauses the fuse, as for every cooldown.
- **Tag 2v2.** Traps belong to the TEAM (`owner = team`). A bench swap does not remove them; a KO of the owner does not either (the next hero's team owns it), except at the end of the round.
- **Wider arena (WP 38).** The trap table is in world x/y, clamped to `arcadePlayfield()`, so it follows the new width with no edit.

### Input

There is no free command bit (all 16 are named). Options:

1. **Reuse bit 6 (`capture`) as `trap` in Arcade (recommended).** Capture is deprecated (FUN-DESIGN 2.19, Snag replaces it) and the player-facing menu already hides it. Add `Cmd.trap = 1 << 6` as an alias and make the Arcade input path read it as Trap; Classic keeps reading it as capture. No format change (u16 packet and replay already carry it) and `inputMaskFor` is unchanged. Step 39a must first verify that no Arcade code path still acts on `Cmd.capture` (`systems/capture.ts` line 118 fires it; it must be gated by `!isArcade`), and that no recorded Arcade golden input stream has bit 6 set (if it does, that replay changes meaning: re-record anyway).
2. Widen `Command` to u32: touches the packet, replay, RLE and handshake formats. Too big for this WP.
3. A chord (Guard + Secondary): conflicts with the parry and buffering rules in `arcade/buffer.ts`. Rejected.

Press semantics: a rising edge through the existing buffer (8 ticks, `pressTick`) and `pressUsed`, so a press during hit-stop or cast recovery is remembered, exactly as dash. Add `pressTick` slot 7 (trap) per team; this makes `ArcadeT` grow, see "State".

Keys and touch:

- Keyboard: P1 `F`, P2 `M` (both free; P1 uses W A S D Space Enter E Q X R H, P2 uses I J K L U O Y N B T G V Comma). Pad: `Y` (button 3, which was capture). Update `key-map.ts`, `gamepad.ts` (`ARCADE_PAD`), the Arcade Versus help lines in `src/ui/screens/arcade-versus.ts`, and the Help screen.
- Touch: a new **Trap** button in the touch overlay next to Dash and Guard, minimum 48 px (the coarse-pointer rule in the size budget note), with the cooldown shown as a number of seconds as well as a fill (not colour alone). The word "Trap" is the button label.

### State (integer only, in `SimState.arcade`)

- **World, new `ArcadeW` slots:** `trapCount` and a table of `TRAP_WORLD_MAX = 4` entries of `TRAP_STRIDE = 7` ints: `kind` (0 = empty, 1..4 = fire, water, earth, air), `x`, `y` (top-left of the trigger box, integer px), `team`, `armAt` (game tick it arms), `endAt` (game tick the fuse ends), `owner` (character id, for the event and the meter credit). `ARCADE_W` grows by `1 + 4*7 = 29`. Slots are scanned in index order so iteration order is stable; freeing a slot sets `kind = 0` (no compaction, so snapshot/restore is a plain array copy).
- **Per entity, new `ArcadeE.trapReadyAt`** (game tick of the next cast; `ARCADE_E` 20 -> 21) and `trapSlowUntil` (the Puddle's linger end; `ARCADE_E` -> 22). The cooldown is NOT in `SimState.abil` (the four slots are full and `abil` is for character abilities with active counts).
- **Per team:** `ArcadeT.pressTick` 7 ints -> 8 (index 7 = trap); `ARCADE_T` +1 and the layout comment is updated. `tests/repo/no-team-block-alias.test.ts` guards the team aliasing: run it. The live-per-team count is derived by scanning the 4 entries, not stored (no way to drift).
- No floats, no trig, no division at sim level except by constants resolved at module load (`msToTicks` style). The blast and trigger tests are integer AABB overlaps; the 8-way gust direction is a table lookup on the existing 8-way aim (`arcade/aim.ts` has the direction vectors; the shove uses the same Q4 knockback integers as `knockback.ts`, with the sign from integer compares of dx, dy, never `atan2`).
- Randomness: none. The trap is deterministic from the input stream. (The cosmetic blast particles in the view must use the view RNG, never a sim stream.)
- A fuse that ends in the same tick as an overlap resolves in table order (index 0 first); both fire if they are two traps. Two foes in one blast (2v2) are hit in entity-id order.

### Sim system

New `src/core/sim/systems/arcade/trap.ts`, called from the Arcade step after movement and before the projectile system (so a trap armed this tick sees the foes' new positions, and a Fire shot this tick can douse it next tick):

1. `castTrap(world, sink, id)`: refusal checks, find a free table slot, write the entry, set `trapReadyAt`, emit `trapPlaced`.
2. `stepTraps(world, sink)`: for each live entry in index order: arming transition (`trapArmed` event once), overlap check against foe characters in id order (skip invulnerable, skip benched), timeout check, effect dispatch, emit `trapTriggered { slot, kind, reason }` where `reason` is overlap, timeout, doused or cleared.
3. `trapSlowPm(s, id)` read by the movement system for the Puddle slow (one multiply by an integer per mille and an integer divide by the constant 1000, as the weather code already does).
4. Round reset (`round.ts`) and `startMatch` zero the table (same as terrain re-seed).

Events (next free numbers in `SimEventKind`): `trapPlaced`, `trapArmed`, `trapTriggered`; text ids in `data/text-ids.ts` for the four names and the state words; `rules/describe.ts` gets a one-line description per variant. A new ability id per variant (`trap-fire-bomb`, `trap-puddle`, `trap-spike`, `trap-gust`) for the hit path, with `HIT_STRENGTH_OVERRIDE` rows (medium for the bomb and spike) and `HIT_STUN_OVERRIDE` as Snag does.

## View (39b)

All in `src/game`, reading `SimView` and events only (no sim feedback).

- **Telegraph ring, not colour alone.** Each trap draws a ring at the trigger box with a **word label** above it: `BOMB`, `PUDDLE`, `SPIKE`, `GUST` (short upper-case, a bitmap text) and the state word `ARMING` then `ARMED`. While arming: dashed ring, a countdown number in whole seconds (rounded up, 1 s = 50 ticks), and a slow fill. Armed: solid ring, the fuse seconds left (a bomb counts down, a Puddle shows its life). The ring is element-coloured, but shape carries the meaning: a **square-cornered** ring for damage traps (bomb, spike), a **round** ring for status traps (puddle, gust), so the colour-blind and monochrome reads are the same. Own traps get a small corner pip glyph and the prefix `YOU`; foe traps `FOE`, so the owner is clear in a mirror match with the same element. Contrast must pass the existing HUD text rules (outline + shadow).
- **Fuse tension.** In the last 50 ticks before timeout the ring ticks once a second (a flash of the label, an audio tick); in the last 15 it flashes faster. Every cue has an equal text or shape form (the countdown number), so audio and flashing are extras.
- **Blast and shove.** Fire Bomb: an expanding burst (frames from the particle skill, one `ParticleEmitter`) and the word `BOOM` floats up like a damage number; Spike: a spike sprite rising; Gust: a swirl and arrow lines pointing away; Puddle: a ripple. Hit feedback (spark, hit-stop, shake) is the existing hit path, since the trap hit uses `applyArcadeHit`.
- **Reduced motion** (the setting that disables shake and camera smoothing, see WP 38): no ring pulse, no flash, no screen shake on the blast, a static burst frame held for 8 frames instead of particles; the countdown number and the state word stay. Audio stays.
- **HUD.** The action bar gets a Trap slot (icon, key hint, seconds left on the cooldown as a number) and a small `TRAPS 1/2` count so the cap is visible. The off-screen indicator idea from WP 38 can also show foe traps outside the zoomed-out view (later idea).
- **Audio.** Place click, arm chirp, fuse tick, blast, puddle slosh, spike thud, gust whoosh: synthesised in `audio/sound-map.ts` like the weather cues (check VISUAL-QA for how cues are added).
- **Art.** Small sprite per variant (a bomb with a fuse, a puddle, a spike, a swirl). Must match Fiara's rigged and baked look; if the art is not ready, shipped fallback is the ring plus label alone (it is complete without art). Check with real-game screenshots (play-local skill).

## AI (39c)

`src/core/agents/scripted-ai/arcade.ts`, per personality (the AI is not sim state, so no SIM_VERSION effect by itself). `ObservationView` gets a read-only `traps` array (kind, x, y, team, armed, ticks left) copied from the table, and `trapReady`/`trapCount` for self.

- **Place when:** the trap is ready, the cap has room, and (a) the foe is 160 to 360 px away and approaching (zoning), or (b) the AI is retreating from a corner (drop it in the lane it is leaving), or (c) the foe is rooted by the AI's own Snag and the cast is safe (hard AI only, "snag then bomb" tested for balance). Rushdown personalities place late, zoners early. Never place at under 96 px from the foe (it would only be walked over in the arm window), never when stunned or guard-needed.
- **Avoid:** an armed foe trap whose box is on the path: step around it (a 1-tile lateral nudge in the chase code); dash through a Fire Bomb or Spike on Normal and Hard; Easy walks into traps now and then (as it already ignores dodges).
- **Counter:** fire heroes aim a shot at a foe Puddle or Gust that sits between them and the foe (cheap rule, Hard only).
- Probes: the existing AI snapshot tests (`arcade.test.ts`) get a trap case each; add `sim:match` metrics: traps placed, triggered by overlap vs timeout.

## Balance risks and starting numbers (39d)

Starting values (all ticks are 20 ms game ticks, damage is base before the caster's `damagePm`; tune with 8 seeds in `sim:match --tournament`, then `balance:compare`; a baseline re-record needs a stated reason):

| Constant | Start | Why |
| --- | --- | --- |
| `TRAP_COOLDOWN_TICKS` | 500 | 10 s, longer than Snag (400): it is zone control, not a poke |
| `TRAP_TEAM_MAX` / `TRAP_WORLD_MAX` | 2 / 4 | readable board, no minefield |
| `TRAP_PLACE_PX` | 72 | in front of the hero, inside its own reach |
| `TRAP_CAST_TICKS` | 14 | a gap to punish a mis-timed cast |
| `TRAP_ARM_TICKS` | 30 | 0.6 s: longer than a hit-stun beat, shorter than Snag's root |
| `TRAP_LIFE_TICKS` (after arming) | bomb 150, spike 200, puddle 300, gust 200 | 3 to 6 s; the bomb's fuse is short so the timeout matters |
| `TRAP_TRIGGER_PX` | 24 inflate (box = 56 px square plus the foe box) | forgiving to enter, easy to see |
| `TRAP_BLAST_PX` | 112 | about one hero width + margin |
| `TRAP_FIRE_DAMAGE` | 22 base (one medium hit, about the weakest Arcade projectile) | below the 30 of a heavy hit; a bomb alone never decides a round |
| `TRAP_SPIKE_DAMAGE` | 18 | spike has more stun and juggle |
| `TRAP_PUDDLE_SLOW_PM` / linger | 600 / 40 ticks | 40% slower, short tail so it is a speed bump, not a prison |
| `TRAP_GUST_KB_Q4` | one heavy hit of knockback | wall bounce is the pay-off; must not push across the whole arena |
| Trap hit meter gain | as a light hit, victim gains normal | no free meter farm |

Risks:

- **Snag + trap lockdown** (a rope root then a bomb) is the largest. Measure in the sim: root, 14 ticks cast, 30 ticks arm: the bomb fires at 44 of the 60 root ticks, so the foe takes it if it was within the box. The mitigation order is in "Interactions".
- **Corner camping**: an AI or a human parking two traps at its own spawn side and turtling. The cap 2, the 500-tick cooldown, the timeout and the fact that traps never hurt their owner side only partly deal with it; the round timer (`roundTimer`) already ends turtles. Measure stalemate rate (the report has it) and "time under traps".
- **No-skill damage**: a timeout bomb that nobody can dodge. The telegraph plus the guard and dash answers keep it fair; if the timeout damage is too high, cut the timeout effect to the same damage at 60% or make a timeout bomb non-lethal.
- **Water and air have no damage:** their win rate will drop; compensation is in their utility (the Puddle slows the foe into Snag/Charge combos, the Gust sets up wall bounces). Check race win rates stay 45 to 57% (the current band).
- **Fire counter** (fire shots douse the Puddle and Gust) makes water and air traps weak against fire heroes: acceptable, mirrors Snag's "fire burns the rope".
- **Readability on small phones** (0.3x scale at zoom-out): the ring plus label must stay legible; test the label at the smallest scale.
- **Online (rollback):** all state is in `SimState.arcade`, so snapshot/restore and rollback just work; the new input-bit alias changes nothing on the wire. The `SIM_VERSION` bump invalidates old replays and handshakes (expected).

## Determinism, version and goldens

- Rules in force: no `Date`, `Math.random`, `sin/cos/tan/atan2/exp/log/pow/hypot/cbrt/**`; time is `now(s)` (game ticks); integer state only; ESLint enforces. No RNG is drawn, so no stream order can change.
- `SIM_VERSION`: bump once, at 39a, to the next free number (32 if WP 38d has not merged, else 33; coordinate so the two do not both claim 32). Add the line to the version history comment and the `docs/DETERMINISM.md` table.
- **Why goldens change even if no one casts a trap:** `ARCADE_LENGTH` grows (more ints per entity, per team and in the world block), so every Arcade hash changes. Re-record the 5 Arcade goldens once, in 39a, with `pnpm golden:record` and the stated reason "arcade array grew for the trap table". Classic replays are header-only (version) changes; `classic-hash-pins` must be unchanged.
- Add a NEW Arcade golden in 39d (or 39a) that actually casts a trap of each element, so the effect code is pinned in Node, Chromium, Firefox and WebKit.
- Snapshot and restore round trip with a live trap (mid-arming and mid-fuse), a probe case via `src/core/sim/ability-probe.ts` for each variant.

## Test plan

Unit (Vitest, next to the code):
- `trap.test.ts`: place (position, clamp, min gap, refusals: stunned, dash, rock, cap, cooldown unspent); arming (a foe inside during arming does nothing, fires the tick after arming); overlap trigger; timeout trigger; one-shot frees the slot; friendly fire off; benched foes ignored; invulnerable (dash) foes ignored; guard blocks the bomb, a parry parries it; fire shot douses Puddle and Gust but not Bomb or Spike; Sun/round reset clears; frozen ticks (hit-stop, super) pause the fuse.
- Variants: Fire Bomb damage and knockback through `applyArcadeHit` (combo scaling applies); Puddle slow is exactly `TRAP_PUDDLE_SLOW_PM` of the speed and the linger ends on the tick; Spike juggle; Gust direction table for all 8 directions and wall-bounce.
- Snag interplay: root then trap timing; fire-bomb blast frees a root; a rooted caster can cast.
- Data tests: constants are integers, per-element table is complete, ids map to text ids, `describe.ts` has a line for each.
- `snapshot.test.ts` pattern: round trip with live traps; two runs from one seed give equal hashes.
- Property test (`sim.property.test.ts`, Arcade): random input streams never leave traps outside the playfield, never exceed the cap, never yield a negative table count; `alloc` test (no per-tick allocation) and `sim-perf` still pass.
- Input: `arcade-bindings.test.ts` gets F / M / pad Y; Classic still treats bit 6 as capture; `inputMaskFor` unchanged; `replay/validate.test.ts` unchanged.
- Repo tests: `no-team-block-alias.test.ts`, `docs/REPO-MAP.md` pin (new files), size budget.
- View: label text and shape per variant (pure function of the sim trap state, so it is testable without Phaser), reduced-motion path draws no pulse.

Golden: re-record the five Arcade goldens once (39a); add a new trap golden; `classic-hash-pins` unchanged; `pnpm test:legacy` green.

E2E (Playwright, one worker, several runs in a row, wait on `__TTE__.settled()`):
- `arcade-trap.spec.ts`: with `?manual=1`, press the Trap key, assert via `__TTE__` that the ring and label ("ARMING" then "ARMED") appear, the touch Trap button is at least 48 px and shows the cooldown, the foe walking into the ring takes damage (bomb) or is slowed (puddle); the cap blocks a third cast; reduced motion: no pulse class, countdown text present; a touch-size viewport still shows the button and the label.
- Existing Arcade specs keep passing (arcade, local, rounds, super, terrain, weather, pan).

Screenshots (real game, `?ff=play`): each variant arming and armed, the fuse near its end, the blast, the Puddle on a water patch, a phone-size viewport, reduced-motion on.

## WP breakdown (small commits, gate before each; serial on shared files)

1. **WP 39a: data and sim.** Data constants in `src/core/data/arcade.ts`, `Cmd.trap` alias (bit 6, Arcade input path; gate `capture.ts` to Classic), the `ArcadeW`, `ArcadeE` and `ArcadeT` slots, `systems/arcade/trap.ts` with the four effects, movement hook for the Puddle slow, events and text ids, `describe.ts`, round reset, unit and probe tests, snapshot test, `SIM_VERSION` bump, `golden:record` (reason stated), `docs/DETERMINISM.md`. Shared files (`src/core/index.ts`, `docs/REPO-MAP.md`, `tools/ci/size-budget.json`) one agent only. No view yet; the trap works headless and in `sim:match` via an input stream.
2. **WP 39b: view.** Ring, labels, countdown, effects, HUD slot and count, key `F`/`M`, pad `Y`, touch Trap button (48 px, cooldown number), Help and Arcade Versus lines, audio cues, reduced-motion, art or the ring-only fallback. Screenshots.
3. **WP 39c: AI.** `ObservationView.traps`, per-personality place and avoid rules, fire counter, tests, `sim:match` metrics. Balance baseline moves; no SIM_VERSION effect by itself.
4. **WP 39d: balance.** 8-seed tournament, `balance:compare`, tune the table above (a data change here means a further SIM_VERSION bump and one more golden re-record, so batch the tuning), snag-then-trap measurement, new trap golden, `balance:record` with reason.
5. **WP 39e: e2e and docs.** `arcade-trap.spec.ts`, visual baselines, new FUN-DESIGN section (2.23), ARCHITECTURE, `docs/REPO-MAP.md`, `CHANGELOG.md`, `PARITY.md` (no legacy row, state so), size budget; ideas file moved to `done/`.
6. Later ideas (own files in `ideas/`): a neutral Pax decoy trap, weather-trap interaction (Sun shortens the Puddle), same-element patch bonus, off-screen trap indicators, traps in World Tour bosses, a wider cap for the Void.

## Open questions

- Bit 6 reuse vs widening the command to u32: the recommendation is bit 6; confirm no Arcade path still reads capture before 39a starts.
- Friendly fire: left off. A later variant ("both-side bombs" as a stage hazard) fits Archon II better and belongs in its own idea.
- The `SIM_VERSION` number depends on the merge order with WP 38d.
