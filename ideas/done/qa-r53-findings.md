---
status: done
triaged: a (CC feedback landed; low leftovers carried to r57)
added: 2026-11-15
---

# QA r53 findings (ranked)

HEAD eb78e4cc, dev server, headless Chromium SwiftShader, 0 page errors in every script. Screenshots under `~/claudetmp/qa-r53/s/`. Scores in qa-r53-scorecard.md.

## Fixed since r52

- Stage 9 Void: `tour-fight9.png` shows a horizon band (obelisk silhouettes, watcher row, purple braziers) and the boss as a spiral disc ringed by dashed rings with diamond motes. It now sits level with stage 8's crowd band (`tour-fight8.png`). Closes r52 #1.
- Menu entrance: `entr-a.png` (first frame) has dim, unlit buttons, a dim title and black cut-out silhouettes; `entr-c.png` (about 400 ms) is the full menu. Closes r52 #3.
- Fire Blast: `blast-16/40/56.png` show the bolt as a small orange orb that grows a little and turns paler as it travels. It reads as a fade, not a bug.
- 2v2 picker: a "More heroes below" pill now hints at the hidden list (`team2-picker-set.png`).

## Still open from r52

- #2 Void has no element tint on the cast bar or chip; only a diamond glyph.
- #4 2v2 picker: the partner slot ("Your partner (2v2)" Echo) is still cut off behind the Fight bar at 1280x720, and the detail pane still says "Add to team" with a full team.
- #5 First-run "FIRST BLOOD" card still sits over the lower arena in manual-step shots (`st-Earth-hit.png`, `blast-*.png`).
- #7 Wispera dithered halo; grey contour noise around the Rokcore cut-out on the menu.
- #9 Tour card portraits mixed painted and sprite tiles; #10 2v2 life asymmetry only in text.
- Hit-stop cannot be judged from stills.

## New findings (ranked)

1. `?ff=cc` has no visible crowd-control feedback. With Cyclonius Tornado, Pax Ground Shock, Ishimi hits and Fiara Ember (`cc-*.png`) the only chips are the old STUN or SAFE; there is no DAZE, ICED, DOWNED or SILENCED chip, no ice tint, no knockdown pose, no lock on silenced slots. `src/game/audio/arcade-cues.ts:131` says `ccStarted` has no cue ("CC audio lands with the CC view work package"). Before the flag goes default-on add: a chip per kind in the existing chip lane, a frost overlay for iced, a lying-down pose plus wake-up shimmer for downed, greyed lock icons on silenced slots, and a ccStarted sound.
2. Silence is invisible to the victim and the attacker: in `cc-Silenced-ember-1.png` Fiara shows "EMBER 5s" but Morblass shows nothing. Same fix as #1.
3. Fire Blast contrast: on the fire floor the faded bolt is close in colour to the lava veins and the FIRE x2 chips. A bright core that stays opaque while the halo fades, or a short trail, would keep it readable at range.
4. Menu entrance: the first frame starts the cut-outs as solid black blobs; fade them in from transparent so it does not look like missing art.
5. First-run card: auto-dismiss on the first hit, or move it above the action bar to clear the arena.
6. Tour stage 9: my script hit an undefined arena after forcing the boss KO (probably script-only); the boss death beat is not seen in stills, so worth a short clip check.

## Working well

Menu on seven viewports, four stage floors, element-labelled super banners (PHOENIX RISE, SIREN GALE), TAG! call with cooldown, SNAGGED/STUN/SAFE chips, ROOTED above damage, Tour ladder 1 to 9, phone landscape with Pause button and touch pad, Help page (jump chips, readable body), Online text. E2E subset (5 specs, 30 tests, 1 worker) green.

## Not verified

Online two-browser flow, Firefox and WebKit, real-time hit-stop and entrance timing, a 390x844 in-match shot (phone match was 667x375), CC with the AI attacking (this round drove the attacker by hand).

## Triage 2026-11-21 (code-checked)

Fixed: CC chips and cues (`src/game/audio/arcade-cues.ts`, r54 confirms), CC overlay and body pose (`src/game/fx/cc-fx.ts`, `cc-view.ts`, cc-fx e2e), Fire Blast fade (`src/game/fx/fire-blast-fade.ts`), first-run card (fades on fight time, events in `first-run-hint.ts`). Menu entrance black-blob start is art-only polish. Stage 9 script crash was a harness artifact (r54 #5). Open low item carried to qa-r57-findings: Void cast-bar element tint.
