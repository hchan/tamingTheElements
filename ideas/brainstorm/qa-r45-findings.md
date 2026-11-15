---
status: idea
added: 2026-11-14
---

# QA r45 findings (headless Chromium SwiftShader, dev server of bcc93350, port 7946)

Screenshots: ~/claudetmp/qa-r45/s/*.png (menu, help, stage-*, 2v2-*, tag-*, super-*, tour-*, ph-*, p3-*).

r44 leftovers, verified:
- Phone 2v2 weather label: FIXED. ph-fight2.png: "WEATHER 0%" now sits clear below the tag portraits.
- Tour LOCKED/NEXT badges: FIXED. ph-tour-card.png: badges have clear space from "STAGE n ELEMENT" text on all nine chips.
- Phone first-run hint: STILL OPEN (partly). ph-fight1.png / ph-fight2.png: the box is now a wide upper-left strip (about 250 px wide, 45 px tall), but it still covers the arena upper-left and the trap markers, and the fighters work there. The e2e only checks it stays out of the lower area. Suggest a one-line pill or auto-dismiss on first stick move.
- Desktop hint: fine slim strip above the bar (stage-water-hit.png, stage-earth-hit.png).

New observations (low severity):
- Hit feedback: in stage-fire-hit / stage-earth-hit.png (4 strike frames) no spark or number is visible on the target; the still frame cannot show it, worth a check with a 1-2 frame capture at impact.
- Desktop 2v2 (2v2-hit.png): tag portraits sit under the Super meters and compete with the round pips; fine but crowded. The "FADE 2s" status chip floats on the left with no clear owner.
- Water stage: the RAIN +20% / -17% chips and the RAIN 9 meter plus WEATHER 0% make four weather items in one band (stage-water-hit.png); readable but busy.
- Fiara sprite is still noisy next to Curomo/Rokcore (stage-water-hit.png).
- Portrait 390x844 (p3-fight.png): rotate overlay with "Play anyway" works.

Good: TAG! callout, super cut-in and ice fan (super-b.png), stage palettes for all four elements, Tour card at 667x375.
Page errors: 0. e2e subset all green (see scorecard).
