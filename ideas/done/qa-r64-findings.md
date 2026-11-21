---
status: done
triaged: a (fixed, dropped or art-only; open items carried to r65)
added: 2026-11-15
---

# QA r64 findings (HEAD e571c860, SIM_VERSION 78)

Headless Chromium SwiftShader, port 7974 (7964 was taken by another agent), screenshots in `~/claudetmp/qa-r64/s/`. Only new items and the status of r63/r62 ones.

## New

- **2v2 life scale vs bars.** Life is now 297 (Sindarosa), 591 (Pax), 540 (Fiara) in a 2v2, 547/321 in a 1v1, but every bar is the same pixel length (`2v2-live-01.png`, `2v2-live-05.png`): Pax at 216/591 and Fiara at 540/540 look as different as 36% vs 100% only by colour. Scale the bar's track by max life, or add a faint tick every 100 hp, so the larger pools read.
- **Fighter clipped at the arena edge in a 2v2.** In `2v2-live-05.png` Pax (my active hero) stands half off the left edge of the screen while Fiara is on top of it; the camera pan lags the player when the foe pushes in.
- **Round pacing in 2v2 is fine but the player cannot tell.** The round timer shows 87 / 77 (a 100 s round); a round was lost in about 58 s by idling with attacks. There is no visual "tag cooldown" on the benched card beyond NO TAG / TAG, so it is hard to know when swapping is possible (`2v2-live-05.png` shows "NO TAG" over the downed Sindarosa card, correct, but the Tag key stays lit as available).
- **Round-win pips are tiny.** The four ROUNDS circles under the timer (two per side) are about 12 px and carry no label of who they belong to; after a lost round they were the only hint (the labels row went blank for 15 s while the next round loaded: `2v2-live-10..12.png`, hero labels empty).
- **Next-round gap about 20 s.** From the last hit of round 1 (55 s) to the fresh round (81 s) the arena showed no HUD labels for 3 frames; the transition feels slow versus SF's roughly 4 s.
- **Earth 1v1 is the best-reading stage** (`1v1-Earth-3.png`), the ice-crystal Spike and 40 pop are crisp; Fire 1v1 (`1v1-Fire-2.png`) buries the fighters in lava-crack lines and amber aura triangles, so Fiara's silhouette blends into the floor.
- **812x375 menu** (`menu812.png`) lays the five buttons in one row under the title and the dragons overlap the first and last button edges, but the Play focus ring and labels are fully clear. Good.

## Still open from r63 / r62

- Tour fight HUD has no stage number or continues count (`tour-fight-2.png`); the opponent list shown on the map (3) differs from the splash (1). Easy-stage life lopsided: Wispera 478 vs Sindarosa 228 (still).
- Fixed or not reproduced: the FIRST BLOOD hint card no longer covers the Tour fight bottom in this run (`tour-fight-*.png`); cannot say whether that was only because no hint was due under `?seed=7`.
- Help still 4863 px tall, 2986 chars, and the word "tour" appears nowhere in it; no explanation of AIR x2 / WATER +HP pills.
- Wispera still a grainy grey pixel blob (`tour-fight-2.png`); Fiara's blob-like silhouette in lava still weak.
- Not re-tested this round: phone 2v2 HUD crowding, tag swap on 812x375 (r63), portrait black half, super banner height.

## Process

- `node_modules` symlinked from the main checkout (not committed). Server pid in `~/claudetmp/qa-r64/pid`. `heroLabels()` lives on `__TTE__.arena`, not `__TTE__`.

## Triage 2026-11-21 (code-checked)

Fixed: 2v2 life scale (shared bar scale, ideas/done/qa-r15-life-totals-vs-bar-length.md), round pips (ideas/done/qa-hud-pips-and-bench-crowding.md), Help "tour" wording and pills (`help-guide.ts:80-97`); Easy-stage lopsided life is covered by r119 (`heroLife` scaled). Carried to r65: Tour fight HUD stage/continues, fighter clipped at the arena edge, tag feedback. Not re-raised since: the 20 s round gap (r64 only). Dropped by owner decision (2026-11-18, no phone/portrait/touch work): every phone, portrait, 667x375 and 812x375 item, plus the touch-fight-layout e2e specs (deleted).
Art-only, noted: Fiara silhouette on lava, Wispera blob.
