---
status: idea
added: 2026-11-15
---

# QA r63 scorecard (HEAD 4f8eb1dc, dev server port 7963, headless Chromium SwiftShader)

Coverage this round: World Tour (setup, stage map, VS splash, a Tour fight), Help (desktop and phone), Water and Air 1v1, a super in each element (Fire, Earth, Water, Air), tag swap on 812x375 and 390x844. Scores 0-5 versus Street Fighter / Marvel vs Capcom (r62 was 3.7 / 4.2 / 3.9). Screenshots: `~/claudetmp/qa-r63/s/` (about 40 files), scripts `~/claudetmp/qa-r63/scripts/a.mjs` and `b.mjs`. No page errors in any run. No full e2e this round.

- Fun: 3.7 (=). The supers now give a clear beat in all four elements (full-width banner, named move, element colour; Wispera's Siren Gale ends in a green ray burst plus STUN), and the Tour map with 9 stages gives a goal, but I could not confirm a tag swap on a phone (see findings).
- Graphics: 4.2 (=). Water and Air floors are as good as Fire and Earth. Held back by the pixelated Wispera sprite and Fiara's blob.
- Readability: 3.8 (-0.1). Tour map and Help are very readable; the phone 2v2 HUD crowds the life numbers against SUPER labels, and the super banner hides the fight for its whole length.

Per area (read/fun): Tour map 4.0, Help 3.5 (long, reference style), Water and Air stages 4.3, supers 4.0 fun / 3.5 read, phone landscape 2v2 3.5.
