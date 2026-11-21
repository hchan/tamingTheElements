---
status: done
triaged: superseded (portrait/touch dropped; rest fixed or tracked)
added: 2026-11-17
---

# QA r97 findings (main 7c500bc5)

Scores are in [qa-r97-scorecard.md](qa-r97-scorecard.md). No code changed. Screenshots under `.scratch/shots/` (gitignored, QA worktree). Setup: preview build of `--mode test` on port 7933, Chromium SwiftShader, seed 7, `/?manual=1&seed=7&ff=arcade#arcade`; desktop 1280x720 and phones 390x844, 360x640, 844x390 (isMobile, touch, 2x). Four stages, super, 2v2 with tag, Tour, Help; no console or page errors. Stable e2e subset (responsive, portrait-play, first-run-hint, help-controls, picker-bar, versus-layout): 128 passed in 8.4 min.

## Ranked findings

P2. Residual full-width hairline above the crowd in portrait, plus a large dead sky block. A thin horizontal line still crosses the whole canvas at y~765 (Fire), ~730 (Earth), ~650 (Air), ~585 (2v2) at 390, and y~400 at 360 (`m390-fight-Fire.png`, `m390-fight-Earth-b.png`, `m390-super-Air.png`, `m390-2v2.png`, `m360-fight-Water.png`). About 40-45% of the 390 canvas above it is empty dark gradient, so the fighters sit in the lower half. Repro: Versus, any stage, Fight!, Play anyway in portrait. Suggest blending the last gradient stop into the crowd and/or filling the sky with stage art or a taller camera framing.

P3. Options strip label truncates the stage. At 390 and 360 the one-line label ellipsizes ("Rand...", "R...") so the chosen stage is not readable without expanding (`m390-versus-opts.png`, `m360-versus-opts.png`). Repro: open `#arcade` at either size. Suggest shortening ("Computer, 1v1, Normal, Random" to icons or dropping the AI word) or letting it wrap only at 360.

P3. "More below" chip still sits tight on the Fight bar and clips the content edge; the Versus title and hero card scroll under the sticky strip (`m390-versus.png`, `l844-versus.png` shows the chip overlapping the Abilities heading).

P3. 2v2 on phone: HUD portraits and status chips ("ADREN 3s / SAFE", "GALE 4s") are small and float in the empty sky; two-row action bar eats floor (`m390-2v2.png`, `m390-2v2-tag.png`, `m390-tour-fight.png`).

P3. Super cinematic not visible at 390: `m390-super-Water.png` and `m390-super-Air.png` show only the highlighted Super button and "SUPER 1". The desktop banner ("HELLFIRE LANCE") is clear in `d-super.png`; check whether the phone banner is skipped or just missed by the capture timing.

## What worked

- r96 P1/P2 sky seam and crowd step: stage palettes right, hard seam gone, crowd transition smooth.
- r96 P3 Help chips: even two-column grid, all rows one line (`m390-help.png`); landscape (`l844-help.png`) shows Jump-to chips in a scrolling row with a chevron hint.
- r96 P3 Options strip: single line, state glyph, `aria-expanded` false to true, 44 px; hidden and always expanded at 844 landscape.
- Landscape 844x390 live 1v1 is the best phone layout: HUD, joystick, Strike buttons and ability bar all clear.
- Desktop super banner and stage art strong.
- No console or page errors; 128 e2e passed.

## Not done

- First-run strip: `m390-firstrun-Fire.png` caught the "Rotate your device / Play anyway" overlay, not the strip; I did not re-shoot after dismissal. The first-run-hint e2e spec passed.
- Phone round-result card: my `end` shot never reached a round end (team size also persisted as 2v2 in that browser context, so later `end` and `tour` shots show 2v2 chips). Needs a fresh context.
- Not individually reviewed: m360 2v2 and tour, menu shots at each size, earth and air at 360 `-b`, Water super.
- Real touch play beyond taps, audio, online, Garrison and Settings were out of scope.

## Triage 2026-11-21 (code-checked)

Dropped (phone/portrait/touch): hairline and dead sky, Options label, More-below chip, 2v2 phone HUD, phone super banner (full width in r98). The not-done items (phone first-run, round-result card) are phone-only.
Open: none.
