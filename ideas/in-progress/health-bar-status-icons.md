---
status: in-progress
added: 2026-11-12
---

# Buffs and debuffs shown on the health bar

Owner request (2026-11-12): show every active buff and debuff in the health bar. A row of small icons under (or beside) each hero's health bar: Snag root, burn, slow, weather effects, elemental buff, guard, super active and so on, each with a remaining-time sweep or number. Words or shapes as well as colour (accessibility). Read from the render view only; no sim change. Check the existing HUD (`src/game/hud`) for the bars and what status the sim already exposes before adding fields.

Epic: [street-fighter-feel](../epics/street-fighter-feel.md)

## Implementation notes (2026-11-12)

- Arcade HUD only: `src/game/hud/status-icons.ts` (pure, tested in `status-icons.test.ts`) builds up to 6 chips per hero at y 102 under the HUD block; the rest fold into a `+N more` chip. Classic keeps the old plus/cross squares.
- Each chip is shape plus word plus seconds (`+ ADREN 12s` for a buff with a solid frame, `x SLOW 3s` for a debuff with a dashed frame) and a bar along its foot that drains; high contrast uses the Okabe-Ito pair.
- Covers timed statuses (adrenaline, fire dance, rock armour, translucent, Tornado freeze, Ice Blast slow, super speed/armour, tidal slow), Snag root, stun, guard, safe, weather for the favoured or countered element, and the elemental buff. Everything was already exposed by the RenderView; no src/core change.

## Progress

- 2026-11-20: burn, venom (hostile) and mend (friendly) over-time statuses now get chips (`BURN`/`VENOM`/`MEND`), read from the existing status list; `isHostile` in buffs.ts updated. Test in status-icons.test.ts. Still open: a dedicated icon line-art for these three (art-free: could reuse CC_ICONS style), and a real-game screenshot of a burning hero.
- 2026-11-20: real-game headless screenshot (Arcade, withOverTime, burn/venom/mend granted via grantStatus) shows chips `BURN 8s`, `VENOM 6s` (red, cross) and `MEND 4s` (green, plus) under the health bar, no overlap or defect; shot at .scratch/shots/ot-chips.png.
