---
status: done
triaged: obsolete (2026-11-21: all items fixed in r45/r49 or phone-only)
added: 2026-11-14
---

# QA r44 findings (headless Chromium SwiftShader, dev server of 3ccaa118, port 7944)

Screenshots: ~/claudetmp/qa-r44/s/*.png (menu, stage-*, tag-*, super-*, tour-*, ph-*, p3-*). Menu shows exactly Play, Versus, Online, Settings, Help; no banned words seen.

r43 fixes, verified visually:
- Phone HUD glyph: FIXED. ph-fight1.png shows "SINDAROSA ▲ 286" and "ROKCORE ■ 321"; ph-fight2.png also shows both sides.
- FIGHT banner vs super: FIXED. super-a.png (GLACIER CRASH cut-in) and super-b.png (ice fan) show no FIGHT banner.
- Tour card: FIXED. "STAGE n OF 9" is now gold and readable (tour-card2.png, ph-tour-card.png); NEXT badge no longer overlaps "EARTH"; LOCKED badges sit clear of the chip text, though on the phone card (ph-tour-card.png) they are very tight against "STAGE 5 AIR" / "STAGE 9 VOID".
- First-run hint position: PARTLY. ph-fight1/2.png: the "Stick moves you..." box moved from lower-left to a wide strip across the upper-middle of the 375 px arena. It no longer sits on the fighters in the lower-left, but it still covers a big band of the play field (and the trap markers) until "Got it" is tapped. Suggest a narrower pill or auto-dismiss after first move. Desktop hint is a slim strip and fine (stage-water-hit.png; it fades in tag-1.png).

Still open:
- Fiara sprite (stage-water-hit.png, stage-air-hit.png): noisy, lower-resolution flame figure next to crisp Curomo/Echo/Pax.
- Phone portrait 390x844 (p3-fight.png): rotate overlay is clear with a "Play anyway" button; the HUD behind it is tiny, as expected.
- Phone 2v2 (ph-fight2.png): tag portraits still crowd the weather label under the HUD.

Good: desktop TAG! callout with ring and chevrons (tag-1.png), HUD glyphs, rain/gale meters and chips on water/air stages, super cut-in banners.
Page errors: 0.

## Triage 2026-11-21 (code-checked)

Fixed: phone 2v2 weather label vs tag portraits (verified r45); Fiara sprite (clean by r49).
Obsolete: phone hint strip and the portrait overlay (phone/portrait/touch work was dropped by the owner (2026-11-18)); desktop TAG! callout, glyphs and chips were already good.
Open: none.
