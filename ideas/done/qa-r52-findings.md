---
status: done
triaged: a (all fixed, art-only or unverifiable from stills)
added: 2026-11-15
---

# QA r52 findings (ranked)

HEAD 2719227d, dev server, headless Chromium SwiftShader, 0 page errors in every script. Screenshots under `~/claudetmp/qa-r52/s/`. Scores in qa-r52-scorecard.md.

## r51 findings status

- #1 FIGHT! over first hit: fixed. `st-Fire-hit.png` and `st-Earth-hit.png` show the damage number and burst with no banner.
- #2 distinct hit marks: improved. Code and e2e now give per-attacker-element marks (`hit mark colours stay apart per attacker element` passes). My stills only used water attackers (Wispera, Echo), so all read cyan ring with green rays; fire, earth and air attackers not eyeballed.
- #3 idle auras: improved, not solved. Echo shows a soft white pool (`st-Earth-start.png`); Fiara and Morblass show none in the same frame. Pixel e2e passes for all four elements, so either the check is lenient or auras ramp in with age.
- #4 2v2 picker hides partner slot behind Fight bar: still open (`team2-picker-set.png`), and the detail pane still offers "Add to team" on Sindarosa with a full team.
- #5 First-run hint over the arena: still present in manual-step shots (`st-Fire-hit.png`, `st-Air-hit.png`); removed on super cut per 7de02f7d. Real-time fade unverified.
- #6 ROUND ghost behind damage: fixed, `team2-tag-b.png` shows ROOTED above 48 with clear lanes.
- #7 Wispera dithered halo and menu cut-out contour noise: open (`st-Water-start.png`, `menu-desk-late.png`).
- #9 Tour card portraits: open, mixed painted and sprite tiles.
- #10 2v2 life asymmetry not shown in picker: open.
- #11 Help orb: fixed (`page-help.png`).
- #12 Super banner fade: fixed, name fully opaque at 14 ticks in `st-Water-super.png` and `ph-super.png`.

## New findings (ranked)

1. Tour stage 9 (Eternal Void): the fight floor is a flat dark swirl with no horizon or crowd band, and the boss is a single static spiral disc (`tour-fight9.png`). It reads emptier than stage 8's water arena (`tour-fight8.png`). The stage card (`tour-card9.png`) is good: portrait, three diamonds, continues, NEXT chip. Consider an idle motion or attack tell for Void and a shared stage frame.
2. Stage 9 element cues are weakest: Void has only a diamond glyph, no element tint on the cast bar.
3. Menu entrance: 150 ms after load the menu is already fully drawn (`menu-entr-early.png` equals `menu-desk-late.png`), so there is no entrance animation. An SF/MvC-style title would stagger title, cut-outs and buttons. Cheap polish.
4. Hit-stop and swing feel cannot be judged from stills or manual stepping; the `hit-feel-capture` e2e passes. Needs a real-time recorded clip.
5. Tour reuses the same three-hero team for all nine stages; the tag bench strip is small and sits close to the WEATHER chip at 1280x720.

## Working well

Menu on seven viewports, per-element floors, element-labelled super banners, TAG! call with cooldown, CC chips, Tour ladder 1 to 9 with CLEARED/NEXT chips, phone match to Victory 2-0, Help and Settings, Online page text. E2E subset (6 specs, 33 tests, 1 worker) green.

## Not verified

Online two-browser flow, Firefox and WebKit, real-time hit-stop, first-run card real-time fade, fire/earth/air attacker hit marks.

## Triage 2026-11-21 (code-checked)

Fixed: Stage 9 horizon/boss (r53), menu entrance (r53), per-element hit marks, idle auras. Dropped: phone items. Info only: real-time hit-stop and swing feel (covered by `hit-feel` tests and e2e), Tour three-hero team reuse (design, not a defect). Void cast-bar tint is carried as a low open item in qa-r57-findings. Art-only, noted: Wispera halo, cut-out noise, Tour card portraits.
