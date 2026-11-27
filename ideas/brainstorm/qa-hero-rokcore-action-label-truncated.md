---
status: idea
added: 2026-11-27
---

# Rokcore: slot 1 label shows "Rock Armr 15s" (clipped word)

## Evidence
- Screenshot `.scratch/qa-heroes-4/rokcore-ability-16-E-t8.png` (Arcade Versus, rokcore vs fiara, tick ~8 after casting slot 1).
- The action bar caption under slot 1 reads "Rock Armr 15s": the ability name is cut to fit the cooldown suffix, so the word is misspelled on screen.
- The other five heroes' slot captions (Blast, Flame 6s, Tornado 7s, Dance 16s) are whole words.

## Suspected cause
The action bar caption builder truncates "Rock Armour" plus the cooldown seconds to a fixed width instead of shrinking the font or using a short name. Not located in code (QA pass was read-only, limited tool budget).

## Severity
minor
