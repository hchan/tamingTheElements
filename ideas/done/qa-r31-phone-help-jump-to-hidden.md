---
status: done
added: 2026-11-14
---

# Help 'Jump to' row is hidden on phone

On 844x390 the Jump to row has a 0x0 box (hidden); only the Key Bindings/Guide/Wiki tab row shows, so the in-page section jumps are not reachable on phone. On desktop it shows fine. Show a compact horizontally scrolling Jump to row on phone, or a select. Shots: /Users/henry.chan/claudetmp/qa31/help-p.png, help-d.png.

Resolved 2026-11-14: the Jump to row now shows on short phone landscape as one slim sideways-scrolling line under the sticky tab row (help.css, flex order; DOM unchanged). Also fixed the top Back link, which the coarse-pointer inline-flex rule had kept visible. e2e help-controls pins the row and a jump; the first-heading bound moved from 40 to 50 percent of the height to make room for it.
