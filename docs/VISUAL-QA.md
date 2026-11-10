# Visual QA

State, hash and layout-box tests cannot say what the game looks like. This pipeline produces pictures and numbers that a
human, or an AI agent that can open PNGs, reviews. Config: `playwright.visual.config.ts`; specs: `tests/visual/`; runner:
`tools/visual/run.ts`; CI: `.github/workflows/visual.yml`.

## Commands

| Command | What it does |
|---|---|
| `pnpm visual:capture` | Chromium (SwiftShader flags), 1 worker, `?manual=1&seed=7` stepped time, animations and cursors disabled. Writes `test-results/visual/<state>-<viewport>.png` for 1280x720 and 390x844, `manifest.json`, and two WebM videos (`battle-bot-vs-bot.webm`, `battle-keyboard-human.webm`, Playwright `video: 'on'`, 1280x720) |
| `pnpm visual:pacing` | Real-time (not manual) bot-vs-bot battle, 10 s of requestAnimationFrame deltas; writes `test-results/visual/pacing.json` and prints p50/p95/p99, long frames over 50 ms, dropped-frame ratio |
| `pnpm visual:regress` | `expect(page).toHaveScreenshot()` for the deterministic subset (DOM screens, stepped arena frames) against committed baselines. Skipped when this platform has no baselines |
| `pnpm visual:update` | Same specs with `--update-snapshots`: (re)creates baselines for the current platform |
| `pnpm ci:local --visual` | The usual local CI plus capture, pacing and regress |

Use `E2E_PORT=n` to avoid port collisions between worktrees. `?ff=fps` (dev and test builds only, statically removed from
production) shows a live fps / frame-time / worst-frame readout at the top right; see "Frame pacing" below.

## Captured states

`menu-no-save`, `menu-with-save`, `cinematic-frame1..3` (wall-clock timed, not deterministic), `garrison-1`, `garrison-6`,
`garrison-6-selected`, `settings`, `objectives`, `wiki`, `key-bindings`, `about`, `character-details`, `arena-t005`,
`arena-t060`, `arena-t150` (scripted commands: both sides firing), `arena-low-health`, `arena-capture-window`, `victory`,
`defeat`, `rotate-overlay` (390x844 only), `error-no-webgl`, `error-unknown-character`, `arena-demo-t150` (bot vs bot),
`arena-arcade-hitstop` and `arena-arcade-combo` (`?ff=arenaDemo,arcade`: the first Arcade volley during its hit-stop, then a
later one, with the white flash, element sparks, damage numbers and the combo counter), `arena-arcade-meter` (the
hyper meters under the HUD after Curomo's casts fill one bar), `arena-arcade-super-freeze` (10 ticks into Curomo's super
freeze: arena dimmed, caster lit, element band with portrait, super name and element, camera punched in), and Arcade
Versus from the Settings opt-in: `menu-arcade` (the extra main-menu entry), `arcade-pick` (the picker), `arcade-battle`
(round 1 intro at tick 40: the ROUND 1 banner, timer and empty round pips, with the touch Super button), `arcade-fight`
(the FIGHT! banner), `arcade-aim`, `arcade-ko` (K.O. with PERFECT during the KO slow motion), `arcade-round-end`
(PERFECT, YOU WIN ROUND 1, one pip filled) and `arcade-results` (after a second KO: 2-0). The Arcade states step past
round 1's 91-tick intro first (nobody acts before it). Each
has a `-1280x720` and a `-390x844` file. `manifest.json` lists name, file, screen, a note (the canvas box is in the arena
notes), size and sha256.

## Visual regression

- Baselines: `tests/visual/__baselines__/<platform>/regression/*.png` (`snapshotPathTemplate`). **Linux baselines are the
  source of truth for CI.** `darwin` and `win32` baselines are git-ignored and only useful locally.
- Tolerance: `maxDiffPixelRatio: 0.005`, `threshold: 0.2`, animations disabled, caret hidden. The version stamp
  (`#versionStamp`) and fps overlay (`#fpsOverlay`) are masked. Cinematic frames and videos are never compared.
- The CI comparison runs only when linux baselines exist (the workflow checks the folder).
- **Regenerating linux baselines:** run the "Visual QA" workflow manually (`workflow_dispatch`) with `update_baselines`
  ticked. It runs `playwright test --update-snapshots` and uploads `visual-baselines-linux` as an artifact. It never commits
  or pushes. Download the artifact, open every PNG against the checklist below, copy the files into
  `tests/visual/__baselines__/linux/`, and commit in a reviewed change. Never regenerate just to turn a red run green.

## Frame pacing

`visual:pacing` records the numbers; the gate is deliberately generous (renderer alive: more than 30 frames in 10 s, median
frame under 250 ms, sim advanced more than 200 ticks). **SwiftShader is software rendering and far slower than a real GPU, so
these numbers say nothing about real-device smoothness.** Check that on a real machine: open a dev or test build
(`pnpm dev`, then `/?ff=arenaDemo,fps`) and read the overlay while playing; look for sustained 60 fps, worst frame under about
33 ms, and no hitching when abilities fire.

## Reviewer checklist (apply to every PNG)

1. **Centring and aspect:** the game canvas is centred in the window, keeps 16:9, has no unexplained black band, and is
   not pinned to one edge. Compare the numbers in the manifest note.
2. **Overlaps:** no text drawn over or under a bar, icon, button or another text (HUD labels versus health bars, fullscreen
   button versus Skip or top-right content).
3. **Clipped or overflowing text:** nothing cut at an edge; long screens scroll or wrap instead of being cut off.
4. **Contrast and legibility:** text at least 4.5:1 against its background; at 390x844 the HUD text and action bar remain
   readable (about 12 px or larger on screen).
5. **Missing art:** no blank box where an avatar, icon or portrait should be; no placeholder or default texture.
6. **Names and identity:** characters are identifiable (name, avatar) on the HUD, garrison and results.
7. **Flash and FX visible:** in the hit, projectile, buff, freeze/stun and capture-window frames the effect is actually
   visible, not just emitted.
8. **Empty slots:** no action-bar slot that is empty or unlabelled-but-numbered; disabled slots look disabled.
9. **Empty pages:** menu pages are not bare black; there is a hierarchy, spacing and a clear primary action.
10. **State coverage:** victory, defeat, error and rotate screens each say what happened and offer a next step.

Record findings as issues (below) with the screenshot name.

## Known visual defects (issue list)

| # | Screenshot | Defect | Source |
|---|---|---|---|
| V1 | arena at the default display size | Fixed in WP-arcade-announcer-view. Canvas was 1000x563 pinned to the top of a 1280x720 window: not centred, a 157 px black band below. A running game's `#game` box now gets a top margin of half the space the display-size fraction leaves, so the bands split evenly at every window size; `tests/e2e/display-size.spec.ts` and `tests/e2e/responsive.spec.ts` check the canvas centre within 1 px of the window centre | human review |
| V2 | `arena-*` HUD | Health text (for example `100% OK`) is overlapped by the health bar | human review |
| V3 | `arena-*` action bar | An empty third slot labelled `4` | human review |
| V4 | `arena-*`, `garrison-*` | No character names or avatars on the HUD; garrison avatars render as blank space | human review and `garrison-6-*` |
| V5 | `menu-*`, `victory`, `defeat`, `settings`... | Menu pages are bare black with left-aligned underlined links and no layout or art | human review |
| V6 | `arena-t060`, `arena-t150` | Fixed in WP-arcade-juice-hits. The hit flash did render, but too little and too briefly to see: a 60 ms wall-clock timer (`scene.time.delayedCall`) cleared a mild multiply tint (`0xff7777`) after 3 to 4 frames, which had always expired by the time a stepped capture was taken; the frozen tint, rewritten every frame, overwrote it on frozen victims; and Classic melee hits emit no `damage` event, so they never flashed. Now `CharacterView` owns the tint and counts rendered frames (white fill for 2, then the hit tint for 4, over the frozen tint), and effects hold while the sim is paused, so stepped captures show them. Classic melee still has no flash (no event; a sim change) | code review, `tests/e2e/arcade-juice.spec.ts` |
| V7 | `cinematic-frame*` | The fullscreen toggle overlaps the Skip button (top right) | `cinematic-frame2-1280x720` |
| V8 | `arena-*-390x844` | HUD text and action bar are tiny (a letterboxed 390 px wide canvas) | `arena-t060-390x844` |
| V9 | `character-details` | Content runs past the bottom of the viewport with no visible scroll cue | `character-details-1280x720` |
| V10 | `arena-t060`, `arena-t150` | Projectiles render as small flat dashes with no glow or trail; hard to read against the fire background | `arena-t150-1280x720` |

Fix these in separate work packages; this pipeline only reports them.
