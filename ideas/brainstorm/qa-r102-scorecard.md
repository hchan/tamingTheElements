---
status: idea
added: 2026-11-17
---

# QA r102 scorecard (headless Chromium, SwiftShader, 1280x720, 390x844, 844x390, 360x640)

Scored 0-5 against Street Fighter / Marvel vs Capcom. Shots: `.scratch/shots102/` in the r102 QA worktree (gitignored).
Build: main at 10ca8a76, `--mode test`, `vite preview` on port 7962. Console and page errors across all scripted runs: none.
Scope this round: the Online role screen at 360 px and the portrait play layout (arena zoom, two-row action bar, long Strike labels).

## Overall

| Axis | r101 | r102 | Note |
| --- | --- | --- | --- |
| Fun | 3.4 | 3.4 | No combat change. Fights still read (Blast projectiles, Flame hits, damage numbers, round banner); no new content. |
| Graphics | 3.8 | 3.8 | Lava/ice stages look good in landscape and at 360x640. At 390x844 the sky is still about 45% of the canvas and fighters are small. |
| Readability | 4.3 | 4.4 | Online heading now one line with a single Back; Strike buttons show "Strike 2 / Flame" and "Strike 1 / Blast" with no clipping. HUD names still truncate on portrait. |

## By area

| Area | Result |
| --- | --- |
| Menu (4 viewports) | Clean, five entries, no overflow, no banned words. |
| Help (4 viewports) | Clean; jump chips wrap tidily at 360; no banned words. |
| Settings | No overflow at any viewport. |
| Online role screen at 360x640 | Fixed: "Who is hosting?" is one line (36 px tall), "Back" appears once, both role buttons are large and clear, the host path opens inline under the buttons. Same at 390, 844x390 and desktop. |
| Versus picker | Good at 390 and 360 (collapsed Options chip, "More below" hint, Fight!/Back bar on screen). |
| Portrait play, 360x640 | Good: sky about 25% of the canvas, fighters readable, single-row bar (Melee..Cleanse) plus stick and two round Strike buttons, no overlap. |
| Portrait play, 390x844 | Strike labels fit. Arena band is still short: roughly 70 px of floor depth under 330 px of empty sky, fighters about 45-50 px tall. |
| Portrait Tour (390x844) | Action bar is two rows (Tag, Tag, Melee, Weather, Dash / Guard, Super, Bomb, Ember, Cleanse) and covers the lower floor; the Tag thumbnails sit under the HUD names. |
| Landscape 844x390 | Best layout: big stage, full bar, Strike buttons outside the canvas on the right. Strike buttons here show only "Strike 1/2", no ability name. |
| Rotate overlay | Present at 390 before "Play anyway"; its button uses a sans-serif face unlike every other button. |

## Not done

- Win-path and lose-path match-end cards not captured this round (scripts played about 15 s of a round only).
- 2v2 portrait at 390 and Tour fight on desktop and landscape not captured (the generic script could not start Tour there; Tour was captured at 390 only).
- Hero-by-hero Strike labels not scanned; only Sindarosa's pair (Blast/Flame) was seen on screen.
