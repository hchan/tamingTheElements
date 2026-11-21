---
status: idea
triaged: c (3 real items open, see Triage)
added: 2026-11-15
---

# QA r65 findings (HEAD a00253c4, SIM_VERSION 79)

Headless Chromium SwiftShader, port 7965, screenshots in `~/claudetmp/qa-r65/s/`. Only new items and the status of r64 ones.

## New

- **AI pins the player in the left corner, fighters clip off screen.** With SIM_VERSION 79 the AI rushes in and drives an idle or retreating player to x=0: positions in the idle probe go 405 -> 75 -> 8 -> 0 (player) and 1174 -> 323 -> 80 (AI) within 20 s, then stay at the wall until the KO. In `passive-Hard-3.png` Fiara is half off the left edge and the 81 hit number is cut off; in `active-Hard-4.png` the same. The pan camera does not frame the wall fight (same cause as the r64 2v2 clipping). Clamp the camera or keep a margin so both bodies and the hit numbers stay inside.
- **Hard vs Normal feel nearly identical in a short idle probe.** Both kill an idle player in about 26-30 s with the same approach path; the picker "AI level" is the only control and settings Difficulty does not drive it (the picker defaults to Normal regardless). Hard could show a visible difference (faster closing, supers) or the picker could say what changes.
- **No stalemate seen.** No 60 s window without damage in either difficulty (the AI engages inside 6-10 s). The 800/1100 tick escalation could not be exercised against a moving, kiting player in this pass; only a human or a scripted kiter would trigger it.
- **Hit number and combo readout collide at the screen edge.** `passive-Hard-3.png`: "81" with a small "10" tag half-clipped at x=0 beside the 5 HITS / 132 DMG block on the right; the readout sits far from the action when the fight is in the corner.
- **Super camera crops the caster.** `super-a.png`: with Curomo at the left (x=300) the punch-in shows him half off the left edge under the GLACIER CRASH banner; the banner itself is excellent. Same left-edge clamp as above.
- **Tag key on 1280x720 gave no visible swap at 269/297 hp** (`tag-after-1.png`): key 3 stayed lit, nothing happened, no notice; in the earlier r64 notes a healthy hero may not tag. A one-line "too healthy to tag" or a dimmed key would explain it. The touch Tag button at 812x375 (48 px) swapped Pax in and showed the 2s cooldown on the card (`phone-2v2-1.png`).
- **Phone 2v2 HUD (812x375)** is crowded but legible: life bars, SUPER %, round pips, tag cards, status pills and the hits readout all fit; the status pills (ADREN 2s, STUN, EMBER 5s) sit directly under the bars and almost touch the TAG cards. Pause and fullscreen buttons sit over the top-right HUD corner.

## Still open from r64

- 2v2 life bars the same length whatever the max life (297 / 591 / 540): still true in `tag-after-1.png`.
- Round-win pips tiny and unlabeled (the four ROUNDS circles).
- Tour fight: no stage number or continues count in the HUD; easy-stage life still lopsided (Wispera 478 vs Sindarosa 228); the FIRST BLOOD hint still overlaps the action bar bottom in `tour-fight-2.png` (r64 could not reproduce it).
- Wispera still a grainy grey blob (`tour-fight-2.png`); Fire floor lava-crack lines still hide Fiara's silhouette (`passive-Hard-3.png`).
- Help length and the missing word "tour" were not re-checked this round.
- Fixed or improved: AI passivity (r62/r63 passive-AI notes), the picker now shows an AI level control with Easy / Normal / Hard.

## Process

- `node_modules` symlinked from the main checkout (not committed). The `#heroes` route does not exist (falls back to the menu); hero selection lives in the Versus picker. After a KO `__TTE__.arena` goes undefined while the next round loads, so probes must tolerate that.

## Triage 2026-11-21 (code-checked)

Fixed: AI level control in the picker (`src/ui/screens/arcade-versus.ts:732`); Help length and "tour" word; 2v2 life bars; round pips. Dropped by owner decision (2026-11-18, no phone/portrait/touch work): every phone, portrait, 667x375 and 812x375 item, plus the touch-fight-layout e2e specs (deleted).
Open (c), carried from r63/r64:
1. Tour fight HUD shows no stage number or continues count (no stage string in `src/game/hud/` or `Hud.ts`; only the stage card and splash have it). Small: a one-line chip from the Tour run.
2. A Tag press that does nothing (healthy hero, cooldown) gives no line. `actionRefusal` (`src/game/scenes/arena-logic.ts:52`) covers Super, Weather, Charge, Elemental and Run only; add Tag there, with a test.
3. Fighters and hit numbers clipped at the left/right wall and the super punch-in cropping the caster: `src/game/fx/arena-pan.ts` follows the midpoint; wall clamp not verified in code (low confidence, needs a screenshot at x=0). Related: ideas/brainstorm/qa-r125-tag-entry-left-wall-overlap.md.
4. Hard vs Normal AI feel nearly identical (design question, no change made).
Art-only, noted: Wispera blob, Fire floor lava lines hiding Fiara.
