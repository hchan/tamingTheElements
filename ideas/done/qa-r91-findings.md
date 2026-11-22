---
status: done
triaged: superseded (portrait/touch dropped; rest fixed or tracked)
added: 2026-11-17
---

# QA r91 findings (main fbc2085d)

Scores are in [qa-r91-scorecard.md](qa-r91-scorecard.md). No code changed.

## Fixes verified

- r89 P1 and r90 P1 (portrait whole hero name): at 390x844 and 360x640 the full-life names read "SINDAROSA 286" and "ROKCORE 321"; at 40% HP the labels have no ellipsis (`heroLabels()` and `p360-hit.png`, `p390-hit.png`). In the screenshots the hurt state shows "SINDAROSA 114" and "ROKCORE 128" whole. A LOW/HURT status word was not caught on screen in this run, so the status-word-beats-name case is covered only by the e2e test (passed).
- Versus footer: slim Fight!/Back row on both phones, first hero card in the first viewport (`p390-versus.png`, `p360-versus.png`; e2e passed).

## Ranked findings

P1. Phone Tour fight starts behind the "Rotate your device" gate. After the Tour splash on a portrait phone the arena sits under the overlay until "Play anyway" is tapped, even in a flow where the player already chose to play. `q360-tourfight.png`. Idea: remember the choice for the session, or skip the gate for Tour after the first dismissal.

P2. First-fight tutorial card collides with the super banner on portrait phone: "HELLFIRE LANCE / FIRE" renders behind the FIRST BLOOD card, so the super cut-in is unreadable on the first super. `p390-super.png`. Idea: hold the cut-in above the card or auto-dismiss the card on the first super.

P2. Portrait arena is mostly empty: at 390x844 roughly a third of the canvas is dark sky between HUD and fighters, and fighters are small. `p390-start.png`. Idea: crop the arena vertically or enlarge the sprites in portrait.

P3. Super cut-in is still a thin banner versus MvC's full-screen portrait slam (carried from r90). `d-2v2-super-15.png`.

P3. Help jump chips: the second chip ("Ways to...") is cut off at the right edge at 390 wide, with no scroll hint. `p390-help.png`.

P3. Versus: the "More below" chip overlaps the edge of the footer and the next card at 390 and 360. `p390-versus.png`, `p360-versus.png`.

P3. Sindarosa red wings on Fire and Earth stages have low contrast (carried from r90). `d-Fire-fight.png`.

## Coverage notes

Done: menu, Versus picker, hero select, 1v1 on all four stages (desktop), 2v2 with tag swap and super, Tour pick, card, splash and a desktop Tour fight, Help, phone 390x844 and 360x640 (menu, Versus, fight, hurt, super, Help, Tour card). Phone Tour fight reached the arena but only the rotate gate was captured. Not covered: match-end screen, Online, round-end flow (covered in r90).

## e2e subset

`E2E_PORT=7961 playwright test portrait-play versus-portrait-grid phone-layout super-band-portrait menu-phone-row tour-fight-match --workers=1`: 37 passed (3.2 min), 0 failed.

## Triage 2026-11-21 (code-checked)

Fixed: whole portrait HUD names, Versus footer, first-run card vs super banner (r92), Help chips (r92 to r97). Dropped (phone/portrait): rotate gate before Tour fight, empty portrait sky, More-below chip, Help chip clipping. Art/design only, tracked: super cut-in banner (`ideas/brainstorm/sf-super-cinematics.md`), Sindarosa wings (`ideas/brainstorm/qa-r128-fire-stage-hero-blend.md`).
Open: none.
