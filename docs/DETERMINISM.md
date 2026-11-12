# Determinism contract

The rules `src/core` must obey so that a match replays bit-for-bit. The determinism-reviewer agent
(`.claude/agents/determinism-reviewer.md`) checks diffs against this file. Architecture context:
[ARCHITECTURE.md](ARCHITECTURE.md).

## Contract

Inputs to a match are only the `MatchSetup` (`simVersion`, `seed`, `flags`, `chapter`, `difficulty`, rosters `p1`/`p2`; see
`src/core/sim/match.ts`) and one `Command` per side per tick (`src/core/sim/commands.ts`). The same inputs must give the same
per-tick `hash()` (`src/core/sim/hash.ts`) on Node, Chromium, Firefox and WebKit. Nothing else may influence the sim: no
clock, no host randomness, no DOM, no iteration order that depends on the engine.

## Allowed and banned APIs

Allowed in `src/core`: `+ - * / %`, comparisons, bit operations, and `Math.sqrt`, `abs`, `floor`, `ceil`, `round`, `trunc`,
`sign`, `min`, `max`, `fround`, `imul`, `clz32`. These are exactly specified by IEEE 754 or the ECMAScript spec, so every
engine returns the same bits.

Banned (ESLint bans in `eslint.config.js`, proved by the fixtures in `tests/lint/fixtures/` and `tests/lint/core-bans.test.ts`,
which also checks the merged config of a real `src/core` file because flat config replaces rule options instead of merging them):

| Banned | Why |
|---|---|
| `Math.sin cos tan asin acos atan atan2 sinh cosh tanh exp expm1 log log1p log2 log10 pow cbrt hypot` and `**`, `**=` | The spec lets engines approximate these, and V8, SpiderMonkey and JavaScriptCore differ in the last bits. One ulp of drift changes a position, then a hit, then the whole match ([ADR 0004](adr/0004-no-transcendentals-in-core.md)). Use the LUTs and integer directions below |
| Any other use of `Math`: computed access (`Math[k]`), aliasing (`const M = Math`, `f(Math)`), and members outside the allowed list (`Math.PI` too) | Each one is a way around the line above. `Math` may only appear as `Math.<allowed function>` |
| `Date`, `performance`, timers (`setTimeout`, `setInterval`, `requestAnimationFrame`, `queueMicrotask`) | Wall-clock time differs per run and per machine, and keeps running while paused (the legacy bug). Time is the tick |
| `Math.random`, `crypto` | Unseeded, so not reproducible. Use a seeded stream |
| `window`, `document`, `fetch`, `localStorage`, `navigator`, and the escape hatches `globalThis`, `self`, `global`, `Reflect` | Host state is not an input; the escape hatches reach every banned global under another name |
| `WeakRef`, `FinalizationRegistry` | Their behaviour depends on garbage collection timing |
| `async` functions, `await`, `for await` | The step is synchronous; microtask order is not an input |
| `phaser` and any `src/game`, `src/ui`, `src/testing` import, node builtins | Layering (`.dependency-cruiser.cjs`), so core runs in plain Node |
| `toFixed`, `toPrecision`, `toExponential`, `toLocaleString`, `toLocaleUpperCase`, `toLocaleLowerCase`, `localeCompare`, `Intl` (also as computed members such as `x['toFixed']`) | Formatting and locale-aware comparison are not sim logic, and the locale is host state |
| `sort()` and `toSorted()` without a comparator | Pass an explicit total comparator (`compareStrings`, `compareNumbers` in `src/core/math/compare.ts`) so the order is stated, not implied |

Lint cannot see through every indirection (for example `x[k]` with a computed string on a non-`Math` object), so review still
applies. Also forbidden by review (no lint rule): `sort` with a non-total comparator, and iteration over objects keyed by
floats. Iterate entities in id order only.

## Time

Time is the integer `tick`, at 50 Hz, so one tick is 20 ms. The wall clock lives only in the fixed-step driver
(`src/game/loop/fixed-step-driver.ts`), which injects it and calls `step` a whole number of times. Ability tables keep both the
legacy milliseconds and the tick count (`cooldownTicks`, `durationTicks` in `src/core/data/abilities-a.ts`,
`abilities-b.ts`); `src/core/data/abilities-b.test.ts` checks the conversion, including that delays that are not a multiple of
20 ms round up to a whole tick. Any new millisecond value must be converted the same way and tested.

## Randomness

All randomness is the integer-only sfc32 generator (`src/core/rng/sfc32.ts`). `STREAM_NAMES` in `src/core/rng/streams.ts` (the sim
streams) is `combat, capture, spawn, meta, cosmetic`; `AGENT_STREAM_NAMES` is `ai.p1, ai.p2` and `ARCADE_AI_STREAM_NAMES`
is `ai.arcade.p1, ai.arcade.p2`. Each stream is seeded by `seedSfc32` (`src/core/rng/seed.ts`):
`splitmix32(fnv1a("<seed>:<name>"))` fills the four state words, then the first 15 outputs are discarded
([ADR 0003](adr/0003-sfc32-rng-streams.md)). `Sfc32.int(n)` is exact because `u32 * n < 2^53` for `n <= 2^21`.

- Sim code draws only from the stream that names its purpose; adding a draw to a stream changes every later draw in it.
- Cosmetic code (fx, shake, particles) must never draw from a sim stream. `src/game/fx/event-fx.ts` uses its own private
  generator for that reason.
- The sim stream words live in `SimState.rng`, so they are part of the snapshot and the hash. The agent streams do not
  (since `SIM_VERSION` 2).
- `SimState` is mutated only by `step()`. Agents never write it: each agent owns an `AgentRng` (`src/core/agents/agent-rng.ts`),
  `seedSfc32(matchSeed, 'ai.p1' | 'ai.p2')` by side, seeded from `ObservationView.matchSeed` on the first draw. So the same
  setup and commands give the same hash whether or not an agent was asked for a command (`src/core/agents/agents.test.ts`).
- The Arcade AI layer (`src/core/agents/scripted-ai/arcade.ts`, `ArcadeTactics`) reads `ObservationView.arcade`, a copy of
  visible Arcade state (the enemy projectiles included), and draws from its own `AgentRng` on the `ai.arcade.pN` stream
  (WP-arcade-ai-personalities; before, it shared the agent's `ai.pN` stream): its personality once, a reaction delay per
  confirm, a reaction, a plan and a parry timing per threat, and the Rushdown's dash-in rate per tick. Without
  `view.arcade` (Classic) it returns the command unchanged and draws nothing (its stream is never seeded), so Classic
  agent streams and decisions are identical. Its memory (a fixed array of integers) and stream are in the agent's
  `save()`. Threat prediction (`impactIn`) steps the shot's per-tick velocity with plain adds and compares boxes: no
  transcendentals, no division. AI is not sim state, so its goldens replay recorded commands and a change of the AI never changes their hashes;
  still, a change of AI behaviour bumps `SIM_VERSION` (WP 39f, 35) so recordings and balance baselines made by the old AI
  are told apart (the replay fixtures then change only their `simVersion` header). Its diagonal shots (`diagonalLine`, 8-way aim) are a pure
  function of the view and the ready slot: no draw, no new memory.

## LUTs and directions

Non-integer exponentials (the level multiplier curve) are precomputed at build time by `tools/gen/gen-luts.ts` from
`tests/fixtures/legacy/rules.json` into `src/core/math/lut.generated.ts` as exact double literals. Never edit that file by
hand and never compute `pow` or `exp` at runtime in core. Directions are the integer 8-way tables `DIR8_X` and `DIR8_Y` in
`src/core/math/dir8.ts`; diagonals are `(+-1, +-1)` and deliberately not normalised, because legacy moves at full speed on both
axes. The Arcade 8-way aim (`src/core/sim/systems/arcade/aim.ts`) uses the same tables: a diagonal shot moves exactly
`+-speed` on both axes (no `sqrt`), a diagonal melee box is the integer-friendly `(w + h) / 2` square, and the aim is an
Int32 in the Arcade entity block (hashed and snapshotted with it; Classic has no block, and `castDir` is its plain `dir`). Geometry is AABB overlap with integer-friendly maths (`src/core/math/aabb.ts`). The Arcade playfield insets (`arcadePlayfield()` in `src/core/data/arcade.ts`, y 200..640) are integer px and the arena rectangle of every Arcade world (Classic keeps `DEFAULT_ARENA`), so every clamp is the same integer comparison. SIM_VERSION 32 (WP 38d, the panning wide arena) made it `ARCADE_ARENA_WIDTH` = 1920 px wide (was 1280); the Arcade start columns (`ARCADE_P1_START_X` 480, `ARCADE_P2_START_X` 1360: the old 1280 spots centred in it), the round reset and the terrain spawn keep-clear are integer constants too, and the terrain mirror centre moves to 960. Classic hashes are unchanged (its goldens changed only in their `simVersion` header); the Arcade goldens were re-recorded.

SIM_VERSION 33 (WP 39, traps) adds the Arcade `traps` system (`src/core/sim/systems/arcade/trap.ts`, after `movement`): a
4-entry world trap table of 7 Int32 each (kind, x, y, team, armAt, endAt, owner; kind 0 = free, scanned in index order and
never compacted, so snapshot/restore stays a plain array copy), the per-entity `trapReadyAt`/`trapSlowUntil` and a trap
press slot per team. Every trap time is a game tick (`now(s)`), so hit-stop and super freezes pause the fuse. Positions are
integer px (`Math.trunc` of the aim offset, clamped to the arena); trigger, blast and douse tests are AABB overlaps; the
Gust and blast direction is `dir8FromSigns` of integer offsets (the `dirToward` 2x rule, no `atan2`); the Puddle slow is one
per-mille multiply and divide by the constant 1000 (exact when no Puddle slows the walker). No RNG. Command bit 6 is Trap in
Arcade and capture in Classic (`systems/capture.ts` is gated with `!isArcade`); no recorded golden input stream set it.
Classic hashes are unchanged (goldens change only in their `simVersion` header); the Arcade goldens were re-recorded
because the hashed Arcade block grew.

SIM_VERSION 34 (WP 39e, trap tuning) changes data only: trap lives, the Puddle slow and linger and the Gust knockback in
`src/core/data/arcade.ts`, and a Fire Bomb or Spike hit takes the owner race's `damagePm` on its base, floored at
`TRAP_HIT_FLOOR` (`Math.max(base * pm / 1000, 20)`: one IEEE multiply and divide by the constant 1000, then the plain
`computeDamage` chain with a race pm of 1000), instead of after the weather. No new state, no RNG. Classic hashes are
unchanged (header only); the Arcade goldens were re-recorded because trap hits and timings changed, and a new scripted `arcade-traps` golden
fires each trap kind.

## State, snapshot and hash

- State is structure-of-arrays typed arrays plus scalars in `SimState` (`src/core/sim/state.ts`): per-entity `Float64Array` and
  `Int32Array` fields, the per-team block `teams` (not the per-entity `team`), the per-character ability block `abil`, `status`, `world` scalars (`tick`, `nextId`,
  `flags`, `matchSeed`) and `rng`. Entities are iterated in ascending id order; the allocator hands out the lowest free id.
- Anything that can affect a later tick must be in those arrays. Do not keep sim state in closures, module variables or
  objects outside `SimState`.
- `snapshot()` and `restore()` (`src/core/sim/snapshot.ts`) copy every array with `TypedArray.set`; `restore` must be the exact
  inverse. `SnapshotRing` holds a bounded history for rewind; `restoreTick` takes the newest entry of a tick and drops
  the later ones.
- Agent memory and agent random streams are outside `SimState`, so they are snapshotted separately: `Agent.save()` returns
  plain JSON data and `load()` is its exact inverse. Store `saveAgents(agents)` (an `AgentSnapshot`) as the payload of the
  same `SnapshotRing` entry and load it in `restoreTick`'s callback; otherwise a restored bot issues different commands.
- `hash()` is FNV-1a 32 over every value in `stateArrays` order as little-endian bytes (a `Float64` as its low then high
  32-bit word, an `Int32`/`Uint32` as one word), split with shifts so the platform byte order never matters. `-0` hashes as
  `0`, and NaN is detected with `v !== v` and hashed as the canonical words `(0, 0x7ff80000)`, never via its stored bits.
  `assertNoNaN` is the debug check. Freed slots are zeroed, status slots included (`freeEntity`), so stale data never
  reaches the hash.

## Events

`SimEvent = {tick, sourceId, kind, seq}` plus payload (`src/core/sim/events.ts`). The tuple is unique and stable across
re-simulation: events are a pure function of the tick, numbered by a per-tick counter, and never stored in state
([ADR 0009](adr/0009-events-carry-stable-ids.md)). Consumers dedupe by that id.

## Hit-stop and slow motion

Gameplay hit-stop or slow motion must freeze or skip ticks inside the sim. Phaser `timeScale` is cosmetic only. The
plumbing exists for the Arcade ruleset only ([FUN-DESIGN.md](FUN-DESIGN.md) section 2.1, `src/core/sim/clock.ts`): systems
read `now(s)`, which is `W.tick` in Classic and the Arcade `gameTick` in Arcade. `W.tick` stays the replay and event index
and always advances; `gameTick` does not advance while `isFrozen` (`W.tick < freezeUntil`, so `freezeUntil` is in `W.tick`
units), and `step` then runs only the `input` slot. Hit-stop (`src/core/sim/systems/arcade/hit.ts`) sets
`freezeUntil = max(freezeUntil, tick + 1 + n)` on a hit, `n` by hit strength (4, 6, 8, 10; KO 30), so the hit's own tick
finishes and the next `n` ticks are frozen; a frozen step emits no events, so event ids stay unique. In Classic
`isFrozen` is never true and `SimState.arcade` is empty, so Classic hashes are unchanged (pinned by
`tests/repo/classic-hash-pins.test.ts`). Hit-stun deadlines are in game ticks, and knockback speeds are Int32 in Q4
(1/16 px per tick) along the integer `DIR8_X/Y`, so `x += kbVx / 16` adds an exact dyadic fraction. Combo scaling is
one `* scalePm / 1000` on the Classic float damage (skipped at 1000 pm, so unscaled hits are bit-identical), and the
combo damage total is an Int32 in Q4 (`Math.round(amount * 16)`). The hyper meter (`arcade/meter.ts`) is an Int32 per
team: each gain is `Math.floor(dealt * pm / maxHp)` on the Classic float health removed (IEEE-exact multiply and divide,
no transcendental) or a fixed integer (+20 per cast), capped at 3000. A super (`arcade/super.ts`) spends 1000 and
sets the same `freezeUntil` deadline for 40 ticks (`freezeKind` 2); its band is an `effect` entity whose timing is in
game ticks (`spawnTick`, `expireTick`), and the team's `superState` holds its id + 1, so both snapshot and hash with
the rest of the state. The input buffer (`arcade/buffer.ts`) is state too: the team block holds the last command
(`prevCmd`, masked to the Arcade input bits), the game tick of each press edge plus one (`pressTick`) and the used
presses (`pressUsed`), all Int32. `bufferedCmd` only reads them, so every cast system sees the same command for the
tick; a snapshot taken while a press is pending restores it, and a replay of the same commands fires it on the same
tick.
KO slow motion (`arcade/round.ts`) is the same gate: for the 60 ticks before `slowMoUntil` (a `W.tick` deadline)
`isSlowMoHold` is true on every second tick, so `step` runs only the `input` slot there and the game clock advances at
half speed (`clockHeld` = frozen or held). Round phases, the timer and round wins are Int32 in the Arcade world and team
blocks; phase deadlines are `W.tick` values, the timer counts game ticks, the time-over score is
`Math.floor(hp * 1000 / maxHp)` summed per roster (an IEEE-exact multiply and divide), and the reset between rounds writes
fixed start values (and clears the buffered presses), so a snapshot anywhere in a round, the KO or a reset restores to the same future.
A dash (`arcade/dash.ts`) is Int32 game-tick deadlines in the entity block (`dashUntil`, `dashReadyAt`, the
`dashDodged` flag) plus its velocity in the Float64 `vx`/`vy` (`DIR8 * speed * 3`, an exact product); the double tap
reads `lastDir`/`lastDirPress` and the dash cancel `confirmTick` in the team block, all hashed and snapshotted. A hit or
stun ends a dash by moving `dashUntil` back to the current game tick.
A charge (`arcade/charge.ts`) is the same: Int32 `chargeUntil`/`chargeReadyAt` deadlines in the entity block and its velocity in `vx`/`vy` (`DIR8 * min(5 * speed, 30)`, an exact product, aimed once at the start); contact is an integer-free AABB test, so nothing needs a LUT; replays and snapshots in the middle of a charge restore to the same future (`charge.test.ts`).
Guard and parry (`arcade/guard.ts`) are Int32 game ticks and counters in the entity block (`blockUntil`, `parryUntil`,
`parryLockUntil`, and `guardDrain`, stored as the drained amount so the zero-filled block and the round reset are a full
meter); whether a character guards is read from the hashed `prevCmd`, never from the raw command. Chip damage is the
Classic arithmetic times `250 / 1000` (the combo-scale multiply), the drain is `Math.floor(chip * 8000 / maxHp)` (as the
meter gains), and a reflected projectile negates its Float64 velocity and reverses its dir8 with `(dir + 4) & 7`.
The Arcade numbers (`ARCADE_RACE_NUMBERS` in `src/core/data/arcade.ts`, WP-arcade-numbers) are integer per mille:
Arcade max HP is `Math.floor(maxHealth * hpPm / 1000)` once at spawn (`createMatch`), and an ability hit's Float64
damage is `dmg * damagePm / 1000` (two correctly rounded IEEE operations, skipped when the pm is 1000 so the value
stays exact) after the weather and before the combo scale; Arcade cooldown overrides are integer game ticks
(`cooldownTicksFor`). Classic reads none of them (its branch returns the legacy values), so its hashes are unchanged.
Terrain (`arcade/terrain*.ts`, SIM_VERSION 21) is Int32 in the hashed Arcade block too (`stage`, `swapAt`, `swapTo`, `terrainGen`,
`patchCount`, 5 rectangles of 4 ints, and each team's `inPatch` flag). Each layout draw seeds its own sfc32 from the match seed and
the stored draw counter (`seedSfc32(seed, 'terrain.<n>')`), so no `SimState.rng` word moves and Classic hashes are unchanged; the
draw loops are bounded (64 tries per patch pair, 8 redraws) and use `rng.int`, integer geometry and the mirror `2c - x - w`
only. The fire modifier is a Float64 `* pm / 1000` (the cap `min(.., plain * 2500 / 1000)`), skipped when the pm is 1000.
Weather (`arcade/weather.ts`) is Int32 in the hashed blocks: the world slot (`weather` kind, `weatherUntil` game tick,
`weatherTeam`), each team's `weatherCharge` (0..1000 per mille, WP 35: integer adds of `WEATHER_CHARGE_CAST` per cast or
`WEATHER_CHARGE_STEP` per moved tick, capped, spent to 0 by a cast, reset each round; no RNG, no division) and each character's
`weatherReadyAt` (a 50-tick lockout; its recovery is derived from it, so there is no extra timer). SIM_VERSION 19 added it
(Arcade only; Classic goldens changed only in their `simVersion` header).
The damage factor is an integer per mille applied to the Float64 damage in a fixed order: favoured `dmg * 1200 / 1000`,
counter `dmg * 1000 / 1200` (exactly /1.2, not a rounded 833 pm), each `*` and `/` one correctly rounded IEEE
operation, identical in every engine; a neutral element (or no weather) keeps the exact Classic value. Rounding: none
beyond IEEE round-to-nearest of those two operations; then the combo scale multiplies as before. Casts run team 0 then
team 1 in the `input` slot, so a same-tick tie always resolves to team 1's weather; no RNG is drawn.
Elemental clash (`arcade/clash.ts`, the `collision` slot) iterates live projectiles in ascending id order (pairs
`i < j`, each projectile in at most one clash per tick, tracked in two local 32-bit masks: no allocation, nothing
stored). The winner comes from `elementRelation` of the owners' elements (no RNG). The survivor's Float64 damage becomes
`max(hp - loserHp / 2, hp / 4)`: both divisions are by powers of two and so exact, and the subtraction is one correctly
rounded IEEE operation, identical in every engine; there is no integer rounding. The event's overlap centre is
`Math.round` of a half-sum (view data only, never read back). The slot sits behind the freeze gate like every system but
`input`, and returns at once in Classic.
The tag (`arcade/tag.ts`, called from `performSwap` in the `swap` and `death` slots) only writes hashed state: Int32
game-tick deadlines (the team's swap cooldown, the incoming character's `invulnUntil`), copies of the outgoing
character's position, facing and aim, and the entrance cast through the ordinary cast functions, whose cooldown
deadline is saved in a local and written back (no allocation, no RNG). The Arcade rest heal adds `maxHp * 10 / 1000`
(Arcade max HP is an integer, so this is one correctly rounded IEEE division) every 10 game ticks and clamps at the
rest cap, as Classic does with its 0.5%.

## Cross-browser golden replays

`tests/fixtures/replays/random-vs-random.replay.json` is a recorded bot match: header, run-length-coded inputs, a state hash
every `HASH_INTERVAL = 50` ticks and a final hash (`src/core/replay/format.ts`, verified by `playReplay` in
`src/core/replay/player.ts`). `tests/browser/determinism.browser.test.ts` replays it, and records a fresh match, in Chromium,
Firefox and WebKit (`pnpm test:browser`) and requires the Node-recorded hashes to match at every checkpoint. The first
divergent tick is reported, which localises a drift. Bots keep their randomness in their own `AgentRng`, so
`recordBotMatch` consults them on the recorded world itself.

The Arcade goldens `arcade-moves.replay.json`, `arcade-weather.replay.json` and `arcade-tag.replay.json` are in the same cross-browser list. Their
inputs are hand-authored (`tools/gen/arcade-moves.ts`, built with `tools/gen/arcade-script.ts`), not recorded from an AI, so
they cover the mechanics the random bots of `arcade-1v1` never press: buffered casts, combos, counter hits, dash and perfect
dodge, guard, guard break, parry reflection, the super freeze and a KO during a super, all five weathers, two clashes (a cancel and a
win by element whose projectile flies on), the round flow (KO, time over, best of three) and the 2v2 tag team (a tag
combo through the entrance attack, a KO entrance, a round that ends only when both heroes are down, bench recovery). `tests/repo/arcade-moves-coverage.test.ts` asserts from the events that each still fires.
`pnpm golden:record --ruleset arcade` rewrites them; like every golden they move only with an intended sim change.

## Feature flags in replay headers

Sim flags (`SimFlags`, `src/core/flags.ts`, all default off) change the simulation, so they are recorded in the replay header
as `encodeFlags` output (sorted names of enabled flags, joined by `,`) and `decodeFlags` throws on an unknown name so a replay
never silently drops a flag. In the world state, `flagBits` (`src/core/flags.ts`) sets bit `i` for `FLAG_NAMES[i]` (sorted
names, at most 16); internal world bits (`CAPTURE_GRANTED_BIT`, `WORLD_ENDED_BIT`) sit at bit 16 and up. Adding a flag
shifts the bits of the names sorted after it, which changes hashes only of matches with those flags on; bump `SIM_VERSION`
anyway. UI flags (`src/game/platform/flags.ts`) must not influence the sim and are not recorded. Unfinished
sim work goes behind a default-off sim flag ([ADR 0013](adr/0013-trunk-based-wps-and-flags.md)).

## Save format

Saves are outside the hashed sim state and are never read by `step`. The format, versions and migrations are in
[SAVE-FORMAT.md](SAVE-FORMAT.md) (code: `src/core/save/`). A save-affecting change needs a schema version, not a `SIM_VERSION`
bump, unless it also changes sim inputs.

## Changing the contract or data

Any change to this contract, to a system or its order in `src/core/sim/step.ts`, to a state layout, or to any sim data value
(`src/core/data/`) requires, in the same change:

1. bump `SIM_VERSION` in `src/core/version.ts` (its comment lists what each version changed);
2. regenerate goldens with `pnpm golden:record` (`tools/gen/record-golden.ts`), only when the change is intended;
3. commit the reviewed hash diff of `tests/fixtures/replays/` and say why in the commit message.

A changed golden without a bump, or a bump without a golden diff, is a blocker.

## Checklist for reviewers

1. `grep -rnE 'Date|performance|globalThis|Math\.(random|sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|exp|expm1|log1p|log2|log10|log|pow|cbrt|hypot)|Math\[|\*\*' src/core`
2. `pnpm lint` (the bans) and `pnpm test` (replay, snapshot and property tests such as `src/core/sim/sim.property.test.ts`).
3. Millisecond values divide into ticks; randomness from named streams only; new state is in `SimState`.
4. `SIM_VERSION` and goldens move together.
