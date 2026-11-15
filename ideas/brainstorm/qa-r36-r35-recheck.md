---
status: idea
added: 2026-11-14
---

# QA r36: r35 fix re-check

- PAX/TAG call no longer covers fighters or damage numbers: PASS. The call sits high (about y 240 at 720p), above the fighters and the damage numbers (t2-1280-ko0.png, t2-844-ko0.png).
- BUT the call is clipped at the left edge: "SINDAROSA IN!" shows as "DAROSA IN!" at 150 ms and "INDAROSA IN!" at about 450 ms (t2-1280-ko0.png, t2-1280-ko2.png). Long hero names overflow the left edge; centre-clamp the text. Medium.
- First-run card appears after FIGHT!: PASS. The intro (ROUND 1, name cards) is clear (rt-earth-1500.png); the card shows once the fight runs (stage-water-idle.png).
- On 667x375 the card (docked low-centre) still sits over the fighters during the first exchange (phone-667-t3500.png). Consider auto-fade on first input or docking to a corner. Low-medium.
- Phone HUD names: the automated check passes (9.5 px) but names still truncate: "SI... 62/210 HURT" at 667, "SINDARO..." at 844 (phone-667-t3500.png, t2-844-ko0.png). Hero names are the main SF-style identifier; shrink the life text or drop the element glyph to fit the name. Medium.
- At 667 the Pause button overlaps the "2 HITS / 148 DMG" streak counter at top right (phone-667-t3500.png). Medium.
- Kit-named action bar: PASS (Blast / Flame / Tag, Ice Shock / Snag / Charge, Rock Armr / Pellet, Hurricane / Gale).
- Plain-hit streak/recoil/hit-stop: streak counter and burst read well (rt-air-hit7.png); recoil is subtle, hit-stop is not visible in stills.
- Minor: the "WATER +HP" / "AIR x2" pad labels fight with the floor art (stage-water-idle.png); "Can't swap: stunned" sits at the far left bottom in a plain font (tag-swap-100.png).
