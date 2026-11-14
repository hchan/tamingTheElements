# Architecture

Describes merged code only; anything not yet built is labelled "planned". Determinism rules live in
[DETERMINISM.md](DETERMINISM.md); decisions in [adr/README.md](adr/README.md); file map in [REPO-MAP.md](REPO-MAP.md).

## Goals and non-goals

- Goal: a deterministic 50 Hz simulation in plain TypeScript (`src/core`) with Phaser as a thin renderer on top, so the same
  seed and inputs give the same per-tick hash on every engine ([ADR 0002](adr/0002-deterministic-sim-50hz.md)).
- Non-goals: physics engines (AABB only, [ADR 0005](adr/0005-aabb-no-arcade-physics.md)), gameplay logic in scenes, and
  changing the legacy game (retired from the tree, kept at git tag `legacy-crafty-1.0` as the parity oracle, [ADR 0014](adr/0014-legacy-as-parity-oracle.md); [legacy/ARCHIVE.md](legacy/ARCHIVE.md)).

## Layers and import rules

| Layer | Path | May import | Must not import |
|---|---|---|---|
| core | `src/core/` | itself; `valibot` only inside `src/core/save/` | game, ui, testing, phaser, node builtins |
| game | `src/game/` | core via `src/core/index.ts` (or `menu-index.ts` / `lazy-index.ts`, see below) only; phaser | ui, testing (except `src/game/app/`, which may import ui) |
| platform | `src/game/platform/` | core via index; itself | the rest of game, ui |
| ui | `src/ui/` | core via index; `src/game/platform/` | phaser, testing, other game modules |
| testing | `src/testing/` | anything | (nothing in `src` outside it, or test files, may import it) |

`src/core/net/` (lockstep session, packet codec, `Transport` interface) is part of core, so it is pure: no DOM, Phaser, `Date`, game or ui. A real WebRTC `Transport` adapter will live in `src/game/`; the fake link and two-peer harness live in `src/testing/net/`. See [NETCODE.md](NETCODE.md).

Enforced by [.dependency-cruiser.cjs](../.dependency-cruiser.cjs) (rules `core-is-pure`, `core-no-node-builtins`,
`core-only-valibot-in-save`, `core-npm-allowlist`, `ui-layering`, `game-layering`, `core-only-via-index`, `platform-is-leaf`,
`not-to-testing`, `no-circular`) via `pnpm depcruise`, and for core purity also by the ESLint bans in
[eslint.config.js](../eslint.config.js). See [ADR 0017](adr/0017-dependency-cruiser-eslint-boundaries.md).

Core has three public entries. `src/core/index.ts` is the full barrel (sim, agents, replay, net; used by the Arena and the other
lazily loaded Phaser code, by tests and by tools). `src/core/menu-index.ts` is the menu-safe subset (data, rules, save, rng,
flags, plus erased `export type`s): the menu entry graph (`src/ui`, `src/game/app` flow/main/viewer, `src/game/platform`) imports
core only through it, so no sim module is reachable from the entry chunk (`tests/repo/menu-index.test.ts`). `src/core/lazy-index.ts`
is the entry for dynamic `import()` from the menu graph (random bot, replay validate/format, scripted AI): flow, download and the
replay viewer load it at match, download or replay time, and `main.ts` prefetches it once the menu is idle. A module reachable
from the entry's barrel lands in the entry chunk even when only a lazy chunk uses it; that is why the menu graph must not touch
`index.ts`. `vite.config.ts` pins two stable chunks: `core` (data, rules, save, rng, `preloaded` by the menu) and `sim`
(`src/core/sim|agents|replay|net` plus the match recorder, lazy), next to `phaser`. Budgets and numbers: [PERFORMANCE.md](PERFORMANCE.md).

```mermaid
flowchart TD
  APP["game/app (composition root)"] --> UI[ui]
  APP --> GAME["game (scenes, views, hud, fx, audio, input, loop)"]
  APP --> PLAT["game/platform (flags, storage)"]
  GAME --> PLAT
  UI --> PLAT
  GAME --> IDX["core/index.ts"]
  UI --> IDX
  PLAT --> IDX
  APP --> IDX
  IDX --> CORE["core (sim, rng, rules, data, replay, save)"]
  TEST["testing (stubs for legacy tests)"] -.->|any| CORE
  GAME -.-x|forbidden| UI
  CORE -.-x|forbidden| GAME
  CORE -.-x|forbidden| PHASER[phaser]
  UI -.-x|forbidden| PHASER
```

## Data flow

```mermaid
flowchart LR
  KB[Keyboard] --> HA[KeyboardAgent]
  BOT[RandomBot / scripted AI] --> CMD
  RP[ReplayAgent] --> CMD
  HA --> CMD["Commands [p1, p2] per tick"]
  CMD --> STEP["core/sim/step.ts step(world, cmds) -> events"]
  STEP --> ST[(SoA SimState incl. RNG words and tick)]
  STEP --> EV[SimEvents tick,sourceId,kind,seq]
  ST --> SNAP[snapshot / restore / hash]
  ST --> VIEW[RenderView -> Arena and Hud scenes]
  EV --> FX[fx and audio, dedupe by event id]
  STEP -->|matchEnded| RES[rules/results]
  RES --> SAVE[platform storage]
  SAVE --> UI[DOM menus]
  UI -->|MatchSetup| STEP
```

Real files: input in `src/game/input/keyboard-agent.ts`; agents in `src/core/agents/` (`agent.ts`, `random-bot.ts`,
`replay-agent.ts`, `scripted-ai/attack.ts`, `scripted-ai/arcade.ts`); view in `src/core/sim/view.ts`; scenes in `src/game/scenes/`; results in
`src/core/rules/results.ts`; storage in `src/game/platform/storage/`; app flow in `src/game/app/flow.ts`.

## Sim state layout

`src/core/sim/state.ts`. All state is typed arrays with fixed capacity (`MAX_ENTITIES = 64`); entity id equals slot index.

- Per-entity float arrays (`F64_FIELDS`): `x y px py vx vy w h hp maxHp dmgMult healMult speed baseSpeed restCap`
  (`px/py` are the previous tick's position, for render interpolation).
- Per-entity int arrays (`I32_FIELDS`): `kind defId team owner dir flags spawnTick expireTick hitMask`.
- `SimState.team` is the **per-entity** team index (0 = player, 1 = enemy). `SimState.teams` is the **per-team block**
  (`Int32Array`, `TEAM_STRIDE` ints per team: `activeSlot`, `swapCooldownUntil`). Index it as
  `teams[team * TEAM_STRIDE + TeamField.x]`; never alias the two (`tests/repo/no-team-block-alias.test.ts`).
- `SimState.abil`: per-character ability cooldowns and active counts (`ABIL_STRIDE` ints per entity id, index with
  `cooldownIdx(id, slot)` / `countIdx(id, slot)`; slot 0 primary, 1 secondary, 2 Capture). Legacy deep-copies
  `abilitiesInfo` into every character, so a swapped-in character has its own cooldowns.
- `SimState.status`: per-entity status slots (`STATUS_SLOTS` x `STATUS_STRIDE`: id, sourceId, startTick, expireTick,
  magnitude), see `src/core/sim/systems/status.ts`.
- `SimState.world`: scalars `tick`, `nextId`, `flags` (sim-flag bits plus the capture-granted bit), `matchSeed`.
- `SimState.rng`: the 7 RNG streams, 4 words each.
- `SimState.arcade`: the Arcade ruleset block (`ArcadeE`, `ArcadeT`, `ArcadeW` in `state.ts`, layout in
  [FUN-DESIGN.md](FUN-DESIGN.md) section 2.1). **Length 0 in Classic**, so it adds no bytes to the hash or snapshot.
- `EntityFlag` bits: alive, translucent, frozen, captured, benched, dead. Free slots are derived from the alive flag, so the
  allocator (`src/core/sim/alloc.ts`, lowest free id first) needs no extra state. `src/core/sim/world.ts` wraps the state with
  the walkable arena: Classic the legacy `DEFAULT_ARENA` (y 100..720), Arcade `arcadePlayfield()` (y 200..640, between the
  HUD and the action bar; FUN-DESIGN 2.1).

`createMatch` (`src/core/sim/match.ts`) builds the tick-0 world from a `MatchSetup`: p1 entities first, then p2, ids in roster
order, RNG streams seeded from `seed`.

## Tick pipeline

`step(world, cmds)` in `src/core/sim/step.ts` runs the `SYSTEMS` list in this fixed order, then increments `tick` and returns
the events. `noop` entries are reserved slots that keep the order stable as systems land. Systems read time through
`now(s)` (`src/core/sim/clock.ts`): `tick` in Classic, the Arcade `gameTick` in Arcade. The freeze gate runs only slot 1
while an Arcade freeze holds `gameTick` (`isFrozen`, never true in Classic); `tick` always advances. In Arcade, melee
and projectile hits go through `applyArcadeHit` (`systems/arcade/hit.ts`), which keeps the Classic damage arithmetic
times the combo scale (`arcade/combo.ts`) and sets the hit-stop freeze, knockback and hit-stun (`arcade/knockback.ts`,
`arcade/stun.ts`), then adds the hyper meter gains of both teams (`arcade/meter.ts`; casts add theirs from the cast
sites through `onArcadeCast`, a no-op in Classic); the Classic lines run
unchanged behind `!isArcade`. The cast sites and movement ask `canAct` (Classic: not frozen; Arcade: also not
stunned or block-stunned, not casting a super, in the fight phase, not dashing or in dash recovery and not holding
`Cmd.guard`), and Arcade movement applies knockback first and holds both axes at the walls. The
`health` slot is `arcadeSuper` (`arcade/super.ts`): `Cmd.super` spends a meter bar for a super (a 40-tick freeze, then
an `effect` entity whose hits go through `applyArcadeHit` as strength 3). Arcade aims 8 ways (`arcade/aim.ts`): movement
stores the dir8 of the held input in the entity's `aim` slot next to the 4-way `dir` (the reels), and the projectile and
melee cast sites read `castDir` (the plain `dir` in Classic); the super band keeps the 4-way `dir`. The Arcade input
buffer (`arcade/buffer.ts`) records press edges in the `input` slot on every tick, frozen ones included; the cast
systems and `arcadeSuper` read their command through `bufferedCmd`, which adds a press that is pending (at most 8 game
ticks old, not used yet) and turns a primary and secondary chord into `Cmd.super` (it returns the raw command in
Classic). A cast marks its slot's press used (`onArcadeCast`), a super start the super press. Arcade matches are best
of 3 (`arcade/round.ts` in the `cleanup` slot): only the `fight` phase lets anyone act or be hit, the KO slow motion
holds every second tick through the same freeze gate (`clockHeld` in `sim/clock.ts`), and the reset between rounds
clears the buffered presses. Arcade dashes (`arcade/dash.ts`): the `input` slot starts a dash on a pending `Cmd.dash`
press or a double-tapped direction (recorded by the buffer), movement steps it (12 ticks at 3x speed), `isInvulnerable`
covers its dash ticks 2..7 (an enemy projectile overlapping then is a perfect dodge in the projectile system), `canAct`
waits out its recovery, and a dash within 10 ticks of the team's last confirmed hit cancels melee recovery. A melee Charge (`arcade/charge.ts`, FUN-DESIGN 2.17): the `input` slot starts it on a pending `Cmd.charge` (`chargeStarted`), movement steps it (12 ticks at 5x speed, at most 30 px a step, ending `blocked` at a wall or rock), and the `collision` slot ends it on contact (`arrived`, the 8-damage hit with 20 ticks of stun, 40 meter), at the last tick (`expired`) or on a stun (`interrupted`); `chargeEnded` carries the reason. Guard and
parry (`arcade/guard.ts`): after the dash the `input` slot regenerates the guard meter and opens a parry window on a
pending guard press (with a whiff lock); `applyArcadeHit` checks the window first (a parry: no damage, the projectile is
reflected or the melee attacker stunned) and then `isGuarding` (chip damage, block-stun, guard meter drain and break);
supers skip both. Weather (`arcade/weather.ts`): after the guard pass the `input` slot ends a weather whose timer ran
out and casts on pending `Cmd.weather` presses once the team's weather charge is full (`ArcadeT.weatherCharge`, filled by ranged casts or
melee-class walking in `arcade/meter.ts`, spent by the cast, reset each round; the caster's element weather for 500 game ticks, a
50-tick lockout per character whose first 16 ticks are cast recovery); the world block holds the one weather slot, and
`applyArcadeHit` scales the attacker's damage by `weatherDamage` between the element chart and the combo scale.
Stage terrain (`arcade/terrain.ts` queries, `arcade/terrain-layout.ts` layout and per-tick pass, FUN-DESIGN 2.15): a round start
and a weather swap draw 3 to 5 point-symmetric element patches into the world block; the `input` slot's terrain pass lands a
swap after its 30-tick telegraph, emits `patchEntered`/`patchLeft` and runs the water heal; `movement.ts` clamps non-earth
heroes at rocks (`rockStop`) and applies the air speed, `projectile.ts` removes shots at rocks (`shotBlocked`), and
`applyArcadeHit` applies the fire patch with the capped total (`capDamage`).
Elemental clash (`arcade/clash.ts`, the `collision` slot): overlapping projectiles of opposing teams clash by their
owners' elements (pairs `i < j`, one clash per projectile per tick); the advantaged one survives with
`max(hp - loserHp / 2, hp / 4)` damage, any other relation destroys both, and each side gains 50 meter.
Tag team (FUN-DESIGN 2.6): the `swap` slot is the tag in Arcade. A tag needs the active character free (`isFree`) and
books 150 game ticks; `performSwap` puts the partner at the outgoing character's spot and runs the tag entrance
(`arcade/tag.ts`: 20 ticks of invulnerability, 60 after a KO auto-swap from the `death` slot, and the primary cast at
once through the usual cast functions with its cooldown restored, so it is free; `tagIn`). The `rest` slot heals benched
characters 1% of max HP every 10 game ticks up to the rest cap (the red life), and only while benched.

| # | System | Status |
|---|---|---|
| 1 | input (`systems/arcade/input.ts`) | Arcade only (returns at once in Classic): press edges for the input buffer on every tick; stun and combo expiry (`recovered`, `comboEnded`), dash starts (`dashed`), guard meter regeneration and parry windows, weather expiry and casts (`weatherEnded`, `weatherChanged`) on unfrozen ticks |
| 2 | swap (`systems/swap.ts`) | implemented; Arcade: the tag and its entrance (`systems/arcade/tag.ts`, `tagIn`) |
| 3 | movement (`systems/movement.ts`) | implemented |
| 4 | abilities | no-op (planned) |
| 5 | melee (`systems/melee.ts`) | implemented |
| 6 | projectiles (`systems/projectile.ts`) | implemented |
| 7 | capture (`systems/capture.ts`) | implemented |
| 8 | collision (`systems/arcade/clash.ts`) | Arcade only (returns at once in Classic): `arcadeClash`, projectile clash by element (`clash`) |
| 9 | health (`systems/arcade/super.ts`) | Arcade only (returns at once in Classic): `arcadeSuper`, supers (`superStarted`, `superEnded`) |
| 10 | death (`systems/death.ts`, hp <= 0 decided at end of tick) | implemented |
| 11 | debuffs (`systems/debuffs.ts`) | implemented |
| 12 | status (`systems/status.ts`, timers) | implemented |
| 13 | rest (`systems/rest.ts`, benched healing) | implemented; Arcade: 1% every 10 game ticks, benched only |
| 14 | cleanup (`systems/arcade/round.ts`) | Arcade only (returns at once in Classic): `arcadeRound`, round phases, timer, KO, best of 3, reset between rounds (`roundStarted`, `fight`, `ko`, `timeOver`, `roundEnded`) |
| 15 | end (`systems/end.ts`, match-end check, `matchEnded` event) | implemented; Arcade: after the round that gives a side 2 round wins |

Adding or reordering a system changes every hash: bump `SIM_VERSION` and re-record goldens (see DETERMINISM.md).

## Commands and agents

A `Command` is a `u16` bitset per player per tick (`src/core/sim/commands.ts`: up, down, left, right, primary, secondary,
capture, swap1..4; bits 11..15 reserved in Classic, while Arcade opens 11..15 for dash, guard, super, weather and charge; `inputMaskFor(flags)`
gives the accepted bits for the net session and replay validation). An `Agent` (`src/core/agents/agent.ts`) turns a read-only `ObservationView` into a
`Command`; it must be a pure function of the view plus its own memory and random stream (`AgentRng`, seeded from
`view.matchSeed` and the side). Neither lives in `SimState`, and `collectCommands` only reads the world: `step` is the only
thing that mutates `SimState`. A replay stores the commands, so replays never re-run agents. In Arcade the view also
carries `arcade` (`ArcadeView`: both meters, both stuns, the freeze, both live combos, own super running, the round
phase, the press ages, the enemy projectiles on the field with their velocity, and the ticks until its own dash, weather and charge
are ready plus its weather charge; only what the screen shows), which the scripted AI's Arcade layer (`scripted-ai/arcade.ts`, knobs and
personalities in `scripted-ai/arcade-ai.ts`) reads, drawing from its own `ai.arcade.pN` stream; Classic views have no
`arcade`, so Classic agents decide exactly as before.

## Events and stable ids

`src/core/sim/events.ts`. Each step creates an `EventSink` for the current tick; `emit(sourceId, kind, payload)` numbers events
with a per-tick `seq`. The id of an event is `(tick, sourceId, kind, seq)`; it is stable across re-simulation because events are
a pure function of the tick and are never stored in state ([ADR 0009](adr/0009-events-carry-stable-ids.md)). Kinds today:
`moved, blocked, damage, died, swapped, captured, captureFailed, matchEnded` (Classic, kinds 1..30), plus the Arcade-only
`hitStop` (40), `hitConfirmed` (41), `comboEnded` (42), `meterLevel` (49), `superStarted` (50), `superEnded` (51) and
`roundStarted` (53), `fight` (54), `ko` (55), `timeOver` (56), `roundEnded` (57) and `recovered` (58)
([FUN-DESIGN.md](FUN-DESIGN.md) section 2.1). Consumers (`src/game/fx/event-fx.ts`,
`src/game/audio/audio-manager.ts`) dedupe by this id, so rewinding or re-stepping never doubles an effect. In Arcade,
`EventFx` drives hit feedback from `hitConfirmed` (flash, sparks by strength, damage number) and the `hitStop` after it
(victim jitter until the freeze deadline, shake by strength or KO) and skips the paired `damage`; Classic keeps reacting to
`damage`. `CharacterView` owns the tint and counts rendered frames for the flash; effects hold while the driver is paused.

## RNG streams

`src/core/rng/`: `sfc32.ts` (integer-only generator), `seed.ts` (`fnv1a`, `splitmix32`, `seedSfc32`), `streams.ts`
(`STREAM_NAMES = combat, capture, spawn, meta, cosmetic`, `AGENT_STREAM_NAMES = ai.p1, ai.p2`,
`ARCADE_AI_STREAM_NAMES = ai.arcade.p1, ai.arcade.p2`). `createMatch` seeds the five sim streams from the match seed and
stores them in `SimState.rng`; agents seed their own `ai.pN` stream (`AgentRng`), and the Arcade AI layer its
`ai.arcade.pN` one, outside `SimState`. `combat`, `capture`, `spawn` are reserved for the sim and `meta` is used by out-of-match rules (`rules/new-game.ts`,
`rules/results.ts`, `rules/opponents.ts`, `rules/garrison.ts`), outside the hashed state. See [ADR 0003](adr/0003-sfc32-rng-streams.md).

## Snapshot, restore, hash

- `src/core/sim/snapshot.ts`: `createSnapshotBuf`, `snapshot` and `restore` copy every array with `TypedArray.set` (no
  allocation), and `SnapshotRing` keeps a fixed-depth ring keyed by tick for rewind. `restoreTick` restores the newest
  entry of a tick and drops the entries pushed after it. Each entry can carry a payload (`SnapshotRing<AgentSnapshot>`)
  for state outside `SimState` that must rewind with it. `state.ts` also has the allocating
  `snapshotState`/`restoreState` pair.
- Agent memory (`RandomBot`'s held command, `ScriptedAI`'s movement timers, facing and previous position, the Arcade
  layer's confirm and threat ticks, reactions, defence plan and personality, every agent's `AgentRng`) is not in `SimState`. `Agent.save()`/`load()` copy it as plain JSON data, and `saveAgents`/`loadAgents`
  (`src/core/agents/agent.ts`) make the `AgentSnapshot` to store next to the world snapshot, so a bot issues the same
  commands after a restore (`src/core/agents/agent-snapshot.test.ts`).
- `src/core/sim/hash.ts`: FNV-1a 32 over every value as little-endian bytes in `stateArrays` order, read as 32-bit words
  and split with shifts so the platform byte order does not matter; `-0` hashes as `0` and every NaN as the canonical
  words. `assertNoNaN` is a debug check.

## Fixed-step driver

`src/game/loop/fixed-step-driver.ts`. The `FixedStepDriver` takes an injected monotonic clock (the Arena passes
`performance.now`; core never sees a clock), clamps each frame to 250 ms, runs at most 5 ticks of 20 ms per frame, drops the
leftover when the cap is hit, and returns `alpha = acc / 20` for render interpolation. `pauseOnHidden` pauses while the
document is hidden. Pause is simply not stepping, so game time never advances while paused. Pauses are tracked per reason
(`user`, `hidden`, `overlay`, `replay`, `ended`): the sim runs only when no reason holds it, so showing the tab again never
resumes a battle the user paused.

```mermaid
sequenceDiagram
  participant RAF as Phaser frame
  participant D as FixedStepDriver
  participant S as core step
  RAF->>D: frame(now)
  D->>D: acc += clamp(dt, 0, 250ms)
  loop while acc >= 20ms and steps < 5
    D->>S: tick() -> step(world, [cmd1, cmd2])
    S-->>D: events
  end
  D->>RAF: alpha = acc / 20ms
```

## Replays, save format and flags

- Replays (`src/core/replay/`): `format.ts` (`ReplayHeader`, `ReplayFile`, hash checkpoint every `HASH_INTERVAL = 50` ticks),
  `rle.ts`, `recorder.ts`, `player.ts` (`playReplay` verifies hashes and reports the first divergent tick), `record-bots.ts`.
  The golden fixture is `tests/fixtures/replays/random-vs-random.replay.json`.
- Save format: [SAVE-FORMAT.md](SAVE-FORMAT.md), code in `src/core/save/` (valibot, v0 to v1 migration), storage in
  `src/game/platform/storage/`. `src/core/save/validate.ts` adds semantic checks (known characters, ranges, sizes) that
  `migrate()` runs; `src/core/replay/validate.ts` validates a replay (including RLE run lengths, without decoding) before
  `createMatch`. Neither changes the on-disk formats. The IndexedDB store restores the newest good backup of the last 5 when
  the live save is corrupt, and warns through `notices.ts` (shown by `#storeNotice`) when another tab saved.
- App flow failures: `AppFlow` never leaves the battle screen hung; load, setup and Phaser creation errors show an error
  screen with Back to menu, and a failed post-match save shows the result with a retry. Test builds inject each failure with
  `?ff=failLoad|failSetup|failGame|failSave`.
- Flags: two kinds. Sim flags (`SimFlags` in `src/core/flags.ts`, all default off) change the simulation, so they are part of
  `MatchSetup`, written into the replay header by `encodeFlags` (sorted names) and mirrored into `world[World.flags]`. UI flags
  (`UiFlags` in `src/game/platform/flags.ts`, `?ff=` in dev/test builds only) never affect the sim and are not recorded;
  `getUiFlags` tests the build mode statically, so production bundles do not even contain the parser. A production build
  opts into a preview through a setting instead (Arcade Versus: the `arcadePreview` key of the settings save).

## Scenes and DOM menus

Phaser scenes in `src/game/scenes/`: `Boot`, `Preload`, `Arena` (runs the driver and sim, installs the test probe), `Hud`
(parallel to Arena, reads `RenderView`), `Cinematic` (data-driven by `src/game/cinematics/`). DOM menus (`src/ui/`) own
everything outside a match (router, screens); the composition root `src/game/app/` wires them to scenes. Scenes read the sim
only through the `RenderView` facade in `src/core/sim/view.ts` and never decide gameplay (for example death is a sim system).
`RenderView.arcade()` (undefined in Classic) adds the Arcade read-outs: hit-stop freeze, live combo hits and damage and the
hyper meter per team, stun, invulnerability, the 8-way cast aim, the guard meter and whether it guards per character. In an Arcade match the Arena feeds an `ArcadeHudModel`
(`src/game/hud/arcade-hud.ts`: pooled damage numbers, combo counters, hyper meters) from events and `arcade()`, ages it while the driver
runs, and hands it to `Hud` in `HudData`, which only draws it with pooled texts. The super cinematic is the fx sink's
`superCut`, started by `EventFx` from the super freeze (`hitStop` cause 2, the caster as its source): the Phaser sink
imports `src/game/fx/super-view.ts` on the first super, so Classic never downloads it (its own `super-view` chunk). Per
scene it makes one dim overlay, band, portrait and two texts on first use, runs on the view tick (it holds while paused),
lifts the caster over the dim, punches the camera in about the caster and restores the fit zoom at the end; the frame
plan (`super-cinematic.ts`) is pure. The music duck is the `superStarted` sound cue's. `arcade()` also reads the round,
its phase, the round timer and the round wins per team: in every Arcade match (replays included) the Arena imports
`src/game/hud/round-view.ts` (its own `round-view` chunk) and feeds it each tick's events; it draws the round banners,
the timer and the round pips into the `Hud` scene (so the Arena camera's shake and punch-in never move them) from objects
made once, under one Hud `update` listener, removed with either scene, and says its lines through the Arena's live-region
`Announcer`. The banner rules (`round-announcer.ts`) are pure and deduped by event order. The round view also mounts the
defence view (`src/game/fx/defence-view.ts`, WP-arcade-defence-view) in the Arena scene and hands it the same events: its
own `defence-view` chunk (a `codeSplitting` group in `vite.config.ts`, as `round-view` imports it statically), so Classic
never downloads it. The Arena passes its character view pool, from which the view reads each fighter's drawn sprite (the
shield and guard bar follow it; the afterimages copy its frame). The rules (`defence-fx.ts`: which effect each of
`dashed`, `perfectDodge`, `guarded`, `parried` and `guardBroken` gives, reduced motion, live lines) are pure; the Phaser
side keeps typed-array pools redrawn into two Graphics each frame, six afterimage Images and four pop Texts made on first
use, samples trails and afterimages on every sim tick, runs on the view tick (it holds while paused), and leaves with the
Arena under one `postupdate` listener. The round view mounts the weather view (`src/game/fx/weather-view.ts`,
WP-arcade-weather-view) the same way (its own `weather-view` chunk and `codeSplitting` group); its consumer hands each
tick's events on to the defence view's, so the round view holds one. It draws the sky tint and particles in the Arena and
the weather badge, called line and charge chip (WP-arcade-weather-charge, from `RenderView.arcade().weatherCharge`) in the `Hud` scene, follows `RenderView.arcade().weather` and `weatherLeft` for what is
up, and takes the called line and live lines from `weatherChanged` and `weatherEnded` (pure rules in `weather-fx.ts`).
The Arena mounts the terrain view (`src/game/fx/terrain-view.ts` with pure `terrain-fx.ts` and the tiled floor `terrain-tiles.ts`/`terrain-floor.ts`: a seeded, point-symmetric grid per stage on one tilemap layer, WP-tile-floor, WP-arcade-terrain-view, its own
`terrain-view` chunk and `codeSplitting` group) beside the round view in every Arcade match and feeds it each tick's events. It draws
from `RenderView.arcade()` (`stage`, `swapLeft`, `swapTo`, `patchCount`, `patches`): the stage backdrop, the patch art (patterns,
word labels, glow, raised rocks) redrawn only when the layout changes (fades are object alpha), pooled particles and block sparks
in the Arena, and the buff badge in the `Hud` scene; the six terrain events give the live lines and the spark. One `postupdate`
listener; the test hook's `arena.terrain()` reads its last frame.
The pose layer (`src/game/views/pose-layer.ts` with pure `pose-math.ts`, WP-arcade-pose-layer, FUN-DESIGN 2.16 step 1) is
mounted by the Arena in every match (Classic and Arcade) as its own lazy `pose-layer` chunk, fed the same events. It runs on
`postupdate`, after the Arena drew the interpolated characters and projectiles (the base views stay the owners of position,
size, tint and alpha and reset them each frame), and only adjusts the pooled Images: the walk frame is driven by the distance
walked on screen (30 px per frame, the old 8 fps at base speed), so feet match dash, slow and speed effects at any display
rate; a lean towards the heading and the 8-way aim (diagonals use the nearest side reel, mirrored), a start squash and a stop
rebound, idle breathing, and in Arcade only the event poses (cast from a projectile first seen at its caster, hurt, guard
crouch, dash stretch, KO fall as a pooled ghost, victory hop, tag-in slide) as scale, rotation, offset about the feet and alpha.
Its animation clock advances only while the sim runs (not paused, not in a hit-stop), so frozen characters hold still; reduced
motion drops lean, bob, breathing and every pose (the tag-in keeps a fade). Projectiles get shortest-arc rotation easing, a
60 ms spawn ease-in and a fading ghost when they end; the camera shake decays quadratically. Nothing reads or writes sim state.
The defence view mounts the clash burst (`src/game/fx/clash-view.ts`, WP-arcade-clash; its own `clash-view` chunk and
`codeSplitting` group) in the Arena and hands it the same events: one Graphics made on the first `clash`, a typed-array
pool of bursts drawn at the overlap centre the event carries, one `postupdate` listener (pure rules in `clash-fx.ts`).
The weather view mounts the tag-team view (`src/game/hud/tag-view.ts`, WP-arcade-tag-view; its own `tag-view` chunk and
`codeSplitting` group) first and passes its events through it; with one hero a side it builds nothing. In 2v2 it reads
every hero off `RenderView.forEachCharacter` (benched and dead included) and the tag cooldown off
`RenderView.actionBar(team)` (`swapReadyTick` against the game clock, `TAG_COOLDOWN_TICKS` from core) once per view tick,
and draws in the `Hud` scene the red life (rest cap above the health) as dashes on each bar, a gold frame on the active
bar, "IN" and "BENCH" lines, and a tag bar and word under each side's bars, and the "TAG!" call; in the Arena the
entrance flash at the incoming hero's spot from `tagIn` (a KO entrance when the outgoing hero is dead) and a "TAG"
caption over the swap slot; lines go to the live region (pure rules and the bar geometry, pinned to `bars.ts` by a
test, in `tag-fx.ts`). One Hud Graphics and seven Texts at most, one Arena Graphics and Text, one `postupdate` listener.

Arcade Versus (`#arcade`, FUN-DESIGN WP 11) is a separate flow, not part of `AppFlow` (`flow.ts`, the story: garrison,
battle, results, save). `main.ts` adds the route with a dynamic import, so its code is its own `arcade-versus` chunk and
the menu entry stays small and Phaser-free. The screen (`src/game/app/arcade-versus.ts`, DOM in
`src/ui/screens/arcade-versus.ts`, picks in `src/game/app/arcade-pick.ts`) runs picker, battle and results inside the
one route. With the battle it loads the match builder, its own `arcade-setup` chunk: `arcadeLaunch`
(`src/game/app/arcade-setup.ts`) builds a 1v1 or 2v2 `MatchSetup` with `rulesetArcade`, `difficulty: 1`, chapter 1 (no
Capture) and 0 XP (in 2v2 the player's two races, and the AI's race plus a second one drawn from the match seed among
the races nobody picked), and the core `ScriptedAI` with its Arcade layer as the enemy (Easy drops its super; in 2v2 one
per hero, the one in play answering, as the tools' team bot). The Arena needs nothing new: the Arcade HUD, juice, super
key and cinematic follow the world flag. The Arcade-only view the builder brings is the 8-way aim arrow
(`src/game/fx/aim-view.ts`), handed to the Arena as the launch's `arcadeView` hook (which also keeps the render view, so
the 2v2 results can name every hero's HP or knock-out): one Graphics drawn once,
moved and turned after each scene update from `RenderView.arcade().aim`, static (no tween, so reduced motion needs no
variant), removed with the scene. The same hook loads the Arcade audio layers (`src/game/audio/arcade-audio.ts`,
WP-arcade-audio-layers; its own `arcade-audio` chunk, so Classic never downloads it): they wrap the battle
`AudioManager`'s `consume` (so they hear the live ticks the sound map hears, and replays stay silent), synthesise short
cues with oscillators and band-passed noise into the `sfx` bus (no audio files; rules, voice limit and the hit pitch cycle
in the pure `arcade-cues.ts`), cut the music for 300 ms on a KO, and come off with the Arena (every synth node
disconnected, the class `consume` back). The flow has no save store, so it writes no progress,
XP, capture, objectives or garrison (a repo test and a unit test guard it); the only write is the playtest replay, when
recording is on. The route is offered when Settings > Arcade Versus (preview) is ticked (the save's `arcadePreview`) or
with `?ff=arcade` in dev and test builds; otherwise `#arcade` returns to the main menu. Pointer-only Super, Guard,
Dash and Weather buttons over the arena (and Tag in 2v2, the Swap 1 key) hold the bound key of their action for touch
players.

## Legacy concept map

| Legacy (Crafty, `war/WEB-INF/private/src/` in tag `legacy-crafty-1.0`) | New module |
|---|---|
| character, ability, enemy AI scripts | `src/core/data/`, `src/core/sim/systems/`, `src/core/agents/` |
| `Crafty.e` entity components | SoA arrays in `src/core/sim/state.ts` |
| HUD scripts (`topHUD.js`) | `src/game/hud/`, `src/game/scenes/Hud.ts` |
| scenes (`scenes.js`) | `src/game/scenes/`, `src/game/cinematics/` |
| menus and persistence | `src/ui/`, `src/core/save/`, `src/game/platform/storage/` |

Per-module detail: [legacy/INVENTORY.md](legacy/INVENTORY.md).

## Presentation scaling vs simulation scaling

The simulation is fixed: a logical 1280x720 arena, speeds in px/tick, 50 Hz. Nothing about the window, aspect
ratio, device pixel ratio or the display-size setting reaches `src/core`; an e2e test
(`tests/e2e/responsive.spec.ts`) proves the sim hash after 50 stepped ticks is identical at every viewport.

Presentation adapts in layers (`src/game/boot/viewport.ts`, `presentation.ts`, `src/ui/styles/main.css`):

- **Scale.FIT with CENTER_BOTH, not ENVELOP.** FIT letterboxes, so the whole arena, HUD and action bar are always
  visible with 16:9 preserved; ENVELOP would crop the HUD and action bar on any other aspect ratio. Phaser handles
  window resize, orientation change and fullscreen itself.
- **Resolution.** The backing store is 1280x720 times `pickResolution(devicePixelRatio)`: never below 1.5 (a 1920x1080 backing store, the default since
  2026-11-13), above that ceil, capped at 2 (3 costs 2.25x more pixels for little visible gain). Each scene calls `fitScene` (camera zoom = resolution, centred on the
  logical arena) and Phaser text uses `crisp()`, so scene code and pointer coordinates stay logical. The ratio is read
  once at game creation.
- **HUD placement.** HUD and action bar draw inside the logical canvas, so they are anchored to the letterboxed game
  area by construction. The `#game` box excludes the device safe-area insets (`viewport-fit=cover`).
- **Fullscreen** button (`#fullscreenToggle`) and the F key, both user gestures, only where the browser allows it.
- **Rotate hint** on portrait phones during battle (`#rotateOverlay`): dismissible, and the sim is held while it shows.
- **DOM screens** use `clamp()`-based `em` font sizes, `min()` widths, and 44 px tap targets on `pointer: coarse`.
- **Display-size setting** still scales `#game` through `--canvas-fraction` and composes with all of the above.
- **Action bar clicks** map pointer to logical coordinates through the scale manager and camera, then to the same
  Command bit as the matching key (`KeyboardAgent.press`, one tick).
- **Arcade arena width and the pan camera (WP 38).** The Arcade playfield (`arcadePlayfield()`) is 1920 wide, Classic's
  stays 1280. The logical canvas stays 1280x720; the Arena's main camera is driven each frame by `mountArenaPan`
  (`src/game/fx/arena-pan.ts`) from the pure `cameraTarget` (`arena-camera.ts`): centre on the fighters' midpoint, zoom out
  to a floor of 0.8 to keep both inside a 160 px margin, clamp to the world. It reads the render view and writes only
  `cameras.main`, so it adds no sim state, no hash input and no netcode work. The `Hud` scene is its own camera and does
  not pan; the super cinematic composes through `applyCamera`/`viewBox`. `__TTE__.arena.camera()` exposes the framing to e2e.
