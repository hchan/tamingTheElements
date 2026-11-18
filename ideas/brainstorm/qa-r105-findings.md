---
status: idea
added: 2026-11-17
---

# QA r105 findings

Build: main at 65c0ee8b, test mode, headless Chromium (SwiftShader), device scale 2 on phones. Shots in `.scratch/shots105/` of the r105 QA worktree (gitignored). Names: `{scene}-{desk|land|port}.png`, fights `fight-{Fire|Water|Earth|Air}-{vp}-{a|b|c}.png`, `super-{vp}-peak.png`, `tag-{vp}.png`, `2v2-{vp}-a.png`.
No console or page errors, no banned words, no horizontal overflow in any scripted run. E2E subset with 1 worker: 75 passed, 0 failed (10 spec files).

## Verified fixed or fine since r103

- Versus picker at 390: Fight!, Back and "Play online" share one row, no wrapping (`picker-port.png`); versus-layout e2e passes (r103 P1).
- Landscape Strike labels fit inside their 44 px circles ("Strike 2", "Strike 1") (`super-land-peak.png`).
- Super cut-in keeps the foe visible, dimmed, on landscape (`super-land-peak.png`, `super-desk-peak.png`); r103 P3 item 7 closed.
- Portrait Strike buttons show ability names ("Flame", "Blast") (`2v2-port-a.png`).
- Portrait floor lift reverted: the floor band ends above the action bar, nothing overlaps the Strike buttons (`2v2-port-a.png`).
- First-run toast ("FIRST BLOOD") is now see-through; the arena shows behind it (`fight-Earth-desk-c.png`); first-run-hint e2e passes.
- Desktop HUD uses one life format for both sides ("Life 286/286" and "Life 293/321") (`fight-Fire-desk-b.png`); r103 P2 item 4 closed on desktop.

## P2

1. Portrait 390x844 arena is still mostly sky; fighters small (`fight-Fire-port-b.png`, `2v2-port-a.png`). Idea: cap sky height or zoom the camera on tall aspect ratios (`src/game/scenes/Arena.ts` camera fit).
2. Portrait 2v2: bench thumbnails and TAG labels crowd under the HUD, and the action bar is two rows (`2v2-port-a.png`, `tag-port.png`). Idea: keep the Tag slot next to the Strike buttons so the bar stays one row.
3. Landscape HUD life is a bare number ("SINDAROSA 286", "ROKCORE 321") while desktop shows current/max (`super-land-peak.png`). The e2e "life reads as life (current/max), never a bare number" passes, so this may be the compact-layout rule; if intended, document it, otherwise show current/max.

## P3

4. Landscape Strike buttons say only "Strike 1 / 2" with no ability name, unlike portrait (`super-land-peak.png`; open since r102).
5. "FIRE x2", "WATER +HP", "AIR x2" chips sit in open floor and clutter the arena, especially in 2v2 (`tag-desk.png`, `fight-Water-desk-c.png`). Idea: shrink or anchor them to the zone edge.
6. Super band is clipped at the left edge in `super-land-peak.png` ("RE LANCE / FIRE"). Caveat: captured mid-animation, may be the slide-in; confirm by sampling a later frame.
7. Desktop first-run toast still sits on the lower arena floor until "Got it" (translucent now, so low severity).

## Not covered (follow up)

- Match-end win and lose cards; hero-by-hero Strike labels; a real two-browser Online connection; a later-frame super band sample at landscape.
