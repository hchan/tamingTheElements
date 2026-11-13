---
status: in-progress
added: 2026-11-13
---

# Grim grade for hero sprites and HUD portraits

Owner feedback: the hero art reads bright and cartoony, with hard black outlines, next to the grim terrain and icons.

Done (no re-bake): `src/game/fx/hero-grade.ts` copies each hero texture once to a canvas at load time, grades it and caches it as
`<key>~grim` (same approach as the action-bar icons). The grade is milder than the icons': partial desaturation (keep 0.6),
a highlight-weighted darken (0.24, so already-dark Pax stays readable), outline blacks lifted to a soft umber, and a little
hash-based grain (deterministic, no `Math.random`). Alpha is untouched. Used by `character-view` (map strips), `pose-sheets` /
`pose-layer` (baked sheets and KO ghosts) and the Hud portraits. High-contrast mode bypasses the grade (flat, strongly separated
colours are the point there); no separate setting was added.

Checked with headless real-game screenshots (Curomo/Pax, Fiara/Lavax, Sindarosa/Treenoc, Wispera/Cyclonius, Rokcore/Morblass):
element colours stay distinguishable and Fiara keeps her reference look, only duller and darker.

Next: tune the numbers on the owner's reaction, consider a baked per-race tint for the sheets that remain too bright, and a
Settings toggle if anyone asks.
