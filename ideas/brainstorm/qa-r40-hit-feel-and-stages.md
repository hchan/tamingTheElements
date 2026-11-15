---
status: idea
added: 2026-11-14
---

# QA r40 hit feel and stages

Screenshots: ~/claudetmp/qa-r40/s/hit-{2,4,6,8,13}.png (Pax vs Rokcore on lava), stage-*-hit.png, super-*.png.

- Hit pop: Pax special lands a very large "38" with a white starburst and an arena-edge dashed AoE box; Rokcore shows a yellow chip on its life bar and a STUN tag. Reads as an event. The burst is still a flat white fan; a short ember or rock shard layer tied to the defender element would add texture.
- Stills cannot show lunge or hit-stop. A capture test (hit-feel-capture) exists; add an assertion for the attacker's displacement over frames so a regression is caught.
- Terrain chips: contrast fixed on the pale gale stage (AIR x2 dark pills with a light border). On rain (WATER +HP) the pills read well; the underlying tile patches are faint, so the glyph inside each patch matters more than the patch.
- Earth (sand) stage: Rokcore spawn zone is clear of tall props; the crystal prop sits at mid-right, not in a spawn. Sand stage banner pills "SAND +20%" and "SAND 9" read.
- In the 2v2 start frame the "FIRE x2" chip at x=595 overlaps the Fiara foe silhouette edge (chip over a character): chips should draw below characters.
- Super frame: "FIGHT!" intro text is drawn under the super effect at tick ~91; harmless but looks like overlapping text.
