# Changelog

## Unreleased

- Art: Bristle Stomp ability icon replaced with a regraded hoof-print glyph ("Deer Track" by Delapouite, game-icons.net, CC BY 3.0; credited in About). Art-director approved r7, 4.1. No sim change.

- Art: victory stills for Ouroth, Umbrel and Abyssor added (ten in total, drawn on the Versus results behind `?ff=roster24`, render only; `victory-key.py` gained a per-hero `POCKET_TOL`). No sim change.

- Art: victory stills for Brazgor, Kindrel, Vortigal, Zephra, Nykra and Hyalia installed and drawn on the Versus results (`?ff=roster24`, lazy, render only). No sim change.

- Glimmaw victory still now drawn on the Versus results when Glimmaw wins (`?ff=roster24`, lazy, render only; supersedes the install-only note below). No sim change.

- Hyalia (roster24, behind `?ff=roster24`): re-tuned baked rows: breathing idle, bobbing walk with wing flap, rearing cast with eye glow, hurt recoil and eye flash, toppling KO (`tools/assets/portrait-rig/tune-hyalia-anim.py`). Art only; no sim change.

- Roster24 super cut-in composites show for about 0.6 s on a hero's super (`?ff=roster24`, lazy-loaded, fade only under reduced motion). Render only; no sim change.

- Art: Glimmaw victory still (turtle, art-director approved 4/5, 2026-11-23) installed as `public/assets/img/victory/glimmaw_victory.png` by `tools/assets/victory-gen/victory-key.py`; install-only, not drawn yet, Glimmaw stays behind `?ff=roster24`. No sim change.

- Art: 12 roster24 super cut-in composites (1344x768, art-director approved 2026-11-23) replace the 1344x168 backdrop bands; installer and sha256 pins in `tools/assets/cutin-comp/`; not drawn yet. No sim change.

- Glimmaw rigged (turtle, art-director APPROVE 4/5), distinct walk/cast/hurt/KO rows, 24-hero sheet baked behind `?ff=roster24`; art only, no sim or `SIM_VERSION` change. Known limits: idle and hurt row 2 subtle, walk frame 3 leg smear.

- Vortigal rigged (eagle from matte r149 8710, art-director APPROVE 4/5), wings as separate bones, KO tilt-and-drop; 24-hero sheet baked behind `?ff=roster24`; art only, no sim or `SIM_VERSION` change. Known limits: idle and hurt rows subtle.

- Hyalia rigged (quadruped wyvern from approved matte 96433, art-director APPROVE 4/5), 24-hero sheet baked behind `?ff=roster24`; art only, no sim or `SIM_VERSION` change. Known limits: wings baked into the body, hurt/KO rows weak.

- Zephra display scale (render-only): `DISPLAY_SCALE` in `src/game/views/display-scale.ts` draws Zephra 15% larger about her feet; hitbox, sim, goldens and `SIM_VERSION` unchanged.

- SIM 109: Arcade 2v2/3v3 life retune (data only): fiara 730->682, morblass 865->810, echo 661->700, nykra 655->692, durrok 625->675; Classic and Arcade 1v1 unchanged. Goldens and `arcade-2v2-baseline.json` re-recorded (8 goldens change content, the rest the simVersion header).

- SIM 108: Arcade 1v1 life re-fit for pax, echo, treenoc and lavax (data only); 2v2 and 3v3 team life unchanged. Goldens and `arcade-baseline.json` re-recorded.

- Hurl Rock impact burst (render-only): `hurlImpact` in `src/game/fx/quarrak-hit-fx.ts` draws 16 larger chips, a wider dust ring and a soft stone flash. No sim, golden or `SIM_VERSION` change.

- Nykra idle, walk and cast animation tune on the quadruped-landmark rig (spec anim `tools/assets/portrait-rig/spec/nykra.anim.json`, re-baked sheets). Art only; hero stays behind `?ff=roster24`.

- Relay package 1.1.0 (MINOR, `PROTOCOL_VERSION` stays 3): conformance chat cases (`chat.forward`, `chat.bad-text`, `chat.rate`, `chat.oversize`, `chat.stale-match`, `chat.limit`, `chat.undelivered`, `chat.after-result`; docs/ONLINE-PROTOCOL.md 4a) that skip unless WELCOME `caps` bit0 is set, so a relay with chat off still passes the suite; select them with `relay:conformance --only chat`. Verified against the in-repo RelayCore with chat on (no skips) and off (chat cases skip). Tag `relay-v1.1.0` is the coordinator's.

- Roster24 Brazgor kit step (step S, `SIM_VERSION` 96): the kit already has no twin (Forge Gore was de-duped at 91; Molten Hide is the only thorns ability), pinned in `abilities-c.test.ts`; no data change and no life retune (1v1 45.7, 2v2 46.0 percent). The Pyre Totem no-flinch zone is not in this step (a new zone system, slot 3). Arcade only; the release set stays empty. Re-record reason: version bump only, every golden changes only the simVersion header.

- Roster24 Kindrel kit step (step S, `SIM_VERSION` 95): the kit already has no twin (Ember Bite and Cinder Spray share no kind, box and damage with any other ability), pinned in `abilities-c.test.ts`; the light hit-strength override and the omni AI rule already exist, so no data change and no life retune (1v1 45.9, 2v2 46.7 percent). Arcade only; the release set stays empty. Re-record reason: version bump only, every golden changes only the simVersion header.

- Roster24 Vortigal kit step (step S, `SIM_VERSION` 94): the kit already has no twin (no other ability shares kind, box and damage with Stoop or Talon Rake), pinned in `abilities-c.test.ts`; only a 2v2 life retune, `ARCADE_2V2_LIFE_PM` vortigal 665 -> 740 (2v2 41.6 -> 49.0 percent, 1v1 51.9 unchanged). Arcade only; the release set stays empty. Re-record reason: a recorded Arcade 2v2 match with Vortigal changes.

- Roster24 Hyalia kit step (step S, `SIM_VERSION` 93): the kit already has no twin (no other ability shares kind, box and damage with Stinging Filament or Bell Pulse), so the only change is a life retune, Hyalia max health 95 -> 99 (1v1 42.1 -> 49.2 percent, 2v2 53.1). Arcade only; the release set stays empty. Re-record reason: a recorded Arcade match with Hyalia changes.

- KO frames (ko-frames): rig-only KO poses for Glimmaw, Treenoc and Pax in `public/assets/img/ko/` (rotate, squash, tint, shadow of the map portraits), art-director approved (Fiara parked), generator `tools/assets/ko-gen/ko-rigonly.py`, sha256 pins in `tools/assets/ko-gen/approval.json`. Not wired to the scene yet. Art only: no sim, golden or `SIM_VERSION` change.

- Relay conformance (MINOR): `ConformanceCase.orderSensitive` and `RunOptions.retryOrderSensitive`; `relay:conformance --retry-ordering <n>` retries the two order-sensitive cases on a concurrent-invocation deployment. Default off.
- Relay conformance (MINOR, no wire or sim change): `ConformanceAdapter.connect` takes an optional `{ sameIdentityAs }` so resume cases reconnect as the same player (`resume.within-grace` and `resume.after-grace` now do; against a relay that ties sessions to identity the old reconnect was a different player). The `relay:conformance` runner gains `--advisory-close` and `--no-binary` (docs/RELAY-PACKAGE.md). The WebSocket client shows a gateway failure notice as a status instead of a malformed frame.

- Roster24 Ouroth kit de-dupe (step S, `SIM_VERSION` 92): Wyrm Coil box 90x60 -> 80x70 (stays the only grab-throw) and Scorch Breath box 130x50 -> 110x70 (a short tall gout, no longer a third wide sweep). Abyss Flash recovery 250 -> 240 ms (13 -> 12 ticks); the 240 ms change was not shipped for Hoof Crash, Kelp Lash and Bristle Stomp (it moved Durrok out of the win-rate band). Arcade only; the release set stays empty. Re-record reason: a recorded Arcade match with Ouroth or Glimmaw changes.

- Roster24 Brazgor kit de-dupe (step S, `SIM_VERSION` 91): Forge Gore becomes a slow overhead anvil blow (30 damage, 2 s cooldown, 600 ms recovery, 70x80 box) and Kindrel's Ember Bite recovery is 160 ms (tick-neutral: 8 ticks either way). Arcade only; the release set stays empty. Re-record reason: a recorded Arcade match with either hero changes.

- AI ability icons (ability-icons-3): 19 own-work 128 px icons in `public/assets/img/hud/ability-icons-ai/` (this batch adds kelp_lash, molten_hide, whirlpool, bell_pulse, heal_spring, scorch_breath, wyrm_coil, spore_burst), keyed onto the icon ground by `tools/assets/icon-gen/install-ai-ability-icons.py`, art-director approved, wired to the action bar. Art only: no sim, golden or `SIM_VERSION` change.

- Ability icons (ART-ICONS): six 64 px icons (hurl_rock, lure_orb, skitter, slow, hoof_crash, talon_rake) in `public/assets/img/hud/ability-icons/`, adapted from Painterly Spell Icons by J. W. Bjerk (CC-BY 3.0, credit in `CREDITS.txt`), art-director approved, with the generator and installer in `tools/assets/icon-gen/`. Not wired to the HUD yet. Art only: no sim, golden or `SIM_VERSION` change.

- Relay wire v3 (RELAY-V3): `@tamingtheelements/relay` 1.0.0, `PROTOCOL_VERSION` 3 (a MAJOR change; v2 clients and relays do not interoperate). The close code after an ERROR frame is advisory and the frame is the authority. A handshake never answers ticket-invalid or resting: the client fetches one fresh ticket and retries once on any pre-WELCOME failure, and resting reaches a connecting client only as HTTP 503 (HELLO while resting closes 4011 with no frame). /ticket returns `{ticket, url}` with the full `wss://` address and `VITE_ONLINE_URL` is the HTTP base only. Every frame is base64 text in both directions (`encodeText`/`decodeText`; `handle(conn, text, ctx)`, `Sender.send(conn, text)`); a binary message is bad-frame with advisory close 4001. New conformance cases: `malformed.binary` and `wire.text.*`. No sim change: `SIM_VERSION` and goldens unchanged.

- Wispera redraw (WISPERA-R2): her portrait, rig, 155 baked frames, sheet atlas and HUD strip are the owner-picked "Refined 2" (md5 fda087d6783593314aa211d79a97ceb0). Art only: no sim, golden or `SIM_VERSION` change. The bake locks and Wispera sheets were regenerated because their source changed; no other hero frames changed. Her Halo test limit is 0.12 (`HALO_MAX`).

- Crowd control wiring (CB5, FUN-DESIGN 2.28): `?ff=cc` (dev and test builds) turns on the `withCrowdControl` sim flag in Versus, the tour and the arena demo, and the new `arcade-cc` golden replay covers daze, quick-rise, shatter and a Cleanse of silence. The flag stays off by default, so `SIM_VERSION` (71) and every other golden and baseline are unchanged. Online is not wired to the flag.

- Charge and Dash in melee (ideas/brainstorm/action-bar-rethink-hero-kits.md, first slice): Arcade only. A charging hero is armoured (takes damage, no stun or knockback), the arrival hit is medium strength (damage 12, victim stun 26), and a Dash through a melee swing is a perfect dodge that refunds the Dash cooldown. `SIM_VERSION` 50.
  - Re-record reason: Charge and Dash outcomes change Arcade hashes; Arcade goldens and the Arcade 1v1 and 2v2 balance baselines were re-recorded (all heroes stay within 35-65%); the Classic goldens change only the `simVersion` header.

- Common Cleanse, sim slice (FUN-DESIGN 2.26, ideas/in-progress/elemental-cleanse.md): Arcade only. Every hero can end its own Snag root, Puddle slow and Ice Blast or tidal slows with one button (`Cmd.cleanse`, bit 9) on a 10 s cooldown, and the sim emits a `cleanse {element, team, cleared}` event for the view and audio to come. The Normal and Hard AI use it when rooted or slowed. No key binding, HUD or animation yet. `SIM_VERSION` goes from 46 to 47.
  - Re-record reason: the Arcade state block grew (one int per entity, one per team) and the AI now presses a new button, so Arcade hashes and outcomes change. The Arcade goldens (seven) and the two Classic goldens change; the Classic ones only their `simVersion` header; the Classic baseline is unchanged. The Arcade 1v1 baseline was re-recorded (Cyclonius 50.6 to 43.8 percent, every other race within 2.2 pp). The Arcade 2v2 baseline was re-recorded too (Echo -6.8, Rokcore +8.0, Pax -5.7, Wispera -5.7 pp; small samples of 528 matches).

- Elemental ability (FUN-DESIGN 2.24, ideas/in-progress/elemental-ability.md): Arcade only. Every hero gets one button by its element, with a cooldown and no meter: Ember (fire, 1250 pm damage for 5 s), Cleanse (water, ends its own root and slows at once), Stoneskin (earth, takes 800 pm damage for 5 s) and Gale (air, 1300 pm walk speed for 5 s). Cooldowns are 35 s, or 25 s for Cleanse. Void heroes (the dummy and the boss) have none. Keys: V or Minus (rebindable), pad L3, Player 2 Semicolon (Player 2 Tag moves from V to Period, Tag 2 is Comma), touch Element button. The action bar shows the element's symbol and words, and the live region reads each cast. The Normal and Hard AI cast on simple rules. `SIM_VERSION` goes from 38 to 39.
  - The Arcade goldens were re-recorded because the hashed Arcade block grew two ints per entity and the AI casts; the Classic goldens change only the `simVersion` header. New scripted golden: `arcade-elemental`.
  - The Arcade 1v1 and 2v2 balance baselines were re-recorded because the new button changes every Arcade fight (16-seed 1v1: Morblass -7.7, Rokcore +5.7 pp; 8-seed 2v2: Fiara +15.9, Treenoc +10.3, Curomo -9.1 pp). On the 24-seed 1v1 matrix every race stays within 45.2 (Morblass) to 55.3 (Pax) %; Stoneskin was eased from 700 to 800 pm for that.
  - The size budget was raised on purpose, about +1.9 KB gzip in total (508800 to 510700). The sim chunk went from 33750 to 34750: the cast, buffs and AI rules run every Arcade tick. phaser-config went from 24300 to 24920: the HUD slot, symbols and announcer lines live in the Arena. Several small chunks rose by under 40 B for the key, touch button and cue. None of this can be lazy-loaded because it runs in every Arcade fight.

- Trap tuning (WP 39e, ideas/brainstorm/trap-balance-findings.md): Arcade only. `SIM_VERSION` goes from 33 to 34; the Classic goldens change their header only.
  - Lives after arming: bomb 120, puddle 250, spike 160 and gust 150 ticks.
  - The Puddle slows to 500 pm and lingers 60 ticks.
  - The Gust knockback is 288 Q4.
  - A Fire Bomb or Spike hit is its base times the owner race's `damagePm`, floored at 20 (`TRAP_HIT_FLOOR`). Sindarosa's and Rokcore's traps used to hit for 13 to 14.

  The Arcade goldens were re-recorded because trap hits and timings changed. The `arcade-1v1` inputs also move because its AI-recorded inputs had drifted on main since 39c. A new scripted golden, `arcade-traps`, fires each trap kind and also covers a timeout and a douse. The Arcade 1v1 and 2v2 balance baselines were re-recorded because the 2v2 moved past tolerance (Treenoc -6.8, Pax +5.7).

- Trap AI (WP 39c, FUN-DESIGN 2.23): Arcade only, Classic untouched. The scripted AI sees traps (`ArcadeView.traps`, `trapIn`, `trapCount`, `fireShot`), plants when a foe closes through its personality's band (Rushdown late, Zoner early) or when cornered (Easy 20, Normal 80, Hard 300 pm per tick; Hard at once on a foe its Snag roots), never under 96 px, steps round foe traps or dashes across an arming Fire Bomb or Spike (Normal, Hard), and Hard fire heroes shoot a foe Puddle or Gust in the way; Easy walks into some. `fun:report` counts traps. AI only: no `SIM_VERSION` bump, goldens unchanged. Anti-stalemate changes, for stale fights only (400 ticks with no HP change):
  - no zoning or corner plants;
  - every level walks on through foe traps;
  - an idle ranged hero walks at the foe, which ends a ranged freeze that predates traps (the Lavax-Sindarosa mirror).

  The Arcade 1v1 and 2v2 balance baselines were re-recorded because the plant draw reshuffles AI decisions. That reshuffle alone pushes some races past 5 pp: at rate 0, Echo moved -6.3 pp in 1v1 and Ishimi +5.7 pp in 2v2.

  Averaged over match seeds 1, 101 and 201:
  - 1v1: every race stays within 5 pp (Treenoc +4.7, Echo -4.0, Lavax -3.6).
  - 2v2: Wispera falls 5.6 pp, to 52.7, towards parity. Every other race stays within 3.6.
  - Stalemates: 1v1 drops from 149 to 71 and 2v2 from 84 to 54.

  The size budget was raised on purpose: sim chunk 32500 to 33550 and total 505500 to 506300 (about +1 KB gzip). The trap AI runs in the sim chunk, so it cannot be lazy-loaded.

- Traps, sim (WP 39a, ideas/in-progress/wp39-bomb-trap.md): Arcade only. Command bit 6 is Trap in Arcade (Classic keeps it as capture; the Arcade capture path is gated off). A hero plants its element's trap 72 px ahead along the aim: Fire Bomb, Puddle (slows), Spike (stun, juggle) or Gust (shove). It arms in 30 game ticks, fires on the foe or at the end of its life, has a 500-tick cooldown and allows 2 per team; fire shots and bomb blasts douse enemy Puddles and Gusts; a new round clears them. New events `trapPlaced`/`trapArmed`/`trapTriggered` with audio cues. No input, view or AI yet (39b/39c), so players cannot plant one. `SIM_VERSION` 32 to 33. The Arcade goldens were re-recorded because the hashed Arcade array grew for the trap table (inputs and tick counts identical); the Classic goldens change only the `simVersion` header. The Arcade 1v1 and 2v2 and Classic balance runs are unchanged (+0.0 pp, same stalemates), so no baseline was re-recorded.
- Panning wide arena, sim (WP 38d): the Arcade playfield is 1920 px wide (was 1280); fighters start on the old 1280 spots, centred (x 480 / 1360); the terrain keep-clear and the round reset follow. `SIM_VERSION` 31 to 32. Arcade goldens re-recorded because the arena changed (the scripted goldens were retuned so every mechanic still fires); Classic goldens change only the simVersion header.
- Smarter Arcade AI (WP-arcade-ai-smarter, FUN-DESIGN 2.21): Arcade only, Classic untouched. Guard reflex (Normal 30 pm, Hard 900 pm of threats, never twice in 40 ticks), Hard sidestep dash out of a shot line, spacing (melee closes in, Hard ranged backs off), Rushdown charge, Hard super on a rooted foe, Hard weather under 500 pm HP, Hard tags at 450 pm; each a pure helper with tests. `SIM_VERSION` 27 to 28; Arcade goldens and Arcade balance baselines re-recorded because the AI changed (inputs identical); Classic goldens change only the simVersion header. Arcade 1v1 within 4.8 pp, stalemates 45 to 46; 2v2 stalemates 29 to 19.
- Snag tuning (WP-snag-tune, FUN-DESIGN 2.20): Arcade only. The rope now hurts (`SNAG_DAMAGE` 30) and stuns 20 ticks (`SNAG_STUN_TICKS`; the old vines hit stunned 60); new `ARCADE_RACE_NUMBERS` rows for Treenoc, Wispera, Curomo and Echo plus small nudges for Fiara, Ishimi, Lavax and Pax; re-fit `ARCADE_2V2_LIFE_PM`; the Arcade AI no longer throws with overlapped boxes (the rope missed and two Snag heroes froze) and steps away, and a melee hero stops closing in under 100 px. `SIM_VERSION` 27. Arcade goldens re-recorded because the sim changed (inputs identical); Classic goldens change only the `simVersion` header. Arcade balance baselines re-recorded after the tuning: every race within about 5 pp of the old baselines (2v2 stalemates 23 to 29, 1v1 42 to 45). Budget raised on purpose: sim chunk 30250 -> 30300 (+26 B gzip: Snag damage and stun constants, the AI step-away).
- Snag (WP-snag, FUN-DESIGN 2.20): in Arcade only, a rope throw that roots its target replaces one slot each for Treenoc (vines), Wispera (Sonar Blast), Curomo (Shards of Ice) and Echo (Fade). The throw is 240 px along the aim, has a 400-tick cooldown and roots for 60 ticks: no walking, Dash or Charge. Guard wastes the throw. Fire shots or a Sun cast burn the rope, and the target is then immune for 75 ticks. Also: the `snag` event, rope loops, a ROOTED pop and a cue, and AI throws. `SIM_VERSION` 26. The Arcade goldens were re-recorded because the hashed Arcade per-entity block grew by two ints; the Classic goldens change only the `simVersion` header. The Arcade balance baselines were not re-recorded and need a tuning pass.
- Rig bake tool (WP-rig-bake): `pnpm assets:bake [--check]` bakes cutout rigs (`imgWorkArea/rigs/<sprite>/rig.json`, part PNGs, optional hand-painted keys, `extends` variants) into the per-frame PNGs `pnpm assets:sheets` packs; deterministic integer/fixed-point bake with a hash lock for stale detection (ADR-0019, FUN-DESIGN 2.16). Tools and tests only; no rigs or art ship yet.
- Arcade 3v3 tag teams (WP-arcade-3v3): a third hero (`partner2`) in the picker, Tag 2 on the 4 key / RB / touch button; in Arcade, Tag 1 and Tag 2 bring in the first and second living bench hero in roster order (Classic unchanged); the team HUD shows a BENCH line per bench hero; the Arcade AI tags to the healthier bench hero; `sim:match --ruleset arcade --team-size 3`; new golden `arcade-tag3` (every other golden unchanged, no SIM_VERSION bump).
- Retire the legacy `war/` directory from the tree (owner-approved, 2026-11-10). It stays at git tag `legacy-crafty-1.0`; `pnpm oracle:restore` and `pnpm test:oracle` bring back the parity oracle (docs/legacy/ARCHIVE.md).
- Replace the legacy grunt/gulp `package.json` with a pnpm + TypeScript + Vite shell (`pnpm build` emits a placeholder site).
