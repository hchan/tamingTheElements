# Sprites overlap at contact during a tag swap

status: idea
added: 2026-11-19

Severity: cosmetic
Size: M

Repro: 2v2 fight, stand close to the foe, hold 3 across one tick, look at the frames just after the swap.

Screenshot: /Users/henry.chan/tamingTheElements/.claude/worktrees/agent-a77c3dce6b1857aa7/.scratch/qa-r125/21-tag-a-1280.png

Suggested fix: bring the incoming hero in from off-screen, or enforce a minimum sprite spacing during the swap.

triaged: 2026-11-21 real, medium: needs a swap-in entry in the renderer. Plan: medium planner.

triage note 2026-11-21 (code-check, no fix): real, and not a 3-file render-only fix. Cause: `tagEntrance`/`performSwap` (src/core/sim/systems/arcade/tag.ts) puts the incoming hero at the outgoing hero's sim position, so with the foe in contact both sprites overlap by design; moving them apart in the sim is out of scope (determinism, goldens).
Plan (5 lines):
1. Render-only: on `tagIn` (and Classic `swapped`) record a per-entity visual x-offset + start tick in the sprite/hero view (new small module, e.g. src/game/fx/tag-entry-view.ts), offset pointing away from the foe by ~one sprite width.
2. Ease the offset to 0 over ~10 ticks (integer tick LUT, no Date), applied only to the sprite transform, never to hitboxes or sim state.
3. Wire it in the scene's per-frame sprite update (find the hero sprite position writer; keep Hud.ts and super-view.ts untouched, they are at size caps).
4. Test: pure offset function (tick -> px) plus a tagIn-event test that the incoming sprite x differs from the sim x on the swap tick and equals it after the ease; fails without the module.
5. Then a real-game screenshot (2v2, hold 3 at contact) before closing; size M, medium planner to confirm the sprite writer location first.
