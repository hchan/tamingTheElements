---
status: done
added: 2026-11-14
---

# Rokcore hit shows no spark or number

In a Rokcore vs Pax hit at 1280 and 844 the sprites overlap with a small dust puff and no damage number or spark; the sprites merge into one blob so it is unclear who hits whom. Add a hit spark and number, and a small push-back. Shots: /Users/henry.chan/claudetmp/qa31/hit-rokcore-1280.png, hit-rokcore-844.png.

## Resolution (2026-11-14)
The hit spark and number already existed; the number was pale on the pale earth floor. Numbers now use a 4 px dark outline and black glow (combat-text.ts). Push-back is a sim change (src/core), not done here.
