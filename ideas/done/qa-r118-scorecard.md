# QA r118 scorecard (0-5 vs Street Fighter / Marvel vs Capcom)
status: done
triaged: d (scorecard only, duplicates qa-r118-findings.md; open items tracked there)
added: 2026-11-19

Desktop 1280x720, headless, main 43a2899d. Details in qa-r118-findings.md. Screenshots in `.scratch/qa-r118/`.

| Screen | Fun | Graphics | Readability | Note |
|---|---|---|---|---|
| Menu (`01-menu.png`) | 3 | 4 | 5 | Five entries, no banned words, clean. |
| Versus/hero select (`02-versus.png`) | 3 | 3 | 3 | Dense; "More below" chip overlaps text. |
| Tour setup (`s-Play.png`, `tour-1.png`) | 3 | 4 | 4 | Good stage ladder; picker chip overlaps "Enter" tag. |
| 1v1 Fire (`fire-t300.png`) | 3 | 4 | 4 | Strong lava stage; combo counter and burst glyphs busy. |
| 1v1 Water (`watercuromo-t300.png`) | 3 | 4 | 4 | Clean; foe approach slow at start. |
| 1v1 Earth (`earthPax-t500.png`) | 3 | 4 | 3 | Foe clipped at edge, ROCKFALL label over it. |
| 1v1 Air (`airEcho-t750.png`) | 3 | 4 | 3 | Pale, low contrast on floor; chars small vs stage. |
| Tag swap (`2v2-tagA10.png`) | 4 | 4 | 4 | Clear TAG! call and bench state. |
| Super (`2v2-super0.png`) | 4 | 4 | 3 | Cut-in works; combo text collides with FIRE label. |
| 2v2 (`2v2-super1.png`) | 4 | 4 | 4 | HUD team strip readable. |
| Tour fight (`tour-4.png`) | 3 | 4 | 4 | Long dead walk to meet foe. |
| Help (`help-00.png`) | 2 | 3 | 3 | Chip row 4/1/4 orphan; text clean of banned words. |
| Online (`s-Online.png`) | 3 | 3 | 5 | Simple, two big buttons. |
| Settings (`s-Settings.png`) | 2 | 3 | 4 | Functional. |

Overall: fun 3.2, graphics 3.7, readability 3.8. Smoke: PC, 15 passed. No console errors.
